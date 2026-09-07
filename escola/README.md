# Escola

App de treino. Serve para mexer no código sem medo: **nada aqui afeta o
Caderno Pencil** — são pastas separadas.

<https://gilsonbolivar-maker.github.io/Oficina/escola/>

## O arquivo da aula

Só um: [`index.html`](index.html). Ele tem tudo — aparência, tela e ação — e
cabe numa olhada. As três partes estão marcadas dentro dele:

| Parte | O que é | Exemplo do que dá para mudar |
| ----- | ------- | ---------------------------- |
| 1 — Aparência | cores e tamanhos | a cor do fundo, o tamanho do botão |
| 2 — Tela | o que aparece | o título, a palavra do botão |
| 3 — Ação | o que acontece ao tocar | somar 2 em vez de 1 |

Os outros arquivos (`sw.js`, `manifest.webmanifest`, `icones/`) são o
encanamento que faz o app abrir sem internet e virar ícone na Tela de Início.

## Por que a rede vem primeiro aqui

O `sw.js` da Escola busca da rede antes do cache — ao contrário do Caderno. É
de propósito: uma mudança publicada aparece **na hora** ao recarregar, sem
cache velho atrapalhando a aula. Sem internet, o cache assume.
