# Escala de Férias do Grupo A

Tabela para o Grupo A marcar os pedidos de férias: **três períodos por colega**,
um espaço de observações para cada um e, embaixo de cada período, o **quadro do
mês escolhido** — em verde os dias de férias, com contorno azul as folgas do
grupo na escala de turnos.

Página estática em HTML, CSS e JavaScript puros — sem build, sem dependências,
sem servidor. Depois da primeira visita ela abre offline.

> A pasta continua chamando `tabela-de-ferias/` para não mudar o endereço de quem
> já salvou o link; o nome do app é Escala de Férias do Grupo A.

## Como usar

1. Cada colega tem **três períodos** — 1º, 2º e 3º. Marque **início** e **fim**
   nos que precisar; quem tira as férias de uma vez usa só o primeiro.
2. Ao preencher só o início, o fim vem sugerido com 30 dias — é só trocar se o
   pedido for menor.
3. O **✕** ao lado do período limpa aquelas datas (a linha continua ali).
4. Use o campo de **observações** para o que precisar ficar registrado — troca de
   plantão, emenda com feriado, preferência de mês.

O grupo já vem preenchido com os nomes da equipe, e o cabeçalho traz a supervisora
responsável. Para **trocar um nome**, toque no lápis **✎** ao lado dele (ou clique
direto no nome) e escreva por cima. **＋ Adicionar colega** inclui quem faltar e o
**✕** ao lado do nome remove.

## O quadro do mês

Assim que um período tem data, aparece embaixo dele o calendário do mês escolhido
(dois calendários, quando as férias viram o mês ou o ano). No alto do quadro fica o
período escrito por extenso, sempre em **dd/mm/aaaa**, e no calendário:

- **Verde**: os dias de férias, do primeiro ao último do período.
- **Contorno azul**: as **folgas do Grupo A** naquele mês, pela escala de turnos.
- **Ponto amarelo**: **feriado** — o nome aparece ao passar o dedo ou o mouse em cima.
- **Tracejado**: o dia de hoje.
- Embaixo, quantos dias do período já cairiam em folga e quantos feriados caem dentro dele.

Os feriados são os nacionais: os de data fixa (1º de janeiro, Tiradentes, Dia do
Trabalho, Independência, Nossa Senhora Aparecida, Finados, Proclamação da República,
Consciência Negra e Natal) e os que andam com a Páscoa — Sexta-feira Santa, e ainda
Carnaval e Corpus Christi, marcados como ponto facultativo. A Páscoa é calculada pelo
app, então vale para qualquer ano. Feriado municipal ou estadual não entra: se houver
algum que conte para o grupo, o lugar dele é o campo de observações.

## Tema claro e tema escuro

O botão **Tema claro** / **Tema escuro** troca entre fundo branco e fundo preto, e a
escolha fica guardada no aparelho. Na primeira visita o app segue o tema do sistema.
A impressão sai sempre em fundo branco, seja qual for o tema da tela.

## Datas em dd/mm/aaaa

Tudo que o app escreve — quadro do mês, coincidências, CSV e papel — sai em
dd/mm/aaaa. O seletor de data em si é o do navegador, e ele desenha no formato do
**idioma do aparelho**: em português já aparece dd/mm/aaaa. Se o navegador estiver em
outro idioma, o app percebe e escreve a data em dd/mm/aaaa logo abaixo do campo.

A escala vem do app **Escala de Turnos** (INB): um ciclo de 35 dias que se repete,
com o dia 02/08/2026 como referência. Deste ciclo o app usa só a coluna do Grupo A
— `F` é folga; `0`, `8` e `16` são as horas em que o turno começa. Fica em
`ESCALA_A`, no topo do `app.js`; mudou a escala, muda ali.

## O que a tabela mostra sozinha

- **Dias de cada período** e o **total de cada colega**. Passando de 30 dias, o
  total fica vermelho — é o teto de um período aquisitivo na CLT.
- **Coincidências**: quando duas pessoas ficam fora ao mesmo tempo, os períodos
  são destacados e a sobreposição é listada abaixo da tabela, com as datas e
  quantos dias se cruzam. É só um aviso; nada impede a marcação.
- **Mapa do ano**: uma barra por período, de jan a dez, com a linha verde do dia
  de hoje. As barras vermelhas são as que coincidem com as de outro colega.

O aviso de 30 dias e o de coincidência são conferências de bom senso, não
validação jurídica: quem fecha a escala é o RH.

## Guardar e passar adiante

Tudo é gravado sozinho **no navegador deste aparelho** (`localStorage`) — ninguém
mais enxerga a sua tabela, e limpar os dados do site apaga tudo.

Como não há servidor, a tabela viaja em arquivo:

- **Salvar PDF** abre a janela de impressão: escolha *Salvar como PDF* no destino
  (ou a impressora, para sair em papel). No papel as datas viram texto, os quadros
  saem coloridos e os períodos em branco viram linhas para preencher à mão.
  Um site não consegue gerar o PDF sozinho sem carregar uma biblioteca; quem monta
  o arquivo é o próprio navegador, por essa janela.
- **Salvar arquivo** baixa um `.json` com a tabela inteira. Mande para quem
  precisa; quem recebe abre em **Abrir arquivo** (isso substitui a tabela que
  estiver aberta).
- **Baixar CSV** gera uma planilha (`;` e datas em dd/mm/aaaa, do jeito que o
  Excel em português abre direto).

## Instalar no celular

No Android, abra no Chrome e use **Instalar app** no menu do navegador. No iPhone
e no iPad, abra **no Safari** e use **Compartilhar → Adicionar à Tela de Início**.
Instalado, abre em tela cheia e funciona sem internet.

## Publicar

É só servir a pasta. Pelo GitHub Pages, com o repositório publicado, fica em
`https://<usuário>.github.io/<repositório>/tabela-de-ferias/` — todos os caminhos
são relativos, então funciona em qualquer subpasta.

Para testar na máquina:

```sh
cd tabela-de-ferias
python3 -m http.server 8080
```

E abra `http://localhost:8080`.

## Estrutura

```
index.html            tabela, coincidências, mapa do ano e os modelos de linha
app.css               estilos (temas claro e escuro, celular e impressão)
app.js                escala, feriados, contas, quadros do mês, mapa, CSV e arquivo
sw.js                 service worker: abre sem rede
manifest.webmanifest  dados de instalação do PWA
icones/               ícones 180, 192, 512 e maskable
```

Nada aqui é gerado por ferramenta: os arquivos do repositório são exatamente os
que o navegador recebe.
