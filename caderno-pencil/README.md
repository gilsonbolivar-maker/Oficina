# Caderno Pencil

Escreva à mão com a **Apple Pencil** no iPad, o texto sai **digitado** e você
**copia com um toque** para colar onde quiser.

<https://gilsonbolivar-maker.github.io/Oficina/caderno-pencil/>

## Como funciona

Quem transforma a letra em texto é o **Rabisco** (*Scribble*), recurso do próprio
iPadOS: ele funciona em qualquer campo de texto. O app é uma folha grande,
pautada e confortável para escrever com a Pencil — mais o que falta em volta:
copiar, enviar, guardar as notas e ajustar o tamanho da letra.

Ou seja: **não precisa de internet e nada sai do seu iPad.**

## Primeiro uso

1. No iPad, abra **Ajustes › Apple Pencil** e ligue o **Rabisco**.
2. Abra o link acima no Safari.
3. Toque em **Compartilhar › Adicionar à Tela de Início** — o caderno vira um app.
4. Toque na folha com a Pencil e escreva.

## Na tela

| Botão | O que faz |
| ----- | --------- |
| **Copiar** | Copia a nota inteira. Se houver um trecho selecionado, copia só ele. |
| **Enviar** | Escolhe o destino: WhatsApp, e-mail, Mensagens ou a lista de apps do iPad. |
| **↶** | Desfaz o último trecho escrito. |
| **Aa** | Tamanho da letra, espaço entre linhas, pauta, modo noite. |
| **☰** | Lista das notas guardadas. |
| **＋** | Folha nova. |

## Enviar para outro app

O botão **Enviar** abre uma lista de destinos. WhatsApp, e-mail e Mensagens
abrem o app já com o texto dentro (pelos endereços `whatsapp://`, `mailto:` e
`sms:`); **Outros apps** abre a folha de compartilhamento do iPad, com tudo o
mais — Notas, Drive, Telegram, imprimir.

Em qualquer um deles o texto também vai para a área de transferência: se o app
abrir vazio, porque o texto era longo demais para caber no endereço, é só colar.

## Gestos do Rabisco

- **Rabiscar por cima** de uma palavra: apaga.
- **Circular** uma palavra: seleciona.
- **Traço vertical** entre palavras: abre ou fecha espaço.
- **Segurar** num espaço vazio: abre espaço para escrever no meio.

Letra grande e linhas espaçadas ajudam o Rabisco a acertar mais — dá para
aumentar as duas coisas em **Aa**.

## Onde ficam as notas

No `localStorage` do navegador, só no aparelho. Apagar os dados do site apaga as
notas; por isso o botão **Enviar** é o jeito de mandar um texto importante para
fora do caderno.

## Arquivos

| Arquivo | O que é |
| ------- | ------- |
| `index.html` | A tela. |
| `app.css` | Estilo, papel e pauta. |
| `app.js` | Notas, cópia, ajustes. |
| `sw.js` | Service worker: abre sem internet. |
| `manifest.webmanifest` | Faz virar app na Tela de Início. |
