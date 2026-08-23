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
- Os pontos ficam salvos só neste navegador (`localStorage`). Limpar os dados
  do site apaga a lista.

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
alarme.js             sirene sintetizada pela Web Audio API
sw.js                 service worker: app offline e cache dos tiles
manifest.webmanifest  dados de instalação do PWA
icones/               ícones 192, 512 e maskable
```

Nada aqui é gerado por ferramenta: os arquivos do repositório são exatamente os
que o navegador recebe.

## Créditos

Mapa e busca de endereços por [OpenStreetMap](https://www.openstreetmap.org/copyright)
e Nominatim, usados dentro da política de uso gratuito dos projetos. O alarme é
gerado na hora pelo próprio navegador — não há arquivo de áudio.
