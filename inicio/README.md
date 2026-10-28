# Início

Tela inicial (launcher) para Android, feita para o Redmi Note 10. A 2.0 tem a
cara do **Pixel Nexo** (roxo noturno e dourado, ícones com degradê, abas de
fichário, barra de comando), mas com os **apps de verdade** do celular e sem o
celular falso desenhado na tela. Do **Foco Dev** ficou o foco: uma tarefa por
vez e o bloco de foco que avisa no fim.

```
 14:32                    [v2.0.0]   relógio e versão
 ▸ AGORA  Publicar o app   29:59     tarefa + bloco (toque abre a folha)
 [★ Início][>_][▣][♥][▦]             abas: Início · Dev · Trabalho · Social · Oficina
 ┌────────────────────────────┐
 │  apps da aba               │      deslize para o lado: troca de aba
 └────────────────────────────┘
 foco 25 · foco 45 · tarefa …        atalhos de comando
 nexo:~$ buscar ou comando  →        busca e comandos
            ⌃                        gaveta com todos os apps (ou deslize para cima)
 [ barra fixa: até 5 apps ]
```

- **Abas de fichário.** *Início* tem os apps que você fixou. *Dev*,
  *Trabalho* e *Social* se enchem sozinhas pelo tipo de app (GitHub, Termux,
  Claude… / Gmail, Agenda, Drive… / WhatsApp, Instagram, YouTube…). *Oficina*
  tem os apps da Oficina (Alarme GPS, Britagem, SINAL e PAINEL abrem o APK, se
  estiver instalado). Toque e segure qualquer app para mudá-lo de aba.
- **Barra de comando** `nexo:~$`: digite e o app aparece; *Enter* abre.
  Comandos: `foco 30` (começa um bloco de 30 min), `tarefa revisar o PR`,
  `pausar`, `gaveta`, e o nome de uma aba (`dev`, `oficina`…).
- **Gaveta** com todos os apps de A a Z, com busca: toque em ⌃ ou deslize para
  cima; deslize para baixo (ou o voltar) fecha.
- **Barra fixa** embaixo, com até 5 apps. Na primeira vez ela já vem com
  Telefone, WhatsApp, Câmera, Chrome e Claude, se existirem.
- **Agora**: toque no cartão para escrever a tarefa, quebrar em passos
  pequenos e escolher o bloco de 15, 25 ou 45 min. No fim, o APK vibra, toca e
  notifica, mesmo que você esteja em outro app.
- **Toque longo** num app: *Fixar no Início*, *Pôr na barra*, escolher a aba e
  *Informações do app*.

Tudo (Início, barra, abas, tarefa, passos e bloco) fica guardado só no
aparelho. Os favoritos da 1.x viram a aba Início.

**Visual:** roxo `#23083b` e dourado `#f5b942`, letras
[Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) e
[JetBrains Mono](https://www.jetbrains.com/lp/mono/) (as duas com licença OFL),
que vêm em `fontes/` para abrir offline.

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
