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

// ——— 20b. Apagar mensagens ———
ok('quem não é admin não vê a portaria', !(await pagina.isVisible('#botao-admin')));
await pagina.click('.sala:nth-child(1)');   // Geral, onde chegaram as mensagens do som
await pagina.waitForTimeout(300);
await pagina.evaluate(() => { window.confirm = () => true; });
await pagina.fill('#campo-mensagem', 'para apagar');
await pagina.click('#botao-enviar');
await pagina.waitForTimeout(300);
ok('só as próprias mensagens têm "apagar"',
  (await pagina.$$('.balao:not(.minha) .balao-apagar')).length === 0 &&
  (await pagina.$$('.balao.minha .balao-apagar')).length > 0);
const antesDeApagar = (await pagina.$$('.balao')).length;
await pagina.locator('.balao.minha', { hasText: 'para apagar' }).locator('.balao-apagar').click();
await pagina.waitForTimeout(300);
ok('apagar tira a mensagem da tela', (await pagina.$$('.balao')).length === antesDeApagar - 1);
ok('apagar tira a mensagem do banco', await pagina.evaluate(() =>
  !window.__mock.mensagens.some(m => m.corpo === 'para apagar')));

const comAna = (await pagina.$$eval('.balao-corpo', ns => ns.map(n => n.textContent)))
  .filter(c => c === 'som 3000').length;
await pagina.evaluate(() => {
  const canal = window.__mock.canais.find(c => c.nome === 'alo-mensagens');
  canal.ouvintes.find(o => o.filtro?.event === 'DELETE').cb({ old: { id: 3000 } });
});
await pagina.waitForTimeout(200);
ok('mensagem apagada por outra pessoa some sozinha', comAna === 1 &&
  !(await pagina.$$eval('.balao-corpo', ns => ns.map(n => n.textContent))).includes('som 3000'));

// ——— 20c. Limpar a própria tela ———
await pagina.click('.sala:nth-child(2)');   // Recados
await pagina.waitForTimeout(300);
await pagina.click('#botao-opcoes');
ok('quem não é admin não apaga tudo', !(await pagina.isVisible('#opcao-apagar-tudo')));
await pagina.click('#opcao-limpar');
await pagina.waitForTimeout(200);
ok('limpar esvazia a tela', (await pagina.$$('.balao')).length === 0);
ok('limpar não apaga do banco', await pagina.evaluate(() =>
  window.__mock.mensagens.some(m => m.sala_id === 'recados')));
await chegar(3100, 'recados', 'outro');
await pagina.waitForTimeout(200);
ok('mensagem nova aparece depois de limpar', (await pagina.$$('.balao')).length === 1);
await pagina.click('.sala:nth-child(1)');
await pagina.waitForTimeout(300);

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

// ——— 21b. C: quem criou tira alguém da sala ———
await pagina.evaluate(() => {
  const sala = window.__mock.salas.find(s => s.titulo === 'Família');
  sala.membros.push({ perfil_id: 'bia-1', perfis: { apelido: 'Bia' } });
  document.dispatchEvent(new Event('visibilitychange'));
});
await pagina.waitForTimeout(400);
ok('sala conta quem entrou', (await pagina.textContent('#subtitulo-sala')).includes('2 pessoas'));
await pagina.click('#botao-opcoes');
await pagina.click('#opcao-membros');
await pagina.waitForTimeout(200);
ok('dono vê quem está na sala', (await pagina.textContent('#lista-membros')).includes('Bia'));
const codigoAntes = await pagina.evaluate(() => window.__mock.salas.find(s => s.titulo === 'Família').convite);
await pagina.evaluate(() => { window.confirm = () => true; });
await pagina.click('#lista-membros .acao.perigo');
await pagina.waitForTimeout(400);
ok('tirar some com a pessoa da lista', !(await pagina.textContent('#lista-membros')).includes('Bia'));
ok('tirar troca o link de convite', await pagina.evaluate(c =>
  window.__mock.salas.find(s => s.titulo === 'Família').convite !== c, codigoAntes));
ok('quem criou não tem botão contra si', (await pagina.$$('#lista-membros .acao')).length === 0);
await pagina.click('#botao-fechar-membros');

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
await pagina.click('#opcao-membros');
await pagina.waitForTimeout(200);
ok('membro vê as pessoas mas não tira ninguém',
  (await pagina.textContent('#lista-membros')).includes('Ana') &&
  (await pagina.$$('#lista-membros .acao')).length === 0);
await pagina.click('#botao-fechar-membros');
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

// ——— 27. Portaria: quem chega espera ———
async function novaPagina(cfg) {
  const contexto = await navegador.newContext({ viewport: { width: 1100, height: 780 } });
  const p = await contexto.newPage();
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  await p.addInitScript(c => { window.__cfg = c; }, cfg);
  await p.route('**/@supabase/supabase-js**', rota => rota.fulfill({
    status: 200, contentType: 'text/javascript', body: fs.readFileSync(MOCK, 'utf8'),
  }));
  await p.route('**/config.js', rota => rota.fulfill({
    status: 200, contentType: 'text/javascript',
    body: "globalThis.ALO_CONFIG = { url: 'https://x.supabase.co', anonKey: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.x' };",
  }));
  await p.goto('http://localhost:4173/' + (cfg.hash || ''));
  await p.waitForSelector('#tela-entrada:not([hidden])', { timeout: 5000 });
  return p;
}

const espera = await novaPagina({ situacaoNova: 'pendente' });
await espera.fill('#campo-apelido', 'Novata');
await espera.click('#botao-entrar');
await espera.waitForTimeout(400);
ok('quem chega cai na espera', await espera.isVisible('#tela-espera'));
ok('quem espera não vê o app', !(await espera.isVisible('#tela-app')));
ok('a espera chama a pessoa pelo nome', (await espera.textContent('#espera-texto')).includes('Novata'));

await espera.reload();
await espera.waitForTimeout(500);
ok('recarregar continua na espera', await espera.isVisible('#tela-espera'));

await espera.evaluate(() => window.__mock.mudarSituacao('aprovado'));
await espera.waitForTimeout(500);
ok('aprovada, o app abre sozinho', await espera.isVisible('#tela-app'));

await espera.evaluate(() => window.__mock.mudarSituacao('bloqueado'));
await espera.waitForTimeout(300);
ok('bloqueada, o app fecha na hora', !(await espera.isVisible('#tela-app')));
ok('bloqueada vê o aviso', (await espera.textContent('#espera-titulo')).includes('não liberado'));
ok('bloqueada não tem botão de conferir', !(await espera.isVisible('#botao-conferir')));
await espera.context().close();

// ——— 27b. Senha da administração: entrar de qualquer aparelho ———
const comSenha = await novaPagina({ situacaoNova: 'pendente', senha: 'senha-boa-123' });
await comSenha.fill('#campo-apelido', 'Tablet');
await comSenha.click('#botao-entrar');
await comSenha.waitForTimeout(400);
ok('espera oferece a entrada da administração', await comSenha.isVisible('#botao-sou-admin'));
await comSenha.click('#botao-sou-admin');
await comSenha.waitForTimeout(200);
ok('senha é pedida num campo que esconde o texto',
  await comSenha.isVisible('#painel-senha') && (await comSenha.getAttribute('#campo-senha', 'type')) === 'password');
await comSenha.fill('#campo-senha', 'errada');
await comSenha.click('#senha-ok');
await comSenha.waitForTimeout(300);
ok('senha errada é avisada e o painel fica', (await comSenha.textContent('#erro-senha')) === 'Senha errada.' &&
  await comSenha.isVisible('#painel-senha'));
ok('senha errada não abre o app', !(await comSenha.isVisible('#tela-app')));
await comSenha.fill('#campo-senha', 'senha-boa-123');
await comSenha.click('#senha-ok');
await comSenha.waitForTimeout(600);
ok('senha certa abre o app', await comSenha.isVisible('#tela-app'));
ok('senha certa vira admin', await comSenha.isVisible('#botao-admin'));
await comSenha.context().close();

// ——— 28. Portaria: a administração decide ———
const admin = await novaPagina({ adminNovo: true, pessoas: [
  { id: 'p-maria', apelido: 'Maria', situacao: 'pendente', admin: false },
  { id: 'p-joao', apelido: 'João', situacao: 'aprovado', admin: false },
] });
await admin.fill('#campo-apelido', 'Chefe');
await admin.click('#botao-entrar');
await admin.waitForSelector('#tela-app:not([hidden])', { timeout: 5000 });
await admin.waitForTimeout(400);
ok('admin vê a portaria', await admin.isVisible('#botao-admin'));
ok('selo conta quem espera', (await admin.textContent('#selo-portaria')) === '1');

await admin.click('#botao-admin');
await admin.waitForTimeout(300);
ok('portaria abre', await admin.isVisible('#painel-admin'));
ok('quem espera aparece na fila', (await admin.textContent('#lista-pendentes')).includes('Maria'));
ok('admin não tem botão contra si', (await admin.textContent('#lista-aprovados')).includes('você · admin'));

await admin.click('#lista-pendentes .acao.principal');
await admin.waitForTimeout(300);
ok('aprovar move para dentro', (await admin.textContent('#lista-aprovados')).includes('Maria'));
ok('selo some sem ninguém esperando', !(await admin.isVisible('#selo-portaria')));
ok('aprovar passa pelo banco', await admin.evaluate(() =>
  window.__mock.rpcs.some(([n, a]) => n === 'decidir_acesso' && a.p_perfil === 'p-maria' && a.p_situacao === 'aprovado')));

await admin.evaluate(() => { window.confirm = () => true; });
const bloquearJoao = admin.locator('#lista-aprovados .gente-item', { hasText: 'João' }).locator('.acao');
await bloquearJoao.click();
await admin.waitForTimeout(300);
ok('bloquear move para bloqueadas', (await admin.textContent('#lista-bloqueados')).includes('João'));
await admin.click('#botao-fechar-painel');

await admin.evaluate(() => {
  const canal = window.__mock.canais.find(c => c.nome === 'alo-perfis');
  canal.ouvintes[0].cb({ eventType: 'INSERT',
    new: { id: 'p-ze', apelido: 'Zé', situacao: 'pendente', admin: false } });
});
await admin.waitForTimeout(300);
ok('quem chega acende o selo', (await admin.textContent('#selo-portaria')) === '1');
ok('quem chega vira aviso', (await admin.textContent('#aviso')).includes('Zé quer entrar'));
ok('admin pode apagar mensagem dos outros', (await admin.$$('.balao:not(.minha) .balao-apagar')).length > 0);
// Conversa secreta: a administração gera o link
await admin.click('#botao-secreta');
await admin.waitForTimeout(400);
ok('conversa secreta nasce como convite', (await admin.textContent('#titulo-sala')) === 'Convite secreto');
await admin.evaluate(() => {
  window.__copiado = null;
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  navigator.clipboard.writeText = async t => { window.__copiado = t; };
});
await admin.click('#botao-opcoes');
ok('dono da secreta não tem "sair"', !(await admin.isVisible('#opcao-sair')));
await admin.click('#opcao-convidar');
await admin.waitForTimeout(200);
ok('convite secreto usa #secreta=', /#secreta=[0-9a-f]{64}$/.test(await admin.evaluate(() => window.__copiado) || ''));

// Definir a senha da administração
await admin.click('#botao-admin');
await admin.waitForTimeout(300);
ok('portaria diz que não há senha', (await admin.textContent('#estado-senha')).includes('não definida'));
await admin.click('#botao-senha');
await admin.fill('#campo-senha', 'senha-nova-1');
await admin.fill('#campo-senha-2', 'senha-nova-2');
await admin.click('#senha-ok');
await admin.waitForTimeout(200);
ok('senhas diferentes são recusadas', (await admin.textContent('#erro-senha')).includes('não são iguais'));
await admin.fill('#campo-senha', 'curta');
await admin.fill('#campo-senha-2', 'curta');
await admin.click('#senha-ok');
await admin.waitForTimeout(200);
ok('senha curta é recusada', (await admin.textContent('#erro-senha')).includes('8 caracteres'));
await admin.fill('#campo-senha', 'senha-nova-123');
await admin.fill('#campo-senha-2', 'senha-nova-123');
await admin.click('#senha-ok');
await admin.waitForTimeout(400);
ok('senha salva fecha o painel', !(await admin.isVisible('#painel-senha')));
ok('portaria mostra a senha definida', (await admin.textContent('#estado-senha')).includes(': definida'));
await admin.click('#botao-fechar-painel');

// Ligar e desligar o chat
await admin.click('#botao-admin');
await admin.waitForTimeout(200);
await admin.evaluate(() => { window.confirm = () => true; });
await admin.click('#botao-chat');
await admin.waitForTimeout(300);
ok('admin fecha o chat', await admin.evaluate(() => window.__mock.chatAberto === false));
ok('painel mostra chat fechado', (await admin.textContent('#estado-chat')) === 'Chat fechado');
await admin.click('#botao-fechar-painel');
ok('faixa avisa a admin que está fechado', await admin.isVisible('#faixa-fechada'));
ok('admin continua dentro com o chat fechado', await admin.isVisible('#tela-app'));
await admin.click('#botao-admin');
await admin.click('#botao-chat');
await admin.waitForTimeout(300);
ok('admin reabre o chat', await admin.evaluate(() => window.__mock.chatAberto === true));
await admin.click('#botao-fechar-painel');
await admin.click('.sala:nth-child(1)');
await admin.waitForTimeout(300);

await admin.click('#botao-opcoes');
await admin.click('#opcao-apagar-tudo');
await admin.waitForTimeout(400);
ok('admin apaga todas as mensagens da sala', (await admin.$$('.balao')).length === 0 &&
  await admin.evaluate(() => !window.__mock.mensagens.some(m => m.sala_id === 'geral')));

await admin.screenshot({ path: path.join(AQUI, 'fotos', '6-admin.png') });
await admin.click('#botao-admin');
await admin.waitForTimeout(300);
await admin.screenshot({ path: path.join(AQUI, 'fotos', '7-portaria.png') });
await admin.context().close();

// ——— 29. Quem abre o link secreto ———
const secreta = await novaPagina({ situacaoNova: 'pendente', hash: '#secreta=' + 'd'.repeat(64) });
await secreta.fill('#campo-apelido', 'Visita');
await secreta.click('#botao-entrar');
await secreta.waitForTimeout(600);
ok('link secreto pula a portaria', await secreta.isVisible('#tela-app'));
ok('link secreto abre a conversa', (await secreta.textContent('#titulo-sala')) === 'Ana');
ok('convidado secreto não vê as salas abertas', !(await secreta.isVisible('#lista-salas')));
ok('convidado secreto não vê quem está por aqui', !(await secreta.isVisible('#lista-presenca')));
ok('convidado secreto não aparece na presença', await secreta.evaluate(() =>
  !window.__mock.canais.some(c => c.nome === 'alo-presenca')));
ok('convidado secreto não cria sala', !(await secreta.isVisible('#botao-nova-sala')));
ok('o link secreto vale uma vez', await secreta.evaluate(() =>
  window.__mock.escondidas.find(s => s.id === 'secreta-ana').convite === null));
ok('código secreto sai do endereço', !(await secreta.evaluate(() => location.hash)));
await secreta.screenshot({ path: path.join(AQUI, 'fotos', '8-secreta.png') });
await secreta.context().close();

// ——— 29b. No telefone, o app começa pela lista de salas ———
const celular = await novaPagina({});
await celular.setViewportSize({ width: 390, height: 780 });
await celular.fill('#campo-apelido', 'Celular');
await celular.click('#botao-entrar');
await celular.waitForTimeout(500);
ok('no telefone abre na lista de salas', await celular.isVisible('#lista-salas') &&
  !(await celular.isVisible('#mensagens')));
await celular.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await celular.waitForTimeout(500);
ok('voltar para a aba não pula para dentro da sala', await celular.isVisible('#lista-salas') &&
  !(await celular.isVisible('#mensagens')));
await celular.context().close();

// ——— 30. Chat fechado para quem não é admin ———
const fora = await novaPagina({ chatFechado: true });
await fora.fill('#campo-apelido', 'Visitante');
await fora.click('#botao-entrar');
await fora.waitForTimeout(500);
ok('chat fechado barra quem não é admin', !(await fora.isVisible('#tela-app')));
ok('chat fechado explica', (await fora.textContent('#espera-titulo')) === 'Chat fechado');
await fora.evaluate(() => window.__mock.mudarChat(true));
await fora.waitForTimeout(500);
ok('chat reaberto entra sozinho', await fora.isVisible('#tela-app'));
await fora.evaluate(() => window.__mock.mudarChat(false));
await fora.waitForTimeout(300);
ok('chat fechado com o app aberto fecha na hora', !(await fora.isVisible('#tela-app')));
await fora.context().close();

console.log('\n———— RESULTADO ————');
for (const [r, n] of passos) console.log(`${r === 'PASSOU' ? '  ok  ' : ' FALHA'} ${n}`);
const falhas = passos.filter(p => p[0] === 'FALHOU').length;
console.log(`\n${passos.length - falhas}/${passos.length} passaram`);
if (erros.length) { console.log('\n———— ERROS NO NAVEGADOR ————'); erros.forEach(e => console.log('  ' + e)); }

await navegador.close();
servidor.close();
process.exit(falhas || erros.length ? 1 : 0);
