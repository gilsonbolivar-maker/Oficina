# Oficina — regras do repositório

## Versão de cada app

Todo app da Oficina mostra o número da versão na tela, sempre.

- A versão mora em `const VERSAO = 'x.y.z'` no `app.js` **e** no `sw.js` do
  app, com o mesmo valor (o cache do service worker leva o número no nome, e é
  assim que o aparelho percebe que há versão nova).
- **Toda mudança num app sobe a versão dele**, no mesmo commit:
  - correção → último número (`1.2.0` → `1.2.1`);
  - recurso novo → do meio (`1.2.1` → `1.3.0`);
  - mudança grande, que muda o jeito de usar → primeiro (`1.3.0` → `2.0.0`).
- A página mostra a versão em todo elemento com `data-versao` (preenchido pelo
  `app.js`). Onde ela aparece:

| App | Onde a versão aparece |
|---|---|
| Alô | ao lado da marca "Alô" (barra lateral e cartões de entrada) |
| Britagem, Agenda Telefônica, IOs da URA | canto direito da barra de abas; na tela de boas-vindas |
| Alarme GPS | ao lado do título |
| Início | no mostrador do topo, no fim da fileira de bolhas (chip dourado) |
| Caderno Pencil | no meio do topo, embaixo do estado |
| Câmera Negativo | embaixo do estado, no topo (`#versao-topo`) |
| Câmera Medida | ao lado do nome, no topo; e no fim dos Ajustes |
| SINAL e Zap232 (antigo Sinal232) | ao lado do título (os dois usam o mesmo `sinal/app.js`; `sinal/sw.js` e `sinal-painel/sw.js` levam a mesma `VERSAO`) |
| Zap/220 (pasta `220Sinal/`, antigo 220Sinal; cópia do Zap232) | ao lado do título; a aba "Leituras 220" (no Zap/220 e no AA220) lê o Painel AA-232 em `POST /api/leitura-220` (senha guardada no aparelho, `ITENS_220` precisa acompanhar o `dados.js` do 232); o código fica em `220Sinal/app.js` (lado que chama, `220Sinal/`), e o lado que recebe (`220Sinal-sinal/`) carrega `../220Sinal/app.js`; `220Sinal/sw.js` e `220Sinal-sinal/sw.js` levam a mesma `VERSAO`. Guarda tudo com prefixo `220-` e usa tópicos `app-220sinal/`: não se mistura com o Zap232. O Android fica em `220Sinal/android` (APKs `aa220.apk` e `220sinal.apk`, workflow `apk-220sinal.yml`): o `Cifra.PREFIXO` precisa casar com o `PREFIXO` do `app.js` |
| Escola | rodapé ("Escola v1") |
| PixelMusic | ao lado do título |
| Player | ao lado do título, no topo da lista |
| Teleprompter | canto inferior direito; a `VERSAO` fica no script no fim do `teleprompter/index.html` e no `teleprompter/sw.js`, com o mesmo valor (não tem `app.js`) |
| Piano 3D | canto inferior direito; é a versão compilada (Vite) do repositório Piano: a `VERSAO` fica no `index.html` de lá — muda lá, compila (`npm run build`) e copia o `dist/` para `piano/` |
| Mapa de Chuva | canto inferior direito, dentro do painel de baixo; a `VERSAO` fica no script no fim do `chuva/index.html` (arquivo único, sem `app.js` nem `sw.js`) |
| Páginas de arquivo único (Treino, Mensagem Efêmera, Descubra seu App, Portfólio, DD, Karla Neves, Lete Diedrichs, Harmonize) | canto inferior direito; a `VERSAO` fica no script no fim do `index.html` (não têm `app.js` nem `sw.js`) |

App novo já nasce com `VERSAO = '1.0.0'` e um lugar visível com `data-versao`.

## Seletor de arquivo

Não use `accept=".json,…"` em `<input type="file">`: no iPad ele deixa cinza
todo arquivo que o sistema não reconhece como JSON (Google Drive, `.txt`, sem
extensão). Quem decide é o conteúdo — o app lê, confere e explica o erro.
