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

// Conta as notas tocadas, para conferir o som sem ouvir.
await pagina.addInitScript(() => {
  window.__notas = 0;
  const original = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () {
    window.__notas += 1;
    return original.call(this);
  };
});

// Todo import do cliente Supabase cai no nosso duble.
await pagina.route('**/@supabase/supabase-js**', rota => rota.fulfill({
  status: 200, contentType: 'text/javascript', body: fs.readFileSync(MOCK, 'utf8'),
}));

// O config.js publicado aponta para o banco de verdade; o teste parte
// sempre do vazio, para passar pelo assistente.
await pagina.route('**/config.js', rota => rota.fulfill({
  status: 200, contentType: 'text/javascript',
  body: "globalThis.ALO_CONFIG = { url: '', anonKey: '' };",
}));

const passos = [];
const ok = (nome, cond) => { passos.push([cond ? 'PASSOU' : 'FALHOU', nome]); };

// ——— 1. Sem config, aparece o assistente ———
await pagina.goto('http://localhost:4173/');
await pagina.waitForTimeout(400);
ok('assistente aparece sem chaves', await pagina.isVisible('#tela-config'));
ok('os 4 passos aparecem', (await pagina.$$('.passo')).length === 4);

// ——— 2. Endereço malformado ———
await pagina.fill('#campo-url', 'nao-e-url');
await pagina.fill('#campo-chave', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa');
await pagina.click('#botao-config');
await pagina.waitForTimeout(200);
ok('endereço errado é apontado', (await pagina.textContent('#resultado-config')).includes('não parece certo'));
ok('o passo 4 acende', await pagina.isVisible('.passo:nth-child(4).passo-pendente'));

// ——— 3. Chave errada (service_role) ———
await pagina.fill('#campo-url', 'https://exemplo.supabase.co');
await pagina.fill('#campo-chave', 'sb_secret_abcdefghijklmnop');
await pagina.click('#botao-config');
await pagina.waitForTimeout(200);
ok('service_role é recusada', (await pagina.textContent('#resultado-config')).includes('chave errada'));

// ——— 4. Passo 3 esquecido: entrada anônima desligada ———
await pagina.evaluate(() => { window.__falha = 'anonimo'; });
await pagina.fill('#campo-chave', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa');
await pagina.click('#botao-config');
await pagina.waitForTimeout(600);
ok('diz que falta o passo 3', (await pagina.textContent('#resultado-config')).includes('Falta o passo 3'));
ok('o passo 3 acende', await pagina.isVisible('.passo:nth-child(3).passo-pendente'));

// ——— 5. Passo 2 esquecido: tabelas não criadas ———
await pagina.evaluate(() => { window.__falha = 'tabelas'; });
await pagina.click('#botao-config');
await pagina.waitForTimeout(600);
ok('diz que falta o passo 2', (await pagina.textContent('#resultado-config')).includes('Falta o passo 2'));
ok('o passo 2 acende', await pagina.isVisible('.passo:nth-child(2).passo-pendente'));

// ——— 6. Botão de copiar o SQL ———
await pagina.evaluate(() => { window.__falha = null; });
await pagina.click('#botao-copiar-sql');
await pagina.waitForTimeout(400);
ok('copiar o SQL confirma na tela', (await pagina.textContent('#botao-copiar-sql')).includes('Copiado'));

// ——— 7. Tudo certo: segue para o apelido ———
await pagina.click('#botao-config');
await pagina.waitForTimeout(500);
ok('conferência aprova', (await pagina.textContent('#resultado-config')).includes('Tudo certo'));
await pagina.waitForSelector('#tela-entrada:not([hidden])', { timeout: 6000 });
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

// ——— 20. Som ao receber mensagem ———
const notas = () => pagina.evaluate(() => window.__notas);
const chegar = (id, sala_id, autor_id) => pagina.evaluate(m => {
  const canal = window.__mock.canais.find(c => c.nome === 'alo-mensagens');
  canal.ouvintes[0].cb({ new: { ...m, autor_apelido: 'Ana', corpo: 'som ' + m.id,
    criado_em: new Date().toISOString() } });
}, { id, sala_id, autor_id });

await pagina.waitForTimeout(1300);
let antesDoSom = await notas();
await chegar(3000, 'geral', 'outro');
await pagina.waitForTimeout(200);
ok('som toca quando outra pessoa escreve', (await notas()) === antesDoSom + 1);

await pagina.waitForTimeout(1300);
antesDoSom = await notas();
await chegar(3001, 'geral', 'eu-123');
await pagina.waitForTimeout(200);
ok('a própria mensagem não toca som', (await notas()) === antesDoSom);

await chegar(3002, 'geral', 'outro');
await chegar(3003, 'recados', 'outro');
await pagina.waitForTimeout(200);
ok('rajada de mensagens toca uma vez só', (await notas()) === antesDoSom + 1);

await pagina.click('#botao-som');
ok('botão desliga o som', (await pagina.getAttribute('#botao-som', 'aria-pressed')) === 'false');
await pagina.waitForTimeout(1300);
antesDoSom = await notas();
await chegar(3004, 'geral', 'outro');
await pagina.waitForTimeout(200);
ok('som desligado fica em silêncio', (await notas()) === antesDoSom);

await pagina.click('#botao-som');
await pagina.waitForTimeout(200);
ok('religar toca uma amostra', (await notas()) > antesDoSom);

// ——— 21. Sala privada: criar, convidar, falar ———
await pagina.evaluate(() => { window.prompt = () => 'Família'; });
await pagina.click('#botao-nova-sala');
await pagina.waitForTimeout(400);
ok('sala privada aparece na lista dela', (await pagina.textContent('#lista-privadas')).includes('Família'));
ok('sala privada abre ao ser criada', (await pagina.textContent('#titulo-sala')) === 'Família');
ok('sala pública não ganha a privada', (await pagina.$$('#lista-salas .sala')).length === 3);
ok('dica some quando há sala privada', !(await pagina.isVisible('#dica-privadas')));
ok('presença não revela a sala privada', await pagina.evaluate(() =>
  window.__mock.canais.find(c => c.nome === 'alo-presenca').rastreado.sala === null));

await pagina.evaluate(() => {
  window.__copiado = null;
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  navigator.clipboard.writeText = async t => { window.__copiado = t; };
});
await pagina.click('#botao-opcoes');
ok('dono vê "apagar" e não "sair"',
  await pagina.isVisible('#opcao-apagar') && !(await pagina.isVisible('#opcao-sair')));
await pagina.click('#opcao-convidar');
await pagina.waitForTimeout(200);
const link = await pagina.evaluate(() => window.__copiado);
ok('convidar copia o link com o código', /#convite=[0-9a-f]{64}$/.test(link || ''));
ok('menu fecha depois de escolher', !(await pagina.isVisible('#opcoes-sala')));

await pagina.evaluate(() => { window.confirm = () => true; });
await pagina.click('#botao-opcoes');
await pagina.click('#opcao-novo-link');
await pagina.waitForTimeout(200);
await pagina.click('#botao-opcoes');
await pagina.click('#opcao-convidar');
await pagina.waitForTimeout(200);
ok('link novo é outro', (await pagina.evaluate(() => window.__copiado)) !== link);

await pagina.fill('#campo-mensagem', 'Só nós aqui');
await pagina.click('#botao-enviar');
await pagina.waitForTimeout(300);
ok('mensagem vai para a sala privada', await pagina.evaluate(() =>
  window.__mock.mensagens.some(m => m.sala_id.startsWith('priv-') && m.corpo === 'Só nós aqui')));

// ——— 22. Conversa a sós pelo nome na presença ———
await pagina.evaluate(() => {
  window.__mock.presentes.push({ id: 'ana-1', apelido: 'Ana', sala: 'geral' });
  const c = window.__mock.canais.find(c => c.nome === 'alo-presenca');
  c.ouvintes.find(o => o.tipo === 'presence').cb();
});
await pagina.waitForTimeout(200);
await pagina.click('.pessoa-botao');
await pagina.waitForTimeout(400);
ok('conversa a sós tem o nome da pessoa', (await pagina.textContent('#titulo-sala')) === 'Ana');
ok('conversa a sós aparece na lista dela', (await pagina.textContent('#lista-conversas')).includes('Ana'));
ok('não dá para conversar consigo mesmo', (await pagina.$$('.pessoa-botao')).length === 1);

// Mensagem de uma conversa que ainda não está na lista traz a sala.
await pagina.evaluate(() => {
  window.__mock.salas.push({ id: 'dm:eu-123:joao', titulo: 'Conversa', subtitulo: '', ordem: 0,
    tipo: 'individual', membros: [{ perfil_id: 'eu-123', perfis: { apelido: 'Gilson Novo' } },
      { perfil_id: 'joao', perfis: { apelido: 'João' } }] });
  const canal = window.__mock.canais.find(c => c.nome === 'alo-mensagens');
  canal.ouvintes[0].cb({ new: { id: 2000, sala_id: 'dm:eu-123:joao', autor_id: 'joao',
    autor_apelido: 'João', corpo: 'Oi, só pra você', criado_em: new Date().toISOString() } });
});
await pagina.waitForTimeout(400);
ok('conversa nova chega sozinha', (await pagina.textContent('#lista-conversas')).includes('João'));

// ——— 23. Entrar por link de convite ———
await pagina.goto('http://localhost:4173/#convite=' + 'b'.repeat(64));
await pagina.waitForSelector('#tela-app:not([hidden])', { timeout: 5000 });
await pagina.waitForTimeout(500);
ok('convite abre a sala certa', (await pagina.textContent('#titulo-sala')) === 'Turma');
ok('código sai do endereço', !(await pagina.evaluate(() => location.hash)));
await pagina.click('#botao-opcoes');
ok('membro vê "sair" e não "apagar"',
  await pagina.isVisible('#opcao-sair') && !(await pagina.isVisible('#opcao-apagar')));
await pagina.evaluate(() => { window.confirm = () => true; });
await pagina.click('#opcao-sair');
await pagina.waitForTimeout(400);
ok('quem sai deixa de ver a sala', !(await pagina.textContent('#lista-privadas')).includes('Turma'));
ok('sair leva de volta para uma sala aberta', (await pagina.textContent('#titulo-sala')) === 'Geral');

await pagina.goto('http://localhost:4173/#convite=' + 'f'.repeat(64));
await pagina.waitForSelector('#tela-app:not([hidden])', { timeout: 5000 });
await pagina.waitForTimeout(500);
ok('convite inválido é explicado', (await pagina.textContent('#aviso')).includes('não vale'));

// ——— 24. Apagar a própria sala ———
await pagina.click('#lista-privadas .sala');
await pagina.waitForTimeout(300);
await pagina.evaluate(() => { window.confirm = () => true; });
await pagina.click('#botao-opcoes');
await pagina.click('#opcao-apagar');
await pagina.waitForTimeout(400);
ok('sala apagada some da lista', (await pagina.$$('#lista-privadas .sala')).length === 0);

// ——— 25. Abrir o app já pelo link de convite (carga do zero) ———
await pagina.evaluate(c => history.replaceState(null, '', '/#convite=' + c), 'b'.repeat(64));
await pagina.reload();
await pagina.waitForSelector('#tela-app:not([hidden])', { timeout: 5000 });
await pagina.waitForTimeout(500);
ok('link de convite funciona ao abrir o app', (await pagina.textContent('#titulo-sala')) === 'Turma');
ok('a sala do convite entra na lista', (await pagina.textContent('#lista-privadas')).includes('Turma'));

await pagina.click('.sala:nth-child(1)');
await pagina.waitForTimeout(300);
await pagina.screenshot({ path: path.join(AQUI, 'mesa.png') });

// ——— 26. Telefone: uma coluna de cada vez ———
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
