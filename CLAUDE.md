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
| Caderno Pencil | no meio do topo, embaixo do estado |
| Câmera Negativo | embaixo do estado, no topo (`#versao-topo`) |
| Escola | rodapé ("Escola v1") |
| Páginas de arquivo único (Treino, Mensagem Efêmera, Descubra seu App, Portfólio, DD, Karla Neves, Lete Diedrichs, Harmonize) | canto inferior direito; a `VERSAO` fica no script no fim do `index.html` (não têm `app.js` nem `sw.js`) |

App novo já nasce com `VERSAO = '1.0.0'` e um lugar visível com `data-versao`.

## Seletor de arquivo

Não use `accept=".json,…"` em `<input type="file">`: no iPad ele deixa cinza
todo arquivo que o sistema não reconhece como JSON (Google Drive, `.txt`, sem
extensão). Quem decide é o conteúdo — o app lê, confere e explica o erro.
