# Início

Tela inicial (launcher) calma para Android, feita para o Redmi Note 10.
Desde a 1.1.0 ela traz junto o **Foco Dev** (o launcher esboçado no Lovable):
o jeito de trabalhar e o visual dele, sem React e sem build.

- **Relógio e data** no topo; **Modo foco** esconde tudo que distrai e deixa
  só a tarefa, o bloco e os favoritos.
- **Agora estou fazendo**: uma única tarefa, quebrada em passos pequenos que
  você vai riscando.
- **Bloco de foco** de 15, 25 ou 45 minutos. No fim, o APK vibra, toca e
  notifica, mesmo que você esteja em outro app.
- **Atalhos** do Foco Dev: IA (Lovable, ChatGPT, Claude, Gemini), Código
  (GitHub, VS Code Web, Stack Overflow) e Organizar (Notas, Agenda). Se o app
  do serviço estiver instalado, abre o app; senão, o site.
- **Busca**: digite e o app aparece; *Enter* abre o primeiro.
- **Favoritos**: toque e segure qualquer app → *Fixar nos favoritos*. No mesmo
  menu dá para mover para a esquerda/direita ou abrir as informações do app.
- **Oficina**: atalhos para os apps da Oficina. Alarme GPS, Britagem, SINAL e
  PAINEL abrem o APK se estiver instalado; os outros abrem o site.
- **Todos os apps** do celular, em ordem alfabética, com os ícones de verdade.

Os favoritos, a tarefa, os passos e o bloco ficam guardados só no aparelho.

**Visual:** azul-ardósia, verde-água e areia, com a letra
[Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) (licença
OFL), feita para ler sem esforço. A fonte vem em `fontes/`, para abrir offline.

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
- O aviso do bloco precisa do APK 1.1.0. Com o APK 1.0.0, a página atualiza
  sozinha, mas o aviso só acontece com o Início na tela.
