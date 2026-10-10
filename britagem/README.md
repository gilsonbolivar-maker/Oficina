# Britagem

Relatório de turno da britagem direto no celular: **paradas**, **detector de
metal** e **leituras** anotados na hora, com o resumo pronto para passar
adiante. Funciona **sem internet** e tudo fica neste aparelho.

- Publicado em: <https://gilsonbolivar-maker.github.io/Oficina/britagem/>

## As quatro telas

| Tela | Serve para |
| ---- | ---------- |
| **Turno** | Os três botões de registro e a linha do tempo do que já aconteceu. |
| **Leituras** | A tabela hora a hora de horímetro, balança e ácido, com a variação calculada. |
| **Resumo** | Tempo parado por equipamento, números do turno e a saída do relatório. |
| **Turnos** | Todos os turnos guardados; toque em um para voltar a ele. |

## Como se usa no turno

1. **Abrir turno** — data, turno (**A, B, C, D, E** ou outro), hora de início e o operador.
2. Conforme as coisas acontecem, toque em **⏸ Parada**, **🧲 Detector** ou
   **📋 Leitura**. Todo campo de hora tem o botão **agora**.
3. Parada sem hora de fim fica **em andamento**, com o relógio correndo e o
   botão **Encerrar agora** à mão.
4. No fim, em **Resumo**: anote a produção, **Copie o relatório** e
   **Encerre o turno**.

## O que cada registro guarda

| Registro | Campos |
| -------- | ------ |
| **Parada** | Equipamento (AA140, Rebritagem, Primário — ou **Outro…**, que abre o campo para digitar o nome), motivo, início e fim |
| **Detector DT 1101** | Hora que acionou, hora que liberou, 👍 metal encontrado / 👎 não encontrado |
| **Leitura** | Hora, horímetro, balança, ácido — ou a marca de **usina parada**. Os campos abrem o **teclado numérico** e aceitam vírgula ou ponto. |
| **Turno** | Data, turno (A a E), operador, produção em toneladas |

A duração é **calculada sozinha** a partir do início e do fim, então não há
mais conta de minuto na mão. Parada esquecida aberta para de contar no fim do
turno (ou em 16h), para não inventar um total de dias.

## Passar adiante

| Botão | Resultado |
| ----- | --------- |
| **Copiar relatório** | Texto pronto para colar numa mensagem ou e-mail |
| **Baixar CSV** | Planilha (`;` e acento certo) que abre no Numbers e no Excel |

Exemplo do texto copiado:

```
BRITAGEM — 10/10/26 · Turno C · OPERADOR
Início 06h00 · em andamento

PARADAS
· Rebritagem  06h20 → 06h48  (28min) — Afunilamento
· AA140  07h35 → 08h40  (1h05) — Moega baixa
  AA140: 1h05
  Rebritagem: 28min
  TOTAL PARADO: 1h33

DETECTOR DE METAL (DT 1101)
· 06h53 → 06h55  👍 metal encontrado

LEITURAS  (hora · horímetro · balança · ácido)
· 06h30  1000,0  ·  80  ·  0,60

PRODUÇÃO: 500 t
Horímetro rodado: 2,00
Ácido médio: 0,60
```

## Instalar

1. Abra o endereço no **Safari** (iPhone/iPad) ou no **Chrome** (Android).
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Abra pelo ícone. A partir daí funciona no modo avião.

## Como foi montado

| Arquivo | O que faz |
| ------- | --------- |
| `index.html` | As quatro telas e a caixa de formulário. |
| `app.css` | Visual escuro, alvos grandes para o toque com luva. |
| `dados.js` | Guarda os turnos no IndexedDB do aparelho. |
| `app.js` | Registros, contas de tempo, resumo e exportação. |
| `sw.js` | Guarda o app no aparelho para abrir offline. |

**Privacidade:** o repositório guarda só o app. Os turnos ficam no aparelho de
quem usa — nada é enviado para servidor nenhum.

**De onde veio o formato:** a planilha *Britagem* usada no turno, com as
colunas de paradas por equipamento, o detector DT 1101 e as leituras horárias.
