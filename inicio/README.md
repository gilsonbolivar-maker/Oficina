# Início

Tela inicial (launcher) para Android, feita para o Redmi Note 10. A 2.0 tem a
cara do **Pixel Nexo** (roxo noturno e dourado, ícones com degradê, abas de
fichário, barra de comando), mas com os **apps de verdade** do celular e sem o
celular falso desenhado na tela. Do **Foco Dev** ficou o foco: uma tarefa por
vez e o bloco de foco que avisa no fim.

```
 ◓ 05:16          QUA 28          17:50 ◒   nascer e pôr do sol
 (75min)      14:32 ⁵⁷      (87% ⚡ 31°)     anel de foco · hora · bateria em traços
        ⛅ Agora 22°  26° / 18°              clima agora, máxima e mínima
 🌡️22° │ 💧6% │ ☀️6 UV alto │ 🌬️23 km/h     sensação · chuva · UV · vento
 💬 11  ✓ CI  ▂▄▆ Wi-Fi  💾 38 GB  v2.1.0    bolhas
 ▸ AGORA  Publicar o app   29:59             tarefa + bloco (toque abre a folha)
 [★ Início][>_][▣][♥][▦]                     abas de fichário
 ┌────────────────────────────┐
 │  apps da aba  (⁹ notificações)│            deslize para o lado: troca de aba
 └────────────────────────────┘
 ⌃ nexo:~$ buscar ou comando  →              ⌃ abre a gaveta; tocar no campo mostra os comandos
 [ barra fixa: até 5 apps ]
```

- **Mostrador**, no estilo do relógio Galaxy Watch:
  - hora com **segundos** e o dia (`QUA 28`);
  - **nascer e pôr do sol**;
  - **anel de foco**: minutos de foco de hoje (enche em 120 min) e 🔥 a
    sequência de dias seguidos com foco. Tocar abre a folha do foco;
  - **bateria em 16 traços**, com ⚡ carregando e a temperatura (vermelha
    abaixo de 20%);
  - **clima** pela [Open-Meteo](https://open-meteo.com) (grátis, sem chave):
    agora, máxima/mínima, sensação, chance de chuva, índice UV (laranja quando
    alto) e vento. Usa a localização aproximada; sem ela, o comando
    `cidade Itabira` escolhe a cidade. Busca de novo a cada 30 min; sem rede,
    mostra o último;
  - **bolhas**: 💬 total de notificações (precisa ligar o *Acesso a
    notificações*; o Início só conta, não lê), ✓/✗ dos builds da Oficina no
    GitHub (toque abre o Actions), rede com a força do sinal e o espaço livre.
- **Céu agora** (toque no clima, ou comando `chuva`): janela com um quadro de
  **30 × 30 km** centrado em você (ou 60 e 100 km), com três camadas:
  - mapa do [OpenStreetMap](https://www.openstreetmap.org), escurecido;
  - **satélite infravermelho** do GOES-19 (banda 13, pela
    [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api)):
    o topo das nuvens; as mais frias (claras) são as que crescem e formam chuva.
    Sai a cada 10 min, com cerca de 1 h de atraso; a janela procura os quadros
    mais novos que já existem;
  - **radar** do [RainViewer](https://www.rainviewer.com/api.html): a chuva que
    já está caindo. A versão grátis vai até o zoom 7 (~600 m por ponto), então
    no quadro de 30 km o radar aparece quadriculado.
  A última hora anima; os botões ligam e desligam cada camada e pausam.
  **Visual** gira entre *claro* (o padrão, como os sites de radar: mapa de
  verdade, anéis a cada 10 km em volta de você e só a chuva colorida, azul →
  verde → amarelo → vermelho; o satélite começa desligado e, se ligado, vem
  em cinza), *normal*, *alto* (mapa mais escuro, nuvens mais
  brilhantes e radar com cores vivas) e *cores*, que pinta o
  infravermelho pela temperatura, como nos sites de meteorologia (azul baixa →
  verde → amarelo → vermelho → branco, topo muito frio, tempestade), com o chão
  quente apagado. Com o radar ligado, as nuvens ficam sempre em branco e
  cinza, para a cor do satélite não se misturar com a da chuva.
  Grade a cada 10 km, escala e a hora de cada fonte no canto.
- **Voos perto** (bolha ✈ do mostrador, ou comando `voos`): radar de aviões no
  estilo sonar, preto e verde, com a varredura girando. Cada avião aparece com
  o voo e a altitude em pés e anda pela velocidade e pelo rumo entre uma busca
  e outra (a cada 10 s). Raio de 50, 100 ou 250 km. Embaixo, a lista dos mais
  perto (tipo, altitude, km/h, distância e direção); tocar num avião mostra os
  dados, e tocar de novo abre no mapa do adsb.lol. Os dados são ADS-B grátis e
  sem chave: [adsb.lol](https://adsb.lol), [airplanes.live](https://airplanes.live)
  e [OpenSky](https://opensky-network.org), nessa ordem. Vêm de receptores
  caseiros, então no interior pode haver poucos aviões. Se o site barrar o
  navegador (CORS), o APK 2.6.0 busca pelo Android (`buscar`, só nesses três
  servidores).
- **Satélite** (APK 2.4.0): quando o celular entra no **Vivo Satélite** (Starlink
  direto no celular) ou outro serviço por satélite, a bolha da rede vira
  **🛰 Vivo Starlink**, dourada e pulsando, e aparece uma dica do que funciona
  (WhatsApp, mensagens e mapas). O Início sabe pelo Android 15+ (a rede ativa
  diz que é satélite) ou pelo nome da rede ("VIVO STARLINK" / "VIVO SATÉLITE").
  Fora do satélite, a bolha 🛰 fica **cinza** ao lado da rede (o Início está
  vigiando); tocar nela explica quando o satélite entra e como o seu Android
  avisa. A bolha dos dados móveis mostra o nome da operadora, e as
  bolhas se atualizam na hora quando a rede muda.
- **Atualizar** (chip da versão, no fim das bolhas): um toque confere no site,
  baixa a versão nova e recarrega, sem precisar forçar a parada do app. A cada
  3 horas ele confere sozinho e fica dourado (`↻ v2.3.0 nova`) quando há
  novidade. O comando `atualizar` faz o mesmo.
- **Notificações nos ícones**: o número aparece em cima de cada app, como no
  launcher do celular.
- **Abas de fichário.** *Início* tem os apps que você fixou. *Dev*,
  *Trabalho* e *Social* se enchem sozinhas pelo tipo de app (GitHub, Termux,
  Claude… / Gmail, Agenda, Drive… / WhatsApp, Instagram, YouTube…). *Oficina*
  tem os apps da Oficina (Alarme GPS, Britagem, SINAL e PAINEL abrem o APK, se
  estiver instalado). Toque e segure qualquer app para mudá-lo de aba.
- **Barra de comando** `nexo:~$`: digite e o app aparece; *Enter* abre.
  Tocar no campo vazio mostra os comandos: `foco 30` (bloco de 30 min),
  `tarefa revisar o PR`, `pausar`, `clima`, `chuva`, `cidade NOME`, `ci`,
  `notificações`, `tema`, `atualizar`, `gaveta`, e o nome de uma aba (`dev`, `oficina`…).
- **Gaveta** com todos os apps de A a Z, com busca: toque em ⌃ (no começo da
  barra de comando) ou deslize para cima; deslize para baixo (ou o voltar) fecha.
- **Barra fixa** embaixo, com até 5 apps. Na primeira vez ela já vem com
  Telefone, WhatsApp, Câmera, Chrome e Claude, se existirem.
- **Agora**: toque no cartão para escrever a tarefa, quebrar em passos
  pequenos e escolher o bloco de 15, 25 ou 45 min. No fim, o APK vibra, toca e
  notifica, mesmo que você esteja em outro app.
- **Toque longo** num app: *Fixar no Início*, *Pôr na barra*, escolher a aba e
  *Informações do app*.

Tudo (Início, barra, abas, tarefa, passos e bloco) fica guardado só no
aparelho. Os favoritos da 1.x viram a aba Início.

**Quatro temas** — a bolha 🎨 do mostrador gira entre eles (Nexo → Grafite → 3D →
Britagem), e o comando `tema` também (`tema 3d`, `tema britagem`, `tema claro`…). A escolha fica guardada no
aparelho:

| Tema | Cores | Letra | Formas |
|---|---|---|---|
| **Nexo** | roxo `#23083b` e dourado `#f5b942` | Plus Jakarta Sans | contornos coloridos, clima em colunas com ícones |
| **Grafite** (redesign do Lovable) | grafite `#0e1418`, âmbar `#f2b33d` e ciano `#5cd3dc` | Space Grotesk | vidro fosco, clima em pílulas, abas com risquinho, folhas que sobem macias |
| **3D** (redesign v3 do Lovable) | as do Grafite | Space Grotesk | o Grafite com profundidade: sombras em camadas, reflexo de vidro, hora metálica, ícones com brilho, botões que afundam, entrada em cascata, luzes e grade em perspectiva no fundo; o mostrador inclina com o dedo e com o movimento do celular |
| **Britagem** (claro, como o app Britagem) | creme `#fbf4ec` e abóbora `#e0662a` | a do sistema (Roboto) | cartões brancos com sombra quente; as abas ficam **em pé na lateral esquerda** (INÍCIO, DEV, TRABALHO…), a aberta em abóbora e mais larga. No APK 2.5.0, os ícones das barras do Android ficam escuros no creme (no APK antigo as barras vão em abóbora) |

Nos dois, os números e o terminal usam
[JetBrains Mono](https://www.jetbrains.com/lp/mono/). As letras
([Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans),
[Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk); todas OFL)
vêm em `fontes/` para abrir offline. No APK 2.3.0, as barras do Android
acompanham a cor do tema.

## Instalar no Redmi Note 10

1. Baixe o APK:
   <https://github.com/gilsonbolivar-maker/Oficina/releases/download/inicio-apk/inicio.apk>
2. Abra o arquivo e permita *instalar apps desconhecidos* para o navegador.
3. Abra o **Início** uma vez com internet (ele guarda a página para usar offline).
4. Toque em **Escolher** no aviso do topo, ou vá em
   **Configurações › Apps › Gerenciar apps › ⋮ › Apps padrão › Tela inicial**
   e escolha **Início**.

Para voltar à tela do Redmi: mesmo caminho, escolha **Tela inicial do sistema**.

> No MIUI, os **gestos de tela cheia** podem não funcionar com launcher de
> terceiros em versões antigas. Se o gesto de voltar ao início parar, use os
> botões de navegação (Configurações › Tela › Tela cheia).

## Como funciona

```
 APK (inicio/android)                Página (inicio/)
 ┌───────────────────────┐          ┌──────────────────────────┐
 │ MainActivity          │  abre    │ index.html · app.js      │
 │  categoria HOME       │ ───────► │ relógio, busca, favoritos│
 │  WebView              │          │                          │
 │  ponte InicioNativo ◄─┼──────────┤ apps() · icone() ·       │
 │                       │          │ abrir() · info() …       │
 └───────────────────────┘          └──────────────────────────┘
```

- O APK abre a página do site; o service worker guarda a página para abrir sem
  rede. Se nunca abriu com rede, aparece a lista simples `sem-rede.html` que
  vem dentro do APK — a tela inicial nunca fica em branco.
- Mudança só na página (`app.js`, `app.css`) chega sozinha, sem reinstalar.
  Mudança em `inicio/android/` recompila o APK pelo workflow `apk-inicio.yml`.
- No navegador comum a página mostra uma lista de exemplo, para ver o visual;
  o fim do bloco vibra e apita pela própria página (só com ela aberta).
- O mostrador completo precisa do APK 2.1.0 (bateria com temperatura,
  armazenamento, rede, notificações e localização). Com um APK mais antigo, a
  página atualiza sozinha e mostra o que der: clima por `cidade`, CI e foco.
