# Britagem

Relatório de turno da britagem direto no celular: **paradas**, **detector de
metal** e **leituras** anotados na hora, com o resumo pronto para passar
adiante. Funciona **sem internet** e tudo fica neste aparelho.

- Publicado em: <https://gilsonbolivar-maker.github.io/Oficina/britagem/>

## As quatro telas

| Tela | Serve para |
| ---- | ---------- |
| **Turno** | Os três botões de registro e a linha do tempo do que já aconteceu. |
| **Leituras** | A leitura **inicial** e **final** dos totalizadores, a tabela hora a hora e a **somatória do turno**. |
| **Resumo** | Tempo parado e **tempo rodando** por equipamento, números do turno e a saída do relatório. |
| **Turnos** | Todos os turnos guardados; toque em um para voltar a ele. No fim da tela fica a **versão do app** e o botão de procurar atualização. |

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
| **Funcionamento** | Por equipamento: hora de entrar e de sair |
| **Parada** | Equipamento (AA140, Primário, Rebritagem — ou **Outro…**, que abre o campo para digitar o nome), motivo, início e fim |
| **Detector DT 1101** | Hora que acionou, hora que liberou, 👍 metal encontrado / 👎 não encontrado |
| **Leitura inicial / final** | Hora e o número cheio do totalizador: horímetro, balança e ácido |
| **Leitura hora a hora** | Hora, horímetro, balança, ácido — ou a marca de **usina parada**. Os campos abrem o **teclado numérico** e aceitam vírgula ou ponto. |
| **Turno** | Data, turno (A a E), operador, produção em toneladas |

## Cada equipamento tem a sua hora

**AA140, Primário e Rebritagem entram e saem em horários próprios**, que não são
os do turno. O cartão **Funcionamento**, no alto da tela do turno, guarda isso:

```
Funcionamento
AA140          07h00 → 15h00       [Reabrir]
Primário       06h30 → 14h00       [Reabrir]
Rebritagem     desde 08h00 · 5h20  [Encerrar]
```

- **Iniciar** / **Encerrar** marcam a hora na mesma batida;
- toque no **nome** para corrigir ou limpar os horários;
- sem horário informado, vale o do turno — o que já estava registrado
  continua valendo.

É essa janela que manda nas contas: o tempo rodando e a porcentagem saem
**sobre o tempo em que aquele equipamento esteve em campo**, não sobre o turno
inteiro. Parada fora da janela não entra na conta.

## Leitura inicial, final e somatória

A aba **Leituras** segue a ordem do turno:

```
┌ Leitura inicial ──────── às 00h30 ┐
│ Horímetro            4150,28 h    │
│ Balança            355781,15 t    │
│ Ácido                     1388    │
├ Hora a hora ──────────────────────┤
│ 01h30   4151,33   83   0,68       │
│ 02h30   4152,20   84   0,69       │
├ Leitura final ────────── às 07h30 ┐
│ Horímetro            4156,68 h    │
│ Balança            356310,20 t    │
│ Ácido                     1392    │
├ Somatória do turno ───────────────┤
│ Horímetro rodado         6,40 h   │
│ Balança no turno       529,05 t   │
│ Ácido consumido               4   │
└───────────────────────────────────┘
```

A **somatória é a diferença entre a final e a inicial**, medida por medida — a
conta que antes era feita de cabeça no fim do turno. Ela também entra nos
**Números do turno**, no relatório copiado e no CSV (linhas `inicial`, `final`
e `somatoria`).

**Unidades:** o horímetro marca **horas (h)** e a balança, **toneladas (t)** —
as duas aparecem com a unidade na tela, no relatório e no cabeçalho do CSV
(`horimetro_h`, `balanca_t`). Como a balança já pesa em tonelada, a produção do
turno pode sair dela: o campo **Produção** sugere o valor e enche sozinho ao
toque de um botão.

As leituras **hora a hora** continuam como estavam: ali a balança e o ácido são
a marcação do momento, não o totalizador.

## Acúmulo de tempo parado

No alto da tela do turno fica a faixa com **quanto já parou**, somado, e a
divisão por equipamento — sempre à vista, sem precisar ir ao resumo:

```
[⏸ 1h35 parado]  [AA140 1h15]  [Rebritagem 20min]
```

E cada parada na linha do tempo mostra o acumulado **até aquele ponto**:

```
AA140   09h00 → 09h45                      45min
Entupimento
▶ rodou 1h30 antes desta parada
Σ parado até aqui: AA140 1h15 · turno 1h35
```

No relatório em texto, cada parada sai com `[Σ 1h35]` no fim da linha. No CSV
são duas colunas, `acumulado_equip` e `acumulado_turno`, em minutos.

## Tempo rodando

O avesso das paradas também é calculado: para cada equipamento, o app mostra
**cada intervalo em que ele esteve funcionando** — do começo do turno até a
primeira parada, entre uma parada e a seguinte, e da última até o fim do turno —
com o total e a porcentagem do turno.

```
AA140                            7h30 rodando · 94%
07h00 → 15h00 · 8h em campo
  07h00 → 09h00                               2h
  09h30 → 15h00                             5h30
```

Na linha do tempo, cada parada traz embaixo **▶ rodou 1h30 antes desta parada**.
Paradas do mesmo equipamento que se sobrepõem contam como uma só.

## Contas de tempo

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

## Saber em que versão você está

A versão aparece em dois lugares: na tela de partida e no fim da aba
**Turnos**, junto do botão **Procurar atualização** — que busca a versão nova e
recarrega sozinho, sem precisar reinstalar.

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
