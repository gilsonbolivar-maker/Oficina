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
| **⠿ Arrastar** | Alça: segure e arraste a nota direto para outro app aberto ao lado. |
| **↶** | Desfaz o último trecho escrito. |
| **Aa** | Tamanho da letra, espaço entre linhas, pauta e **Tema: Escuro / Claro** (fica salvo no aparelho; quem usava o modo noite já abre no Escuro). |
| **☰** | Lista das notas guardadas — no meio do topo. |
| **Limpar** | Apaga o texto da folha, sem mexer nas outras notas. Pede confirmação. |

O canto de cima à esquerda fica vazio de propósito: com o app em janela, o
iPadOS desenha ali os controles dela e cobriria qualquer botão.

| **＋** | Folha nova. |

## Enviar para outro app

O botão **Enviar** abre uma lista de destinos. WhatsApp, e-mail e Mensagens
abrem o app já com o texto dentro (pelos endereços `whatsapp://`, `mailto:` e
`sms:`); **Outros apps** abre a folha de compartilhamento do iPad, com tudo o
mais — Notas, Drive, Telegram, imprimir.

Em qualquer um deles o texto também vai para a área de transferência: se o app
abrir vazio, porque o texto era longo demais para caber no endereço, é só colar.

## Arrastar para outro app

Com o app de destino aberto ao lado (Split View ou Slide Over), segure a alça
**⠿ Arrastar** e leve a nota até ele. Se houver um trecho selecionado na folha,
só esse trecho vai — igual ao botão **Copiar**.

Arrastar a partir de uma página web depende do iPadOS aceitar a solta no campo
de destino; quando ele recusa, **Copiar** e **Enviar** continuam ali.

## Gestos do Rabisco

- **Rabiscar por cima** de uma palavra: apaga.
- **Circular** uma palavra: seleciona.
- **Traço vertical** entre palavras: abre ou fecha espaço.
- **Segurar** num espaço vazio: abre espaço para escrever no meio.

Letra grande e linhas espaçadas ajudam o Rabisco a acertar mais — dá para
aumentar as duas coisas em **Aa**.

## Versão

O número da versão aparece no painel **Aa**, no rodapé — junto com o aviso de
que aquela é a versão instalada no aparelho.

Quando sai uma versão nova, o app percebe sozinho (ao abrir e sempre que volta
para a frente) e mostra **Nova versão pronta · Atualizar**. Um toque recarrega
já na nova; as notas continuam onde estavam.

| Versão | O que mudou |
| ------ | ----------- |
| 1.4.2 | O **Limpar** foi para a direita, ao lado do **＋**: em janela, o iPadOS cobre o canto esquerdo com os controles dela. |
| 1.4.1 | O **Limpar** desceu um pouco (não bastava — ver 1.4.2). |
| 1.4.0 | Botão **Limpar** no topo; o **☰** foi para o centro. |
| 1.3.0 | Seletor **Tema: Escuro / Claro** no lugar do “Modo noite” (a escolha antiga é mantida). |
| 1.2.0 | Alça para arrastar a nota; número de versão e aviso de atualização. |
| 1.1.0 | Escolha do destino no botão **Enviar**. |
| 1.0.0 | Folha, notas, copiar, compartilhar, ajustes, modo offline. |

`app.js` e `sw.js` guardam a mesma constante `VERSAO` — mudar as duas é o que
dispara a atualização nos aparelhos.

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
