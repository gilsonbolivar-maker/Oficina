# Britagem

Relatório de turno da britagem direto no celular: **paradas**, **detector de
metal** e **leituras** anotados na hora, com o resumo pronto para passar
adiante. Funciona **sem internet** e tudo fica neste aparelho.

- Publicado em: <https://gilsonbolivar-maker.github.io/Oficina/britagem/>

## As telas

As telas ficam em **abas na lateral esquerda** (Turno, Leituras, Detector, Resumo, Turnos), no estilo da Central GB — a aberta em laranja, um pouco para fora. O tema padrão é o claro, em **abóbora e creme**.

| Tela | Serve para |
| ---- | ---------- |
| **Turno** | Os botões de registro e **uma aba por área** — na aba do **Primário** fica também o **contador de caçambas** (as caçambas são contadas ao abastecê-lo), com a contagem por hora e a lista das basculadas — (Primário, Rebritagem, Pilhas): cada aba mostra só aquela área — funcionamento, tempo parado e rodando, e as paradas como **Parada** e **Retomada**. A parada nova já abre na área da aba. |
| **Leituras** | A leitura **inicial** e **final** dos totalizadores, a tabela hora a hora e a **somatória do turno**, com a **balança no turno = leitura final − leitura inicial** em destaque. |
| **Detector** | Área só do detector DT 1101: acionamentos, metal encontrado, não encontrado e tempo acionado; cada registro com **Acionou** e **Liberou** (botão *Liberou agora* no que está aberto) e a observação. |
| **Resumo** | **Uma folha por área**, sem misturar: paradas (Parada · Retomada · Duração · Motivo), parado, rodando e %. Depois os números do turno, caçambas e a saída do relatório — o texto e os PDFs seguem a mesma divisão por área. |
| **Turnos** | Todos os turnos guardados; toque em um para voltar a ele. No fim da tela ficam as **áreas carregadas**, a **aparência** (tema **Escuro** ou **Claro**, guardado no aparelho) e a **versão do app**. |

## Como se usa no turno

1. **Abrir turno** — **área**, data, turno (**A, B, C, D, E** ou outro), hora de início e o operador.
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
| **Parada** | Área (Primário, Rebritagem, Pilhas, **Máquinas**, **Operadores** — ou **Outro…**, que abre o campo para digitar o nome), a **máquina** pela tag do painel (opcional: BR-1101, TP-1103…), motivo (sempre sugere **Operadores de máquina** e **Caçamba**), início e fim. **Máquinas** (escavadeira, carregadeira…) e **Operadores** (escolha **Revezamento** ou **Parada**: Troca de turno, Jantar, Lanche, Ceia, Outro…) têm aba e bloco próprios e **não somam** no total parado da planta |
| **Detector DT 1101** | Hora que acionou, hora que liberou, 👍 metal encontrado / 👎 não encontrado |
| **Leitura inicial / final** | Hora, o número cheio do totalizador do horímetro e da balança, e do totalizador do ácido (m³) |
| **Leitura hora a hora** | Hora, horímetro, balança, ácido (m³/h) — ou a marca de **fora de operação**. Os campos abrem o **teclado numérico** e aceitam vírgula ou ponto. |
| **Turno** | Data, turno (A a E), operador, produção em toneladas |

## As áreas

O app trabalha por **área**: cada uma tem os seus equipamentos, os seus motivos
de parada, as suas medidas e o seu relatório de turno. Ao abrir o turno você
escolhe a área, e o resto da tela se ajusta a ela.

```
Área
[AA-110 · Britagem Primária] [AA-110 · Rebritagem] [AA-140 · Pilhas]
```

### A configuração não fica aqui

As IOs têm **controle de cópias**. Por isso o repositório **não traz** nenhum
equipamento, parâmetro ou medida das áreas reais: você carrega um arquivo
`.json` no aparelho, uma vez, e ele fica só ali.

```
   REPOSITÓRIO (público)          SEU APARELHO (privado)
   ┌────────────────────┐         ┌──────────────────────┐
   │  o app, genérico   │  ───►   │  você carrega as     │
   │  contas e telas    │         │  áreas e elas ficam  │
   └────────────────────┘         └──────────────────────┘
```

Sem o arquivo, o app funciona com uma **área padrão** genérica. Para carregar:
tela de partida → *carregar as áreas*, ou **Turnos → Áreas**.
Em **Turnos → Áreas → Salvar JSON** o app grava as áreas em uso (as carregadas
ou a padrão) num arquivo que o *Carregar áreas* aceita de volta.

### Formato do arquivo de áreas

```json
{
  "fonte": { "titulo": "…", "data": "…" },
  "areas": [{
    "id": "area-exemplo",
    "codigo": "AA-000",
    "nome": "Nome da área",
    "io": "IO-XXX-00 R00",
    "equipamentos": ["EQ-0001", "EQ-0002"],
    "motivos": ["Falta de energia", "Obstrução no chute"],
    "medidas": [
      { "chave": "horimetro", "rotulo": "Horímetro", "complemento": "rodado", "unidade": "h" }
    ],
    "extras": [
      { "chave": "nota", "rotulo": "Observação do turno", "tipo": "texto" },
      { "chave": "total", "rotulo": "Total", "tipo": "numero", "unidade": "t",
        "dica": "texto de apoio, opcional" }
    ]
  }]
}
```

| Campo | Para que serve |
| ----- | -------------- |
| `equipamentos` | Os botões do formulário de parada e as linhas do cartão Funcionamento |
| `tags` | Opcional: `{ "Primário": ["BR-1101", …] }`, as máquinas de cada equipamento, pela tag do painel |
| `motivos` | As sugestões do campo de motivo |
| `medidas` | As colunas da leitura inicial, da hora a hora, da final e da somatória |
| `extras` | Campos próprios da área no resumo (número da pilha, condições do rádio…) |

## Cada equipamento tem a sua hora

**Primário, Rebritagem e Pilhas entram e saem em horários próprios**, que não são
os do turno. O cartão **Funcionamento**, no alto da tela do turno, guarda isso:

```
Funcionamento
Pilhas         07h00 → 15h00       [Reabrir]
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

**Balança acumulada (Σ):** na hora a hora, cada balança mostra ao lado a soma
até ali, e o rodapé da tabela traz o total. A soma usa só as leituras hora a hora —
o totalizador da leitura inicial fica de fora. O total também sai nos Números do
turno, no relatório, no PDF e no CSV (linha `balanca_acumulada`).

## Acúmulo de tempo parado

No alto da tela do turno fica a faixa com **quanto já parou**, somado, e a
divisão por equipamento — sempre à vista, sem precisar ir ao resumo:

```
[⏸ 1h35 parado]  [Pilhas1h15]  [Rebritagem 20min]
```

E cada parada na linha do tempo mostra o acumulado **até aquele ponto**:

```
Pilhas  09h00 → 09h45                      45min
Entupimento
▶ rodou 1h30 antes desta parada
Σ parado até aqui: Pilhas1h15 · turno 1h35
```

No relatório em texto, cada parada sai com `[Σ 1h35]` no fim da linha. No CSV
são duas colunas, `acumulado_equip` e `acumulado_turno`, em minutos.

## Tempo rodando

O avesso das paradas também é calculado: para cada equipamento, o app mostra
**cada intervalo em que ele esteve funcionando** — do começo do turno até a
primeira parada, entre uma parada e a seguinte, e da última até o fim do turno —
com o total e a porcentagem do turno.

```
Pilhas                           7h30 rodando · 94%
07h00 → 15h00
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

**Quatro PDFs**, no Resumo:

| Botão | O que traz |
|---|---|
| **PDF com hora a hora** | O relatório inteiro, com as leituras hora a hora como foram lidas |
| **PDF balança distribuída** | A hora a hora com a balança **distribuída** — a diferença dos totalizadores (final − inicial) repartida na proporção de cada leitura, fechando exato no total |
| **PDF resumo** | Sem a hora a hora |
| **PDF resumo em cartões** | A cara da tela Resumo: placar no topo (parado, paradas, detector) e um cartão por área, em folha creme — mais os números do turno e o detector |


| Botão | Resultado |
| ----- | --------- |
| **Copiar relatório** | Texto pronto para colar numa mensagem ou e-mail |
| **Baixar PDF** | O turno inteiro em tabelas, para arquivar, imprimir ou anexar |
| **Baixar CSV** | Planilha (`;` e acento certo) que abre no Numbers e no Excel |

O PDF é montado pelo próprio app, sem biblioteca nenhuma (`pdf.js`, umas 220
linhas): por isso sai **no modo avião também**. Usa Helvetica, que todo leitor
de PDF já tem, e traz funcionamento, paradas, tempo rodando, detector, leituras
com a somatória e os números do turno, com rodapé e numeração de página.

Exemplo do texto copiado:

```
BRITAGEM — 10/10/26 · Turno C · OPERADOR
Início 06h00 · em andamento

PARADAS
· Rebritagem  06h20 → 06h48  (28min) — Afunilamento
· Pilhas 07h35 → 08h40  (1h05) — Moega baixa
  Pilhas: 1h05
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
| `app.css` | Visual escuro (ou claro, à escolha), alvos grandes para o toque com luva. |
| `dados.js` | Guarda os turnos e as áreas no IndexedDB do aparelho. |
| `pdf.js` | Gera o PDF do turno, sem depender de nada externo. |
| `app.js` | Registros, contas de tempo, resumo e exportação. |
| `sw.js` | Guarda o app no aparelho para abrir offline. |

**Privacidade:** o repositório guarda só o app. Os turnos ficam no aparelho de
quem usa — nada é enviado para servidor nenhum.

**De onde veio o formato:** a planilha *Britagem* usada no turno, com as
colunas de paradas por equipamento, o detector DT 1101 e as leituras horárias.

## Horímetro e ácido

O horímetro é um **COEL 1/100**: sete tambores, e os dois últimos (vermelhos)
são **centésimos de hora**. Dá para digitar como no visor — `0422216` vira
**4222,16 h** — ou com vírgula (`4222,16`). Embaixo do campo aparece como o
número foi entendido, e uma leitura menor que a anterior é recusada.

O **ácido tem dois números**:

| Onde | O que se anota | Unidade | Vira |
|---|---|---|---|
| Leitura **inicial** e **final** | o **totalizador** do instrumento | m³ | **Ácido consumido** = final − inicial |
| Leitura **hora a hora** | a **vazão** do momento | m³/h | **Ácido médio** = média das leituras |

O consumido aparece quando as duas leituras (inicial e final) estão anotadas.
Uma final menor que a inicial é recusada.
