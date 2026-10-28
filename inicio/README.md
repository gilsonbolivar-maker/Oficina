# Início

Tela inicial (launcher) para Android, feita para o Redmi Note 10.

- **Relógio e data** grandes no topo.
- **Busca**: digite e o app aparece; *Enter* abre o primeiro.
- **Favoritos**: toque e segure qualquer app → *Fixar nos favoritos*. No mesmo
  menu dá para mover para a esquerda/direita ou abrir as informações do app.
- **Oficina**: atalhos para os apps da Oficina. Alarme GPS, Britagem, SINAL e
  PAINEL abrem o APK se estiver instalado; os outros abrem o site.
- **Todos os apps** do celular, em ordem alfabética, com os ícones de verdade.

Os favoritos ficam guardados só no aparelho.

## Instalar no Redmi Note 10

1. Baixe o APK:
   <https://github.com/gilsonbolivar-maker/Oficina/releases/download/inicio-apk/inicio.apk>
2. Abra o arquivo e permita *instalar apps desconhecidos* para o navegador.
3. Abra o **Início** uma vez com internet (ele guarda a página para usar offline).
4. Toque em **Escolher** no aviso amarelo, ou vá em
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
- No navegador comum a página mostra uma lista de exemplo, para ver o visual.
