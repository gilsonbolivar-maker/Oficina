# Agenda Telefônica

Agenda para consultar e ligar **sem internet**, direto do celular ou do iPad.

O app publicado **vem vazio**: a lista de contatos não está no repositório. Você
carrega o arquivo uma vez no aparelho e ele fica guardado só ali, no IndexedDB —
nada é enviado para servidor nenhum, nem fica público no GitHub Pages.

- Publicado em: <https://gilsonbolivar-maker.github.io/Oficina/agenda-telefonica/>

## Como começar

1. Abra o endereço no **Safari** (iPhone/iPad) ou no **Chrome** (Android).
2. Toque em **Compartilhar → Adicionar à Tela de Início** e abra pelo ícone.
3. Na tela de partida, toque em **Escolher arquivo** e escolha o `.json` com a lista.
4. Pronto: daí em diante funciona no modo avião.

Para trocar por uma lista mais nova ou apagar tudo do aparelho:
**Ajustes → A base deste aparelho**.

## O que dá para fazer

| Tela | Serve para |
| ---- | ---------- |
| **Contatos** | Buscar por nome, ramal, matrícula, sigla da área ou unidade; filtrar por unidade; pular pelo índice A–Z. |
| **Favoritos** | Os contatos que você marcou com ★, sempre à mão. |
| **Áreas** | Ver as áreas com a quantidade de pessoas e abrir a lista de cada uma. |
| **Ajustes** | Escolher como discar, trocar ou apagar a base, exportar para a agenda do aparelho e procurar atualização. |

Tocar em um contato abre a ficha com **nome, área, unidade, matrícula** e os
telefones. Cada telefone é um botão de ligação (`tel:`), além de **Copiar** e
**★ Favoritar**.

## Acrescentar à mão

Nem tudo está na lista importada, então dá para completar:

| Quero | Onde |
| ----- | ---- |
| **Contato novo** | Botão **＋** ao lado da busca |
| **Mais um número** em alguém que já existe | Abra a ficha → **+ Número** |
| **Mudar nome, área, unidade ou telefones** de qualquer contato, inclusive os da lista importada | Abra a ficha → **Editar** |
| **Voltar** um contato da lista para como ele veio | Abra a ficha → **Restaurar** |
| **Apagar** um contato que você criou | Abra a ficha → **Apagar** |
| **Tirar** um número acrescentado com o *+ Número* | O **✕** ao lado dele na ficha |

Contato da lista que você mexeu aparece com **“alterado por você”** na ficha. A
lista importada em si não é tocada: a sua versão fica guardada por matrícula e o
**Restaurar** traz o original de volta a qualquer momento.

O número digitado é interpretado sozinho: **4 dígitos** viram ramal com o número
completo da faixa, celular e fixo valem com ou sem DDD. Os números que você
acrescentou ficam marcados com um ponto âmbar (**•**).

Tudo isso é guardado separado da lista importada — **trocar ou apagar a base não
leva junto** os contatos e números que você criou. Também funciona sem internet.

Quem não tem lista para importar pode tocar em **“comece uma agenda vazia”** na
tela de partida e montar a agenda do zero.

## Ramal virando telefone

A lista de origem traz o ramal de 4 dígitos. O arquivo da base já vem com o
número completo calculado pela faixa do ramal, para dar para ligar do celular:

| Ramal | Número completo | Unidade |
| ----- | --------------- | ------- |
| 8xxx | (24) 3321-8xxx | Resende |
| 4xxx | (77) 3454-4xxx | Caetité |
| 3xxx | (35) 2107-3xxx | Caldas |
| 1xxx | (21) 3797-1xxx | Rio de Janeiro |

Essas faixas foram conferidas nos próprios registros da lista, que trazem o ramal
e o número completo lado a lado. Em **Ajustes** existe a chave
**“Discar só o ramal”**: ligada, o toque disca os 4 dígitos — é o que serve num
telefone interno.

## Levar para os Contatos do celular

Em **Ajustes → Exportar**, o app gera um arquivo `.vcf` (favoritos ou a lista
inteira) para importar na agenda do aparelho. Assim o nome aparece na tela quando
alguém liga.

## Formato do arquivo da base

```json
{
  "fonte":    { "titulo": "Lista Telefônica", "data": "03/09/2026", "total": 1133 },
  "unidades": ["Resende", "Caetité", "…"],
  "areas":    [["GEPRD.N", "Gerencia de Engenharia de Produtos"], ["…", "…"]],
  "contatos": [
    ["0001", "FULANO DE TAL", 0, 0, "8000", [["r", "2433218000", "8000"]]]
  ]
}
```

Cada contato é `[matrícula, nome, índice da área, índice da unidade, ramal
original, telefones]`, e cada telefone é `[tipo, número para discar, rótulo]`,
com o tipo sendo `r` (ramal), `c` (celular), `f` (fixo) ou `o` (outro).

## Como foi montado

| Arquivo | O que faz |
| ------- | --------- |
| `index.html` | Tela de partida, as quatro telas e a ficha do contato. |
| `app.css` | Visual escuro, alvos grandes para o toque. |
| `dados.js` | Guarda e valida a base no IndexedDB, e guarda à parte o que você acrescenta. |
| `busca.js` | Índice de busca (ignora acento e caixa), agrupamento A–Z e leitura dos números digitados. |
| `app.js` | Telas, ficha, favoritos, exportação e registro do service worker. |
| `sw.js` | Guarda o app no aparelho para abrir offline. |

**Privacidade:** o repositório guarda só o app. A lista de contatos, o que você
acrescenta à mão, os favoritos e os ajustes ficam no aparelho de quem usa. O `.gitignore` desta pasta bloqueia
`contatos.js` e arquivos `.json` de base, para nenhuma lista entrar no repositório
por engano.
