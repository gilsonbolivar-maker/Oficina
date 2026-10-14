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
| **Modo** | Troca entre Foto, Lupa, Vibração e Comparar. |
| **⚙** | Ajustes: zoom fino, força da inversão, temporizador, espelho, grade. |
| **1.0×** | Zoom: toque para ciclar 1× → 2× → 3× → 5×. Fica laranja quando ampliado. |
| **v1.6.0** | O número da versão, abaixo do nome do filtro; toque para abrir os ajustes. |
| **🔦** | Lanterna — só aparece quando a câmera de trás permite acender. |
| Fileira de filtros | Troca o filtro; o escolhido fica aceso. |
| Miniatura | Abre as fotos desta sessão. |
| Botão redondo | Tira a foto. |
| **⇄** | Troca entre a câmera de trás e a frontal. |

## Os quatro modos

O botão de modo, no alto à esquerda, troca o jeito de olhar. Os três últimos
mostram o que o olho sozinho não alcança.

| Modo | O que faz | Para quê |
| ---- | --------- | -------- |
| **Foto** | A câmera normal, com os filtros de cor | o uso de sempre |
| **Lupa** | Soma vários quadros e tira a média | ler etiqueta, tag e display de longe |
| **Vibração** | Amplifica o movimento pequeno demais para o olho | ver se bomba, motor ou tubulação estão tremendo |
| **Noite** | Junta a luz de vários quadros e amplifica | enxergar onde a câmera comum só mostra chuvisco |
| **Contraste** | Estica a faixa de tons até o limite | display apagado, etiqueta desbotada, número gravado em metal |
| **Comparar** | Põe uma foto antiga por cima do visor e destaca o que mudou | ronda: mesma cena, dois horários |

### Lupa

Cada pixel do sensor tem um chuvisco próprio, diferente a cada quadro. A média
de N quadros divide esse ruído por √N e o texto pequeno sai de dentro dele —
depois o realce de bordas devolve o contorno que a média arredondou.

```
1 quadro          8 quadros somados
▒F▒T-1▒0008   →   FIT-140008
```

Só funciona com a cena parada: se o quadro muda demais, a soma **recomeça** em
vez de borrar tudo. O contador na tela diz quando estabilizou. **Apoie o
aparelho** — a mão tremendo reinicia a conta a todo instante.

Combina com o zoom: aproxime até o campo encher a tela, espere estabilizar,
fotografe. A foto sai com os quadros já somados, não é só a tela.

### Noite

No escuro o sensor até registra alguma luz, mas ela vem afogada no chuvisco — e
o chuvisco é **diferente a cada quadro**, enquanto a cena é a mesma. Somando
quadros, a cena se reforça e o ruído se cancela; só então o ganho vale a pena,
porque passa a ampliar imagem em vez de amplificar chuvisco.

| Controle | O que faz |
| -------- | --------- |
| **Cinza / Verde / Cor** | O verde é tradição de visão noturna por um motivo: o olho separa mais tons de verde no escuro |
| **Ganho de luz** | 1× a 16×, aplicado depois de somar |
| **Quadros somados** | 1 a 24 — mais quadros, imagem mais limpa; o que se mexer borra |

O app ainda pede à câmera **menos quadros por segundo** ao entrar no modo: cada
quadro fica aberto mais tempo e entra mais luz. Nem toda câmera aceita (o iPhone
costuma recusar) — quando recusa, o modo segue só com a soma, que é a parte que
mais rende.

A linha embaixo diz quanta luz a cena tem, de *escuro demais* a *luz suficiente*.

Medido numa cena escura sintética (fundo 6, placa 13, chuvisco de ±5 por quadro
— uma placa invisível a olho nu):

| | separação placa/fundo | ruído |
| --- | --- | --- |
| Imagem crua | **6** níveis de 255 | 2,6 |
| Noite, 8 quadros, 6× | **134** | 17,2 |
| Noite, 20 quadros | **147** | 11,7 |
| Noite, cinza, 20 quadros | **192** | 15,8 |

**Limite honesto:** ele junta a luz que existe. No breu absoluto não há o que
somar — aí só com a lanterna, ou uma fonte infravermelha externa.

### Contraste

Uma etiqueta desbotada ou um display apagado ocupam um pedacinho da escala de
brilho — digamos, tudo entre 99 e 129. Três jeitos de abrir esse pedaço:

| Tipo | O que faz | Quando usar |
| ---- | --------- | ----------- |
| **Auto** | Descobre onde a cena começa e termina e estica para 0–255 | o caso comum: foto lavada, pouca luz |
| **Extremo** | Estica e ainda abre a partir do meio, estourando as pontas | quando o Auto não basta |
| **Traço** | Compara cada ponto com a vizinhança e some com o fundo | **luz batendo torta**, gravação em metal, texto em superfície suja |

O **Traço** é o que resolve o caso difícil: ele não usa limiar fixo nem depende
de o traço ser mais claro ou mais escuro que o fundo — mede cada ponto contra a
sua volta e multiplica a diferença. Sombra, reflexo e gradiente de iluminação
somem; fica o traço.

Medido numa cena de propósito ruim — etiqueta cinza-claro sobre fundo cinza,
com a luz atravessando em gradiente:

| | faixa de tons |
| --- | --- |
| Cena original | **35** de 255 |
| Auto | **254** |
| Extremo | **255** (metade da imagem vira preto ou branco puro) |
| Traço | **224**, com o gradiente removido |

A **Força** mistura o resultado com a imagem original: em 0% nada muda, em 100%
vai ao limite. O padrão é 85%.

Os filtros de cor continuam valendo — **Negativo** por cima do Traço costuma
deixar o número ainda mais legível.

### Vibração

Um fundo que acompanha a cena devagar guarda "como as coisas estão paradas"; o
que foge dele é movimento. Multiplicado por 5× a 60×, um tremor de um pixel
vira faixa colorida: **laranja** para um lado, **azul** para o outro. A barra
mostra o nível, de *parado* a *movimento forte*.

Os filtros de cor saem de cena nesse modo — a cor já é a informação.

**O que ele não dá:** frequência em Hz. A câmera entrega 30 quadros por
segundo, então vibração acima de ~15 Hz aparece com frequência falsa
(*aliasing*) — e num motor a 1800 rpm o número sairia errado. O modo mostra
**onde** treme e **quanto**, não a que frequência.

### Comparar

1. Abra uma foto e toque em **Referência**
2. O app entra no modo Comparar e põe a foto antiga por cima do visor
3. Mire até as bordas sumirem — é o alinhamento
4. Fotografe: sai a foto nova **e** uma imagem da diferença

Na imagem da diferença a cena fica apagada e só o que mudou acende em
**vermelho**, com a porcentagem na legenda. Diferença abaixo do ruído do sensor
é descartada, para não acender a imagem inteira à toa.

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

## Zoom

Três jeitos de aproximar, até **6×**:

| Gesto | O que faz |
| ----- | --------- |
| **Pinça** com dois dedos no visor | Zoom contínuo |
| **Dois toques** no visor | Alterna 1× e 2× |
| Toque no **número** no alto da tela | Cicla 1× → 2× → 3× → 5× |
| Ajuste **Zoom** no painel ⚙ | Passo fino, de 0,1 em 0,1 |

**A foto sai ampliada de verdade**, não é só a tela que aproxima:

```
câmera 3840×2160  ──►  zoom 2×  ──►  recorte central 1920×1080
                                     (pixels reais, nada esticado)
```

Onde a câmera tem zoom próprio (Android/Chrome), ele é usado primeiro — não custa
nitidez. O que passar do alcance do hardware — e tudo no iPhone, onde o Safari não
expõe zoom — vira recorte central. Por isso o app pede a maior resolução que a
câmera oferecer: é dela que o recorte tira nitidez.

O recorte mantém o formato do quadro, então **a foto guarda um pouco mais das
laterais do que cabe no visor** — nunca menos.

## A foto sai igual ao visor

O visor é filtrado pelo CSS, mas a foto é desenhada num `canvas` com a **mesma
receita** — cinza, inversão e contraste, nessa ordem. Onde o navegador aceita
`ctx.filter` (Safari 17+, Chrome, Firefox) é ele quem aplica; onde não aceita, o
`app.js` refaz a conta pixel a pixel. O resultado é o mesmo.

Se a câmera frontal estiver espelhada no visor, a foto sai espelhada também: o
que se vê é o que se leva.

## Transcrever a foto em texto

O botão **Transcrever**, no painel da foto, é para fotos de **tela, painel ou
documento**: abre a folha de compartilhamento com a imagem **e o pedido de
transcrição já escrito** — um campo por linha, campo vazio marcado como
*(sem leitura)*, cor do valor anotada e um bloco separado por `;` no fim, para
planilha. O pedido também vai para a **área de transferência**, porque alguns
apps levam só a imagem.

**O app não lê o texto sozinho.** Quem transcreve é quem recebe a foto — o
Claude, um colega no WhatsApp, você mesmo no e-mail. Foi uma escolha: um
reconhecedor embarcado custaria ~10 MB e erraria dígito justamente na fonte de
painel (`FIT-140008` virando `FIT-14000B`), e num instrumento errar um dígito é
pior do que não ler.

Combina com o zoom: aproxime até o campo ficar nítido, fotografe, transcreva.

## Salvar em PDF

O botão **PDF**, no painel da foto, monta uma **folha A4** com a imagem
centralizada e uma linha no rodapé: app, filtro, zoom, data, hora e o tamanho
em pixels. A folha sai em pé ou deitada conforme a foto.

O JPEG entra **inteiro** no PDF, pelo filtro `/DCTDecode`: nada é recomprimido
nem redesenhado — a folha carrega exatamente a foto que foi tirada. O arquivo é
montado byte a byte pelo `app.js`, **sem biblioteca nenhuma**, para o app
continuar abrindo e funcionando sem internet.

Serve para arquivar uma leitura, anexar num relatório ou imprimir.

## Onde ficam as fotos

**Só na memória do app, enquanto ele está aberto.** Fechar apaga tudo — é de
propósito: fotos são pesadas e o armazenamento do navegador é pequeno.

Para guardar uma foto, abra-a e toque em **Salvar / Enviar**:

- no iPhone e no iPad abre a folha de compartilhamento — escolha **Salvar
  Imagem** para mandar para o app Fotos, ou WhatsApp, e-mail, Notas;
- no computador, o arquivo `.jpg` é baixado direto.

O botão **PDF**, ao lado, faz o mesmo caminho com uma folha A4 em vez da imagem
solta.

## Versão

O número aparece **no visor**, em letra miúda logo abaixo do nome do filtro —
tocar nele abre os ajustes, onde o rodapé repete a versão por extenso.

Quando sai uma versão nova o app percebe sozinho: o número no visor fica
**laranja** e aparece **Nova versão pronta · Atualizar**.

| Versão | O que mudou |
| ------ | ----------- |
| 1.6.0 | Modo **Noite**: soma a luz de vários quadros, com ganho e paleta verde. |
| 1.5.0 | Modo **Contraste**: Auto, Extremo e Traço, para ler o que quase não tem contraste. |
| 1.4.0 | Modos **Lupa**, **Vibração** e **Comparar**: ver o que o olho não alcança. |
| 1.3.0 | Botão **Transcrever**: envia a foto com o pedido de transcrição pronto. |
| 1.2.0 | Botão **PDF**: folha A4 com a foto e a data, montada no próprio app. |
| 1.1.0 | Zoom até 6× por pinça, dois toques, atalho e ajuste fino — com recorte real na foto. |
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
