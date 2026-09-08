# Câmera Negativo

A câmera do aparelho com as **cores invertidas** — na tela e na foto salva.

<https://gilsonbolivar-maker.github.io/Oficina/camera-negativo/>

## Para que serve

- **Ver negativos de filme**: aponte para um negativo antigo no filtro
  **Negativo** e ele aparece com as cores certas.
- **Enxergar melhor**: texto claro em fundo escuro cansa menos a vista de
  algumas pessoas; o negativo faz isso ao vivo.
- **Brincar com a imagem**: **Raio-X** estica o contraste e deixa a cena
  parecida com uma chapa.

Não precisa de internet e **nenhuma imagem sai do aparelho** — não há servidor
por trás, o vídeo nunca é enviado.

## Primeiro uso

1. Abra o link acima no Safari (iPhone/iPad) ou no Chrome (Android).
2. Toque em **Ligar a câmera** e autorize o acesso.
3. Toque em **Compartilhar › Adicionar à Tela de Início** — vira um app.

A permissão da câmera é pedida uma vez por aparelho. Se você negou sem querer,
libere de novo em **Ajustes › Safari › Câmera** (iPhone/iPad) ou no cadeado da
barra de endereço (computador).

## Na tela

| Botão | O que faz |
| ----- | --------- |
| **⚙** | Ajustes: força da inversão, temporizador, espelho, grade. |
| **v1.0.1** | O número da versão, abaixo do nome do filtro; toque para abrir os ajustes. |
| **🔦** | Lanterna — só aparece quando a câmera de trás permite acender. |
| Fileira de filtros | Troca o filtro; o escolhido fica aceso. |
| Miniatura | Abre as fotos desta sessão. |
| Botão redondo | Tira a foto. |
| **⇄** | Troca entre a câmera de trás e a frontal. |

## Os filtros

| Filtro | O que faz |
| ------ | --------- |
| **Negativo** | Inverte todas as cores. |
| **Negativo P&B** | Tira a cor e inverte: um negativo de filme preto e branco. |
| **Raio-X** | Negativo P&B com o contraste esticado. |
| **P&B** | Só tira a cor, sem inverter. |
| **Normal** | Câmera comum, sem filtro. |

A **força da inversão** (nos ajustes) vai de 0% a 100% e vale para os filtros
que invertem: em 50%, a imagem fica no meio do caminho, cinzenta.

## A foto sai igual ao visor

O visor é filtrado pelo CSS, mas a foto é desenhada num `canvas` com a **mesma
receita** — cinza, inversão e contraste, nessa ordem. Onde o navegador aceita
`ctx.filter` (Safari 17+, Chrome, Firefox) é ele quem aplica; onde não aceita, o
`app.js` refaz a conta pixel a pixel. O resultado é o mesmo.

Se a câmera frontal estiver espelhada no visor, a foto sai espelhada também: o
que se vê é o que se leva.

## Onde ficam as fotos

**Só na memória do app, enquanto ele está aberto.** Fechar apaga tudo — é de
propósito: fotos são pesadas e o armazenamento do navegador é pequeno.

Para guardar uma foto, abra-a e toque em **Salvar / Enviar**:

- no iPhone e no iPad abre a folha de compartilhamento — escolha **Salvar
  Imagem** para mandar para o app Fotos, ou WhatsApp, e-mail, Notas;
- no computador, o arquivo `.jpg` é baixado direto.

## Versão

O número aparece **no visor**, em letra miúda logo abaixo do nome do filtro —
tocar nele abre os ajustes, onde o rodapé repete a versão por extenso.

Quando sai uma versão nova o app percebe sozinho: o número no visor fica
**laranja** e aparece **Nova versão pronta · Atualizar**.

| Versão | O que mudou |
| ------ | ----------- |
| 1.0.1 | Número da versão no visor, logo abaixo do nome do filtro. |
| 1.0.0 | Visor invertido, cinco filtros, foto igual ao visor, carretel da sessão, offline. |

`app.js` e `sw.js` guardam a mesma constante `VERSAO` — mudar as duas é o que
dispara a atualização nos aparelhos.

## Arquivos

| Arquivo | O que é |
| ------- | ------- |
| `index.html` | A tela. |
| `app.css` | Estilo do visor, dos filtros e dos painéis. |
| `app.js` | Câmera, filtros, foto e carretel. |
| `sw.js` | Service worker: abre sem internet. |
| `manifest.webmanifest` | Faz virar app na Tela de Início. |
