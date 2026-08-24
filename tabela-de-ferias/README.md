# Tabela de Férias

Tabela para a equipe marcar os pedidos de férias: início e fim de cada período,
um espaço de observações para cada colega e um mapa do ano mostrando quem está
fora e quando.

Página estática em HTML, CSS e JavaScript puros — sem build, sem dependências,
sem servidor. Depois da primeira visita ela abre offline.

## Como usar

1. Cada colega tem uma linha. Marque **início** e **fim** do período de férias
   nos dois seletores de data.
2. Precisa dividir as férias? **＋ período** acrescenta outra faixa de datas para
   a mesma pessoa.
3. Use o campo de **observações** para o que precisar ficar registrado — troca de
   plantão, emenda com feriado, preferência de mês.
4. A contagem de dias de cada período e o total do colega aparecem sozinhos.

Ao preencher só o início, o fim vem sugerido com 30 dias — é só trocar se o
pedido for menor.

O grupo já vem preenchido com os nomes da equipe. Os nomes são editáveis: é só
clicar em cima. **＋ Adicionar colega** inclui quem faltar e o **✕** ao lado do
nome remove.

## O que a tabela mostra sozinha

- **Dias de cada período** e o **total de cada colega**. Passando de 30 dias, o
  total fica vermelho — é o teto de um período aquisitivo na CLT.
- **Coincidências**: quando duas pessoas ficam fora ao mesmo tempo, os períodos
  são destacados e a sobreposição é listada abaixo da tabela, com as datas e
  quantos dias se cruzam. É só um aviso; nada impede a marcação.
- **Mapa do ano**: uma barra por período, do jan ao dez, com a linha verde do dia
  de hoje. As barras vermelhas são as que coincidem com as de outro colega.

O aviso de 30 dias e o de coincidência são conferências de bom senso, não
validação jurídica: quem fecha a escala é o RH.

## Guardar e passar adiante

Tudo é gravado sozinho **no navegador deste aparelho** (`localStorage`) — ninguém
mais enxerga a sua tabela, e limpar os dados do site apaga tudo.

Como não há servidor, a tabela viaja em arquivo:

- **Salvar arquivo** baixa um `.json` com a tabela inteira. Mande para quem
  precisa; quem recebe abre em **Abrir arquivo** (isso substitui a tabela que
  estiver aberta).
- **Baixar CSV** gera uma planilha (`;` e datas em dd/mm/aaaa, do jeito que o
  Excel em português abre direto).
- **Imprimir** sai em papel ou PDF: fundo branco, sem botões, e as datas viram
  texto — as linhas em branco ficam prontas para preencher à mão.

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
app.css               estilos (tema escuro, layout de celular e de impressão)
app.js                estado, contas, coincidências, mapa, CSV e arquivo
sw.js                 service worker: abre sem rede
manifest.webmanifest  dados de instalação do PWA
icones/               ícones 180, 192, 512 e maskable
```

Nada aqui é gerado por ferramenta: os arquivos do repositório são exatamente os
que o navegador recebe.
