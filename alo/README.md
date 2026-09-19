# Alô

Sala de conversa aberta. Entre com um apelido e fale com quem estiver por aqui.

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
| Salas | 3 fixas (`geral`, `recados`, `cafe`) |
| Histórico | não expira sozinho |

As salas ficam na tabela `salas` — para criar outra, basta um `insert`.

## Trocar de apelido

O botão no canto da barra lateral renomeia o perfil — não apaga nada. As
mensagens antigas continuam com o nome de quando foram ditas, que é o
registro correto do que aconteceu.

Vale saber por quê: `mensagens.autor_id` aponta para `perfis(id)` com
`on delete cascade`. Apagar um perfil leva junto tudo o que a pessoa disse,
nas três salas. Se um dia você remover alguém pelo Table Editor, é isso que
vai acontecer — e é o comportamento desejado para um pedido de remoção.

## Rodar os testes

Há 47 testes de ponta a ponta em [`teste/`](teste/), que rodam sem precisar
de um projeto no Supabase. Veja o [README de lá](teste/README.md).

## Moderação

Qualquer pessoa com o endereço entra. As proteções são o limite de ritmo, o
bloqueio de repetição e os tamanhos — não há filtro de conteúdo. Para apagar
uma mensagem, use o *Table Editor* do Supabase. Cada pessoa também pode apagar
as próprias mensagens pelo banco.

Se um dia a sala precisar ser fechada, troque a entrada anônima por login com
e-mail em **Authentication → Providers** — o resto do app continua igual.
