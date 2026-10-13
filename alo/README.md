# Alô

Salas de conversa. Entre com um apelido e fale com quem estiver por aqui — nas
salas abertas, em salas privadas por convite ou a sós com alguém.

Roda inteiro no navegador, publicado pelo GitHub Pages. Não existe servidor
deste projeto: quem guarda as conversas e avisa quando chega mensagem nova é o
**Supabase**, no plano gratuito.

---

## Ligar a sala

Abra o app. Ele mostra um assistente com os quatro passos, cada um com o
botão que abre a tela certa do Supabase — não é preciso caçar nada no menu.

1. **Criar o projeto** — entrando com o GitHub, região São Paulo.
2. **Criar as tabelas** — um botão copia o `supabase.sql` e outro abre o
   SQL Editor; colar e clicar em *Run*.
3. **Ligar a entrada sem senha** — *Allow anonymous sign-ins*.
4. **Colar o Project URL e a chave anon** — e clicar em *Conferir e ligar*.

O último passo não apenas guarda os dados: ele confere os anteriores um a
um e, se algo faltou, diz qual foi e acende o cartão correspondente. Cada
passo falha de um jeito reconhecível — tabela ausente é `42P01`, entrada
anônima desligada é `anonymous_provider_disabled` — e é isso que permite
apontar o passo certo em vez de um "deu erro" que faria recomeçar tudo.

Enquanto o `config.js` estiver vazio, cada pessoa que abrir o app vê esse
assistente e os dados ficam só no navegador dela. Para a sala valer para
todo mundo, preencha [`config.js`](config.js) com os mesmos dois valores:

```js
globalThis.ALO_CONFIG = {
  url: 'https://seuprojeto.supabase.co',
  anonKey: 'eyJhbGciOi...'
};
```

## As chaves podem ficar no GitHub?

A **anon key** pode, sim — ela é pública por natureza, vai em toda requisição
que o navegador faz, e sozinha não abre nada. Quem decide o que cada pessoa lê
e escreve é o conjunto de regras de RLS do `supabase.sql`, aplicado pelo
Postgres a cada consulta.

A chave **`service_role`** é o contrário: ela ignora todas as regras. Nunca
coloque essa no `config.js` nem em qualquer arquivo deste repositório.

---

## Como funciona por dentro

```
   Navegador                        Supabase
┌───────────────┐            ┌────────────────────────┐
│ index.html    │            │  Auth  (conta anônima) │
│ app.js        │──REST─────▶│  Postgres + RLS        │
│ app.css       │◀─WebSocket─│  Realtime              │
│ sw.js  (PWA)  │            └────────────────────────┘
└───────────────┘
   GitHub Pages                  plano gratuito
```

O navegador manda só **em que sala** e **o que** foi dito. Quem assina a
mensagem — autor e horário — é o banco, a partir do token da sessão. Por isso
não adianta forjar nada no console: a resposta vem do Postgres, não daqui.

---

## Decisões que valem explicação

**Identidade vem do servidor.** A versão anterior guardava um `clientId` gerado
pelo próprio navegador e mandava o apelido junto com cada mensagem. Quem
soubesse abrir o console podia assinar como qualquer pessoa. Agora o
`auth.uid()` vem assinado no token, uma trigger carimba o autor, e a política
de RLS recusa qualquer insert que discorde. Apelido é único: quem chegou
primeiro ficou com ele.

**O limite de mensagens é contado no banco.** Antes era um `Map` na memória do
servidor — zerava a cada deploy, não valia entre instâncias, e bastava trocar o
id no navegador para burlar. Agora são 12 mensagens por minuto por conta,
contadas em SQL, mais um bloqueio de mensagem repetida em menos de 30 segundos.

**Nada de polling.** A versão anterior perguntava ao servidor a cada 1,8s
(mensagens), 4s (salas) e 8s (presença) — por aba aberta. Agora é uma conexão
WebSocket: o banco avisa quando há novidade.

**Presença não usa tabela.** Antes, cada batida de coração rodava um `DELETE`
em toda a tabela de presença. Agora é o Realtime Presence, que vive na memória
e limpa sozinho quando a aba fecha.

**Nenhuma dependência de build.** Como os outros projetos da Oficina: HTML, CSS
e JavaScript direto. A única biblioteca externa é o cliente do Supabase,
carregado por CDN em tempo de execução.

**Sem assistente de IA.** A versão anterior chamava a API do Grok com uma chave
secreta. Num site estático não existe onde esconder uma chave dessas, então o
assistente saiu. Dá para trazer de volta depois com uma Edge Function do
Supabase, que guarda a chave do lado de lá.

---

## Quando a sala encher

**Entradas anônimas têm teto.** O Supabase limita criações de conta anônima
por IP e por hora (o padrão fica perto de 30). Numa sala pequena isso não
aparece; num link que viralizou, aparece — e quem chegar depois vê a mensagem
de erro da sessão. O teto fica em **Authentication → Rate Limits**.

**Contas anônimas não somem sozinhas.** Cada pessoa que entra deixa uma conta
em `auth.users` para sempre. Não atrapalha o funcionamento, mas com o tempo
enche a cota do plano gratuito. Para limpar as que nunca falaram:

```sql
delete from auth.users
where is_anonymous
  and created_at < now() - interval '90 days'
  and id not in (select autor_id from public.mensagens);
```

Note o `not in`: contas que deixaram mensagem ficam. Apagar uma delas levaria
junto o que a pessoa disse, por causa do `on delete cascade`.

## Limites que valem conhecer

| Assunto | Como está |
|---|---|
| Mensagens carregadas | últimas 80 por sala |
| Tamanho da mensagem | 500 caracteres |
| Ritmo | 12 por minuto, por conta |
| Apelido | 2 a 24 caracteres, único |
| Salas abertas | 3 fixas (`geral`, `recados`, `cafe`) |
| Salas privadas | nome de 2 a 40 letras, até 10 novas por hora por conta |
| Histórico | não expira sozinho |

As salas abertas ficam na tabela `salas` — para criar outra, basta um
`insert` com `tipo = 'publica'`.

## Salas privadas e conversas a sós

| | Sala privada 🔒 | Conversa a sós 👤 |
|---|---|---|
| Como nasce | botão **+** em *Salas privadas* | tocar no nome de alguém em *Por aqui agora* |
| Quem entra | quem abre o link de convite | só as duas pessoas |
| Convidar | **⋯ → Convidar pessoas** | — |
| Cancelar convite | **⋯ → Gerar link novo** (só o dono) | — |
| Ir embora | **⋯ → Sair da sala** · o dono **apaga** | **⋯ → Fechar a conversa** |

O convite é um código de 64 letras e números no fim do link
(`#convite=…`). Como fica depois do `#`, ele não vai para o servidor do
GitHub Pages, e o app o tira do endereço assim que lê.

Quem decide quem é membro é o banco: não existe política de `insert` em
`membros`, então ninguém se põe numa sala pela API. Só as funções
`criar_sala`, `entrar_por_convite` e `abrir_conversa` fazem isso, cada uma
conferindo o que precisa. A leitura e a escrita de mensagens passam por
`sala_aberta()`: sala aberta, ou a pessoa é membro.

A presença ("Por aqui agora") chega a todo mundo, por isso só diz o nome
das salas **abertas**. Quem está numa sala privada aparece sem sala.

**Limite conhecido:** a conta é anônima e mora no navegador. Trocar de
aparelho, usar aba anônima ou apagar os dados do site cria uma pessoa
nova, que não está nas salas privadas antigas. É preciso um convite de
novo. Login por e-mail resolveria isso, se um dia fizer falta.

## Portaria e administração

Quem chega escolhe o apelido e fica **aguardando aprovação**: não vê salas,
mensagens nem pessoas até a administração liberar. A tela de espera abre o
app sozinha quando a aprovação chega.

```
Pessoa nova ──▶ apelido ──▶ ⏳ aguardando
                                 │
     Admin: 🔔 + "Fulano quer entrar" + selo no 🛡️
     ├─ Aprovar ──▶ entra (e cai na sala, se veio por convite)
     └─ Recusar ──▶ fica de fora
```

| Quem | Pode |
|---|---|
| **Administração** (🛡️ no topo da barra lateral) | aprovar, recusar, bloquear e desbloquear pessoas · apagar qualquer mensagem |
| **Todo mundo** | apagar as próprias mensagens |

Bloquear vale na hora: a pessoa deixa de ler e de escrever, e o app dela
fecha. Como **toda conta nova passa pela portaria**, apagar os dados do
site e voltar como outra pessoa não adianta — volta para a fila.

Tudo isso mora no banco. O navegador só consegue gravar o próprio
apelido (as colunas `situacao` e `admin` não aceitam escrita de fora), e
só a função `decidir_acesso`, que confere se quem chama é admin, muda a
situação de alguém. A primeira pessoa a se cadastrar num banco novo vira
admin. Para pôr mais alguém na administração, marque `admin` na tabela
`perfis` pelo *Table Editor*.

## Minha conta: entrar de qualquer aparelho 🔑

A conta nasce anônima e mora no aparelho. Em **🔑 Minha conta** (rodapé), ela
ganha um e-mail — confirmado por um link que o Supabase manda — e uma senha.
É a mesma conta de antes, com o mesmo id: apelido, salas, conversas e
administração continuam. Em outro aparelho, **Já tenho conta** (na entrada e
na espera) entra nela com e-mail e senha. **Esqueci a senha** manda um link
para criar outra.

No painel do Supabase, para os links voltarem para o app:
**Authentication → URL Configuration → Site URL** =
`https://gilsonbolivar-maker.github.io/Oficina/alo/` (e o mesmo em
*Redirect URLs*). O envio de e-mail do plano gratuito só entrega para os
e-mails da equipe do projeto e tem limite por hora; para outras pessoas usarem,
configure um SMTP próprio em **Authentication → Emails**.

## Excluir pessoa

🛡️ Portaria → **Excluir**, em qualquer pessoa que não seja da administração.
Diferente de **Bloquear**: apaga a pessoa e, junto, tudo o que ela disse e as
salas privadas que criou (`on delete cascade`). Não dá para desfazer. Se ela
abrir o Alô de novo, volta como pessoa nova, na portaria. Quem foi excluído com
o app aberto volta na hora para a escolha do apelido.

## Senha da administração 🔑

A entrada é sem senha, então cada jeito de abrir é uma conta: outro
aparelho, outro navegador e até o **ícone da Tela de Início** (no iPhone e
no iPad ele guarda as coisas separado do Safari). Conta nova cai na portaria.

Com a senha, qualquer conta vira admin na hora:

1. 🛡️ Portaria → **Senha da administração → Definir** (uma vez, por quem já é admin)
2. Em qualquer lugar: escolha um apelido e, na tela de espera, toque em
   **Sou da administração** e digite a senha

A senha fica embaralhada (bcrypt) numa tabela sem acesso de fora; quem
confere é a função `entrar_com_senha` no banco. São no máximo 5 erros a cada
15 minutos por conta, e a senha tem pelo menos 8 caracteres.

## Conversa secreta 🕶️

Só para a administração: o **+** em *Conversas a sós* gera um link de
**uso único** (`#secreta=…`). Quem o abre escolhe um apelido e cai direto
na conversa, **sem passar pela portaria**, mas fica *reservado*:

| A pessoa convidada | Os outros |
|---|---|
| vê só essa conversa | não veem o perfil dela |
| não vê as salas abertas nem "Por aqui agora" | não a veem em "Por aqui agora" |
| não cria sala nem abre conversa com ninguém | não conseguem chamá-la a sós |

Quem criou apaga a conversa pelo **⋯**. Na portaria, a administração vê a
pessoa como qualquer outra e pode bloquear.

## Ligar e desligar o chat

Na portaria 🛡️, **Fechar o chat**: ninguém além da administração lê nem
escreve, e todo mundo vê *"Chat fechado"* (as conversas secretas também
param). **Abrir o chat** devolve todo mundo sozinho, sem recarregar. Quem
manda é `aprovado()` no banco, que com o chat fechado só diz "sim" para a
administração.

## Limpar mensagens

No **⋯** de qualquer sala:

| Opção | Quem | Efeito |
|---|---|---|
| **Limpar minha tela** | todo mundo | esconde o que já está lá **só neste aparelho**; nada é apagado e as novas aparecem normalmente |
| **Apagar todas as mensagens** | administração | apaga tudo o que foi dito na sala, **para todo mundo** |

Para apagar uma só, há o "apagar" no rodapé de cada mensagem.

## Tirar alguém de uma sala privada

**⋯ → Pessoas da sala → Tirar** (só quem criou). A pessoa perde o acesso
na hora e o link de convite é **trocado junto**, para ela não voltar pelo
mesmo link.

## Som

Chegou mensagem de outra pessoa, toca um som: **um toque** nas salas
abertas, **dois** nas privadas e nas conversas a sós. Várias mensagens
seguidas tocam uma vez só. O sino 🔔 no rodapé da barra lateral liga e
desliga, e o aparelho lembra a escolha.

O som é gerado na hora (Web Audio), sem arquivo de áudio. Duas coisas do
iPhone e do iPad valem saber:

- o Safari só libera som **depois do primeiro toque** na página;
- com a **chave de silencioso** ligada, ou com o app fechado e a tela
  bloqueada, não toca. Para avisar com o app fechado, só com notificação.

## Trocar de apelido

O botão no canto da barra lateral renomeia o perfil — não apaga nada. As
mensagens antigas continuam com o nome de quando foram ditas, que é o
registro correto do que aconteceu.

Vale saber por quê: `mensagens.autor_id` aponta para `perfis(id)` com
`on delete cascade`. Apagar um perfil leva junto tudo o que a pessoa disse,
nas três salas. Se um dia você remover alguém pelo Table Editor, é isso que
vai acontecer — e é o comportamento desejado para um pedido de remoção.

## Rodar os testes

Há 166 testes de ponta a ponta em [`teste/`](teste/), que rodam sem precisar
de um projeto no Supabase. Veja o [README de lá](teste/README.md).

## Moderação

Só entra quem a administração aprova (veja *Portaria*). Depois disso, as
proteções são o limite de ritmo, o bloqueio de repetição e os tamanhos —
não há filtro de conteúdo. A administração apaga qualquer mensagem pelo
próprio app.

Se um dia a sala precisar ser fechada, troque a entrada anônima por login com
e-mail em **Authentication → Providers** — o resto do app continua igual.
