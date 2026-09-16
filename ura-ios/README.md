# IOs da URA

PWA para consultar e treinar as Instruções Operacionais da URA no iPad ou no
iPhone, sem internet.

- **Buscar** — acha o passo, o equipamento ou a instrução e mostra o texto
  exato do documento, com a origem (IO, tabela, página).
- **Instruções** — as IOs por área, com os procedimentos em passos numerados.
  Tocar num passo marca como feito, para acompanhar a execução.
- **Treinar** — perguntas montadas a partir das próprias IOs, com a fonte da
  resposta e um resumo de onde você mais erra.

## O conteúdo não fica aqui

Este repositório é público e as IOs têm controle de cópias. Por isso **o app
não traz nenhuma instrução dentro dele**: você carrega o arquivo da base no
aparelho, uma vez, e ele fica só ali (IndexedDB do próprio navegador).

```
   REPOSITÓRIO (público)          SEU APARELHO (privado)
   ┌────────────────────┐         ┌──────────────────────┐
   │  o app, vazio      │  ───►   │  você importa a base │
   │  busca e treino    │         │  e ela não sai de lá │
   └────────────────────┘         └──────────────────────┘
```

Nada é enviado para servidor nenhum: não há requisição de rede depois que a
página carrega. Para tirar as instruções do aparelho, use **Ajustes → Apagar**.

## Instalar no iPad ou iPhone

1. Abra <https://gilsonbolivar-maker.github.io/Oficina/ura-ios/> no Safari
2. **Compartilhar → Adicionar à Tela de Início**
3. Abra pelo ícone e toque em **Escolher arquivo**
4. Selecione o arquivo da base (o app Arquivos mostra também o Google Drive)

Depois disso ele funciona offline, inclusive em modo avião.

## Formato da base

Um JSON com esta forma:

```json
{
  "versao": 1,
  "gerado": "2026-09-16",
  "ios": [{
    "codigo": "IO-URA-XX-00", "titulo": "AA-000 - NOME DA INSTRUÇÃO",
    "area": "AA-000", "revisao": "01", "data": "01/01/2026", "n_paginas": 6,
    "secoes": [{ "n": "1", "titulo": "OBJETIVO", "texto": "…" }],
    "procedimentos": [{
      "titulo": "Tabela 0.0 — Passos do Procedimento…", "pagina": 5,
      "passos": [{ "n": "1", "acao": "…", "obs": "" }]
    }],
    "paginas": [{ "n": 1, "texto": "…" }]
  }],
  "siglas": [{ "sigla": "XX-0000", "definicao": "…", "io": "IO-URA-XX-00" }],
  "perguntas": [{
    "id": "q1", "tipo": "passo", "enunciado": "…",
    "alternativas": ["…"], "correta": 2, "fonte": { "io": "IO-URA-XX-00", "onde": "pág. 5" }
  }]
}
```

Só `ios` (com `codigo` e `titulo`) é obrigatório: sem `perguntas` o app
funciona como consulta, sem `siglas` a busca ignora o glossário.

## Limites, ditos com clareza

- O app **não interpreta nem reescreve** nada: ele localiza e exibe o texto do
  documento. Se não achar, diz que não achou — não oferece o parecido.
- A base é uma cópia. **Confira a revisão vigente** antes de executar qualquer
  procedimento; quando uma IO for revisada, gere o arquivo de novo.
- Alguns procedimentos têm numeração fora de sequência. Isso vem do próprio
  PDF (há IOs que pulam um número); o app mostra o que está lá.

## Arquivos

| Arquivo | Papel |
| ------- | ----- |
| `index.html` | as telas |
| `app.js` | navegação, leitor das IOs e treino |
| `busca.js` | índice e ranqueamento da busca |
| `dados.js` | guarda a base no aparelho (IndexedDB) |
| `treino.js` | montagem das rodadas de perguntas |
| `sw.js` | funcionamento offline |

Ao mexer no app, mantenha a `VERSAO` igual em `app.js` e `sw.js` — é ela que
troca o cache offline.
