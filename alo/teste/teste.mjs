/* Teste de ponta a ponta do Alô, com um Supabase de mentira.
   Veja teste/README.md para rodar. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const AQUI = path.dirname(new URL(import.meta.url).pathname);
const RAIZ = path.resolve(AQUI, '..');
const MOCK = path.join(AQUI, 'mock-supabase.js');
const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.webmanifest':'application/manifest+json', '.sql':'text/plain', '.md':'text/plain' };

const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' ) p = '/index.html';
  const arq = path.join(RAIZ, p);
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
    res.writeHead(404); res.end('nao encontrado'); return;
  }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
  res.end(fs.readFileSync(arq));
});
await new Promise(r => servidor.listen(4173, r));

// CHROME=/caminho/do/chrome se o Playwright não achar sozinho.
const navegador = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const pagina = await navegador.newPage({ viewport: { width: 1100, height: 780 } });

const erros = [];
pagina.on('pageerror', e => erros.push('pageerror: ' + e.message));
pagina.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
pagina.on('response', r => { if (r.status() === 404) erros.push('404: ' + r.url()); });

// Todo import do cliente Supabase cai no nosso duble.
await pagina.route('**/@supabase/supabase-js**', rota => rota.fulfill({
  status: 200, contentType: 'text/javascript', body: fs.readFileSync(MOCK, 'utf8'),
}));

const passos = [];
const ok = (nome, cond) => { passos.push([cond ? 'PASSOU' : 'FALHOU', nome]); };

// ——— 1. Sem config, aparece a tela de configuração ———
await pagina.goto('http://localhost:4173/');
await pagina.waitForTimeout(400);
ok('tela de config aparece sem chaves', await pagina.isVisible('#tela-config'));

// ——— 2. Validação da URL ———
await pagina.fill('#campo-url', 'nao-e-url');
await pagina.fill('#campo-chave', 'chave-curta');
await pagina.click('#botao-config');
ok('URL inválida é recusada', (await pagina.textContent('#erro-config')).includes('https://'));

// ——— 3. Config válida leva à tela de apelido ———
await pagina.fill('#campo-url', 'https://exemplo.supabase.co');
await pagina.fill('#campo-chave', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa');
await pagina.click('#botao-config');
await pagina.waitForSelector('#tela-entrada:not([hidden])', { timeout: 5000 });
ok('config válida leva ao apelido', await pagina.isVisible('#tela-entrada'));

// ——— 4. Apelido curto é barrado no cliente ———
await pagina.fill('#campo-apelido', 'x');
await pagina.click('#botao-entrar');
await pagina.waitForTimeout(200);
ok('apelido de 1 letra não passa', await pagina.isVisible('#tela-entrada'));
await pagina.fill('#campo-apelido', '  x  ');   // passa no minlength, encolhe no trim
await pagina.click('#botao-entrar');
await pagina.waitForTimeout(200);
ok('apelido que encolhe no trim é barrado', (await pagina.textContent('#erro-entrada')).includes('2 a 24'));

// ——— 5. Apelido já usado devolve mensagem clara (erro 23505) ———
await pagina.fill('#campo-apelido', 'Maria');
await pagina.click('#botao-entrar');
await pagina.waitForTimeout(300);
ok('apelido duplicado é explicado', (await pagina.textContent('#erro-entrada')).includes('já é de outra pessoa'));

// ——— 6. Entrada boa abre o app ———
await pagina.fill('#campo-apelido', 'Gilson');
await pagina.click('#botao-entrar');
await pagina.waitForSelector('#tela-app:not([hidden])', { timeout: 5000 });
await pagina.waitForTimeout(500);
ok('app abre depois de entrar', await pagina.isVisible('#tela-app'));
ok('nome aparece no rodapé', (await pagina.textContent('#meu-nome')) === 'Gilson');
ok('as 3 salas aparecem', (await pagina.$$('.sala')).length === 3);
ok('histórico da sala carrega', (await pagina.$$('.balao')).length === 2);

// ——— 7. XSS: o HTML de outra pessoa vira texto, não marcação ———
const temNegrito = await pagina.$('.balao-autor b');
const temImg = await pagina.$('.balao img');
ok('HTML no apelido não é interpretado', temNegrito === null);
ok('HTML no corpo não é interpretado', temImg === null);
ok('o texto bruto aparece como escrito',
  (await pagina.textContent('.balao-corpo')).includes('<img src=x'));

// ——— 8. Separador de dia ———
ok('separadores de dia aparecem', (await pagina.$$('.dia')).length === 2);

// ——— 9. Enviar mensagem ———
await pagina.fill('#campo-mensagem', 'Alô, mundo!');
await pagina.click('#botao-enviar');
await pagina.waitForTimeout(400);
ok('mensagem enviada aparece', (await pagina.$$('.balao')).length === 3);
ok('mensagem própria fica à direita', (await pagina.$$('.balao.minha')).length === 1);
ok('campo esvazia após enviar', (await pagina.inputValue('#campo-mensagem')) === '');
ok('nenhum balão fica preso em "enviando"', (await pagina.$$('.balao.enviando')).length === 0);

// ——— 10. Recusa do banco: aviso e texto devolvido ———
await pagina.fill('#campo-mensagem', 'RECUSAR');
await pagina.click('#botao-enviar');
await pagina.waitForTimeout(400);
ok('erro do banco vira aviso', (await pagina.textContent('#aviso')).includes('um recado de cada vez'));
ok('texto recusado volta para o campo', (await pagina.inputValue('#campo-mensagem')) === 'RECUSAR');
ok('balão recusado é removido', (await pagina.$$('.balao')).length === 3);

// ——— 11. Trocar de sala ———
await pagina.fill('#campo-mensagem', '');
await pagina.click('.sala:nth-child(2)');
await pagina.waitForTimeout(400);
ok('troca de sala muda o título', (await pagina.textContent('#titulo-sala')) === 'Recados');
ok('a outra sala tem o próprio histórico', (await pagina.$$('.balao')).length === 1);

// ——— 12. Presença ———
ok('presença mostra quem está', (await pagina.textContent('#contagem-presenca')) === '1');
ok('presença diz em que sala', (await pagina.textContent('.pessoa')).includes('Recados'));

// ——— 13. Mensagem chegando pelo tempo real ———
await pagina.click('.sala:nth-child(1)');
await pagina.waitForTimeout(300);
const antes = (await pagina.$$('.balao')).length;
await pagina.evaluate(() => {
  const canal = window.__mock.canais.find(c => c.nome === 'alo-mensagens');
  canal.ouvintes[0].cb({ new: { id: 999, sala_id: 'geral', autor_id: 'outro',
    autor_apelido: 'Ana', corpo: 'Cheguei agora', criado_em: new Date().toISOString() } });
});
await pagina.waitForTimeout(300);
ok('mensagem do tempo real entra na tela', (await pagina.$$('.balao')).length === antes + 1);

// ——— 14. Não lidas em outra sala ———
await pagina.click('.sala:nth-child(3)');
await pagina.waitForTimeout(300);
await pagina.evaluate(() => {
  const canal = window.__mock.canais.find(c => c.nome === 'alo-mensagens');
  canal.ouvintes[0].cb({ new: { id: 1001, sala_id: 'geral', autor_id: 'outro',
    autor_apelido: 'Ana', corpo: 'Oi de novo', criado_em: new Date().toISOString() } });
});
await pagina.waitForTimeout(300);
ok('selo de não lidas aparece', (await pagina.$$('.nao-lidas')).length === 1);

// ——— 15. Duplicata do tempo real não duplica na tela ———
await pagina.click('.sala:nth-child(1)');
await pagina.waitForTimeout(300);
const total = (await pagina.$$('.balao')).length;
await pagina.evaluate(() => {
  const canal = window.__mock.canais.find(c => c.nome === 'alo-mensagens');
  const repetida = { id: 999, sala_id: 'geral', autor_id: 'outro',
    autor_apelido: 'Ana', corpo: 'Cheguei agora', criado_em: new Date().toISOString() };
  canal.ouvintes[0].cb({ new: repetida });
});
await pagina.waitForTimeout(300);
ok('mensagem repetida não duplica', (await pagina.$$('.balao')).length === total);

// ——— 16. Sessão lembrada ao recarregar ———
await pagina.reload();
await pagina.waitForSelector('#tela-app:not([hidden])', { timeout: 5000 });
ok('volta direto ao app ao recarregar', (await pagina.textContent('#meu-nome')) === 'Gilson');

// ——— 17. Sala que recebeu mensagem sem nunca ter sido aberta ———
// Antes, a mensagem do tempo real criava a lista da sala e o histórico
// nunca era buscado: a sala abria mostrando só aquela mensagem.
await pagina.evaluate(() => {
  const canal = window.__mock.canais.find(c => c.nome === 'alo-mensagens');
  canal.ouvintes[0].cb({ new: { id: 1500, sala_id: 'cafe', autor_id: 'outro',
    autor_apelido: 'Ana', corpo: 'Tem café?', criado_em: new Date().toISOString() } });
});
await pagina.waitForTimeout(200);
await pagina.click('.sala:nth-child(3)');   // Café, nunca aberta nesta sessão
await pagina.waitForTimeout(500);
const noCafe = await pagina.$$eval('.balao-corpo', ns => ns.map(n => n.textContent));
ok('sala nova ainda carrega o histórico', noCafe.length >= 1);
ok('a mensagem do tempo real continua lá', noCafe.includes('Tem café?'));

// ——— 18. Trocar de apelido ———
await pagina.evaluate(() => { window.prompt = () => 'Gilson Novo'; });
await pagina.click('#botao-sair');
await pagina.waitForTimeout(400);
ok('trocar apelido atualiza o rodapé', (await pagina.textContent('#meu-nome')) === 'Gilson Novo');
ok('trocar apelido não apaga o histórico', (await pagina.$$('.balao')).length === noCafe.length);

// ——— 19. Apelido já usado na troca ———
await pagina.evaluate(() => { window.prompt = () => 'Maria'; });
await pagina.click('#botao-sair');
await pagina.waitForTimeout(400);
ok('troca para apelido ocupado é recusada', (await pagina.textContent('#aviso')).includes('já é de outra pessoa'));
ok('apelido antigo é mantido na recusa', (await pagina.textContent('#meu-nome')) === 'Gilson Novo');

await pagina.click('.sala:nth-child(1)');
await pagina.waitForTimeout(300);
await pagina.screenshot({ path: path.join(AQUI, 'mesa.png') });

// ——— 20. Telefone: uma coluna de cada vez ———
await pagina.setViewportSize({ width: 390, height: 780 });
await pagina.waitForTimeout(300);
ok('no telefone aparece o botão voltar', await pagina.isVisible('#botao-voltar'));
await pagina.click('#botao-voltar');
await pagina.waitForTimeout(300);
ok('voltar mostra a lista de salas', await pagina.isVisible('#lista-salas'));
ok('voltar esconde a conversa', !(await pagina.isVisible('#mensagens')));
await pagina.screenshot({ path: path.join(AQUI, 'telefone.png') });

console.log('\n———— RESULTADO ————');
for (const [r, n] of passos) console.log(`${r === 'PASSOU' ? '  ok  ' : ' FALHA'} ${n}`);
const falhas = passos.filter(p => p[0] === 'FALHOU').length;
console.log(`\n${passos.length - falhas}/${passos.length} passaram`);
if (erros.length) { console.log('\n———— ERROS NO NAVEGADOR ————'); erros.forEach(e => console.log('  ' + e)); }

await navegador.close();
servidor.close();
process.exit(falhas || erros.length ? 1 : 0);
