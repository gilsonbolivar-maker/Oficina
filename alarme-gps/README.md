# Alarme GPS

PWA que toca uma sirene quando você chega perto de um ponto marcado no mapa.
Feito para dormir no ônibus sem perder o ponto de descida.

Página estática em HTML, CSS e JavaScript puros — sem build, sem dependências,
sem servidor. Depois da primeira visita ela abre offline; só o desenho do mapa
precisa de rede.

## Como usar

1. Abra o app e toque em **Novo ponto**.
2. Arraste o mapa até o lugar (a mira vermelha fica sempre no centro) ou busque
   o endereço pelo campo de cima.
3. Escolha a que distância o alarme deve tocar — de 50 m a 3 km.
4. Dê um nome, salve e toque em **Vigiar**.

A partir daí o app acompanha a posição pelo GPS e mostra quanto falta. Ao entrar
no raio escolhido, a tela fica vermelha, o celular vibra e a sirene toca até você
tocar em **Parar alarme**. Com o bipe de aproximação ligado, um sinal curto avisa
quando falta o dobro do raio.

### Instalar no Android

Abra o site no Chrome e use **Instalar app** (ou "Adicionar à tela inicial") no menu
do navegador. Instalado, ele abre em tela cheia, sem barra de endereço.

## Mapa sem internet

Ao criar ou editar um ponto, o botão **Guardar mapa desta área** baixa os pedaços do
mapa num raio de 1,5 km em volta dele, nos zooms 13 a 16 — cerca de 75 imagens, uns
poucos megabytes. Depois disso o mapa desenha mesmo em modo avião ou sem sinal.

O download é feito devagar, uma imagem de cada vez, e nunca passa de 200 imagens por
área: os servidores do OpenStreetMap são mantidos por doação e a política de uso deles
não admite download em massa. Guardar a área do seu ponto de descida é uso pessoal
normal; varrer uma cidade inteira não é.

Em *Ajustes* aparece quantos pedaços estão guardados e um botão para apagar tudo.

O que já foi visto na tela também fica guardado sozinho, mas isso é limitado e vai
sendo descartado conforme você navega — para viagem, use o botão.

> No iPhone e no iPad, o Safari descarta os dados de sites que ficam uma semana sem
> uso. Adicionando o app à Tela de Início isso não acontece: o armazenamento passa a
> ser tratado como permanente (o app também pede isso ao navegador ao guardar o mapa).

### Instalar no iPhone e no iPad

Abra o site **no Safari** (o botão "Instalar" do Chrome não existe no iOS) e use
**Compartilhar → Adicionar à Tela de Início**. Instalado, ele abre em tela cheia e
passa a poder mostrar notificações — no iOS, notificação de site só funciona depois
de adicionado à tela de início.

No iPhone e no iPad valem três cuidados a mais:

- **Desligue o modo silencioso e deixe o volume alto.** O iOS cala som gerado pela
  Web Audio API quando o aparelho está no silencioso. Por isso a sirene deste app é
  montada como um WAV e tocada por um elemento `<audio>`, que continua sendo ouvido
  — mas o volume de mídia ainda precisa estar em pé.
- **Não há vibração.** O iOS não expõe a API de vibração para sites; a opção some
  sozinha do menu de ajustes por lá. O aviso é visual e sonoro.
- **iPad só de Wi‑Fi não tem GPS.** Os modelos Wi‑Fi se localizam pelas redes sem fio
  ao redor, com erro de dezenas ou centenas de metros e sem atualizar direito em
  movimento — não dá para confiar num alarme de percurso. Modelos com Cellular têm
  GPS de verdade e funcionam como um celular. Para pegar ônibus, o celular é a
  ferramenta certa.

A trava de tela funciona no iPadOS/iOS 16.4 ou mais novo. Em versões anteriores a
tela apaga sozinha e o alarme para — ajuste *Ajustes → Tela e Brilho → Bloqueio
Automático* para *Nunca* enquanto estiver usando.

## Limites que vale conhecer

- **Deixe o app aberto e a tela acesa.** O Android congela páginas em segundo
  plano; com a tela bloqueada o GPS para de reportar e o alarme atrasa ou não
  toca. Por isso o app pede a trava de tela (*Wake Lock*) enquanto vigia — ela
  segura a tela acesa sozinha, mas não funciona com o aparelho bloqueado.
  Um site não tem como rodar rastreamento em segundo plano como um app nativo.
- **Precisa de HTTPS.** Geolocalização, service worker e trava de tela só
  funcionam em `https://` (ou em `http://localhost`, para testar).
- **A precisão é a do GPS do aparelho** — normalmente 5 a 30 m a céu aberto,
  pior dentro de veículos e entre prédios. Raios muito curtos (50 m) podem
  disparar tarde; para ônibus, 300 a 500 m costuma ser um bom valor.
- Os pontos ficam salvos só neste navegador (`localStorage`) e o mapa guardado,
  no cache do site. Limpar os dados do site apaga os dois.

## Publicar

É só servir a pasta. Pelo GitHub Pages, com o repositório publicado, o app fica
em `https://<usuário>.github.io/<repositório>/alarme-gps/` — todos os caminhos
são relativos, então funciona em qualquer subpasta.

Para testar na máquina:

```sh
cd alarme-gps
python3 -m http.server 8080
```

E abra `http://localhost:8080`.

## Estrutura

```
index.html            telas: lista, editor de ponto e alarme
app.css               estilos (tema escuro, layout de celular)
app.js                estado, armazenamento, rastreio e disparo
mapa.js               mapa deslizante próprio sobre tiles do OpenStreetMap
alarme.js             sirene: WAV montado na hora + reserva em Web Audio
sw.js                 service worker: app offline, mapa guardado e cache dos tiles
manifest.webmanifest  dados de instalação do PWA
icones/               ícones 180, 192, 512 e maskable
```

Nada aqui é gerado por ferramenta: os arquivos do repositório são exatamente os
que o navegador recebe.

## Créditos

Mapa e busca de endereços por [OpenStreetMap](https://www.openstreetmap.org/copyright)
e Nominatim, usados dentro da política de uso gratuito dos projetos. O alarme é
gerado na hora pelo próprio navegador — não há arquivo de áudio.
