# PixelMusic

PWA que toca as músicas guardadas no próprio celular, com equalizador e
reforço de grave — nenhum arquivo sai do aparelho, nada é enviado para fora.

Página estática em HTML, CSS e JavaScript puros — sem build, sem dependências,
sem servidor. Depois da primeira visita ela abre offline (as músicas em si vêm
sempre da pasta escolhida no aparelho, não do cache).

## Como usar

1. Toque em **Escolher pasta de música** e selecione a pasta onde ficam as
   músicas no aparelho (por exemplo, *Music* ou *Download*).
2. Toque numa faixa da lista para tocar. Os botões de baixo controlam
   anterior/próxima, aleatório e repetir.
3. A barra de progresso mostra e permite arrastar a posição da faixa.
4. Em **🎚 Equalizador**, arraste as 5 faixas de frequência (60 Hz a 14 kHz,
   de -12 a +12 dB) e o **Reforço de grave** (0 a 100%). Os ajustes ficam
   salvos no aparelho e valem para as próximas músicas também.

Como o navegador não guarda permissão para a pasta entre visitas, é preciso
escolhê-la de novo a cada vez que o app abre. **No app Android (APK) não**: a
pasta fica guardada e é lida sozinha na próxima vez que o app abrir (veja
abaixo).

O equalizador usa a Web Audio API: o `<audio>` passa por 5 filtros
`BiquadFilterNode` (um por faixa de frequência) e depois por um filtro
`lowshelf` para o reforço de grave, antes de chegar na saída. Isso só é
montado no primeiro toque em tocar (o navegador exige um gesto do usuário
para o `AudioContext` funcionar); sem isso o áudio toca normal, sem efeito.

### App Android (APK) — toca com a tela apagada

Baixe em
<https://github.com/gilsonbolivar-maker/Oficina/releases/download/pixelmusic-apk/pixelmusic.apk>.

| | Pelo navegador | App Android (APK) |
|---|---|---|
| Tela | precisa ficar acesa para controlar | **pode apagar** |
| Controles | só na página | **na notificação e na tela de bloqueio** |
| Pasta de música | pede de novo sempre | **guardada; abre sozinha da próxima vez** |

Quem decodifica, equaliza e toca o áudio é sempre a página, no `<audio>` dela
(com a cadeia de filtros Web Audio); o APK acrescenta duas coisas nativas:

- Uma notificação de mídia (`PlayerService`, com
  `android.media.session.MediaSession`) que mostra os controles e repassa os
  comandos de volta à página por `window.pixelmusicComando(...)`. A página
  avisa o app a cada troca de estado pela ponte `window.PixelMusicNativo`.
- A pasta escolhida: na primeira vez que o usuário escolhe uma pasta, o APK
  guarda a permissão dela para sempre (Storage Access Framework —
  `takePersistableUriPermission`). Da próxima vez que o app abre, a página
  chama `PixelMusicNativo.listarPastaSalva()` e recebe a lista de músicas
  pronta; cada faixa toca direto do `content://` da pasta, servido pela
  própria `MainActivity` (`shouldInterceptRequest`, com suporte a
  `Range` para a barra de progresso funcionar bem). Escolher outra pasta
  troca a guardada.

O código fica em `android/` e o GitHub Actions
(`.github/workflows/apk-pixelmusic.yml`) compila e publica o APK quando esse
código muda.
