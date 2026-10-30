# Tocador

PWA que toca as músicas guardadas no próprio celular — nenhum arquivo sai do
aparelho, nada é enviado para fora.

Página estática em HTML, CSS e JavaScript puros — sem build, sem dependências,
sem servidor. Depois da primeira visita ela abre offline (as músicas em si vêm
sempre da pasta escolhida no aparelho, não do cache).

## Como usar

1. Toque em **Escolher pasta de música** e selecione a pasta onde ficam as
   músicas no aparelho (por exemplo, *Music* ou *Download*).
2. Toque numa faixa da lista para tocar. Os botões de baixo controlam
   anterior/próxima, aleatório e repetir.
3. A barra de progresso mostra e permite arrastar a posição da faixa.

Como o navegador não guarda permissão para a pasta entre visitas, é preciso
escolhê-la de novo a cada vez que o app abre.

### App Android (APK) — toca com a tela apagada

Baixe em
<https://github.com/gilsonbolivar-maker/Oficina/releases/download/tocador-apk/tocador.apk>.

| | Pelo navegador | App Android (APK) |
|---|---|---|
| Tela | precisa ficar acesa para controlar | **pode apagar** |
| Controles | só na página | **na notificação e na tela de bloqueio** |

Quem decodifica e toca o áudio é sempre a página, no `<audio>` dela; o APK só
acrescenta uma notificação de mídia nativa (`PlayerService`, com
`android.media.session.MediaSession`) que mostra os controles e repassa os
comandos de volta à página por `window.tocadorComando(...)`. A página avisa o
app a cada troca de estado pela ponte `window.TocadorNativo`. O código fica em
`android/` e o GitHub Actions (`.github/workflows/apk-tocador.yml`) compila e
publica o APK quando esse código muda.
