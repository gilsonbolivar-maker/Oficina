-- ————————————————————————————————————————————————————————————
--  Alô — banco de dados
--
--  Cole este arquivo inteiro no SQL Editor do seu projeto Supabase
--  e clique em "Run". Pode rodar de novo quantas vezes quiser: tudo
--  aqui é idempotente.
--
--  A ideia central: o navegador NUNCA decide quem é o autor de uma
--  mensagem nem quantas pode mandar. Quem decide é o Postgres, a
--  partir do `auth.uid()` que vem assinado no token. Por isso as
--  regras estão todas aqui, e não no app.
-- ————————————————————————————————————————————————————————————

-- ——— Perfis ————————————————————————————————————————————————
-- Um perfil por conta. A conta é criada por login anônimo, então
-- ninguém precisa de senha — mas o `id` vem do Supabase Auth, é
-- verificado por assinatura e não pode ser forjado pelo navegador.
create table if not exists public.perfis (
  id        uuid primary key references auth.users (id) on delete cascade,
  apelido   text        not null,
  criado_em timestamptz not null default now(),
  constraint perfis_apelido_tamanho check (char_length(apelido) between 2 and 24),
  -- Letras (com acento), números, espaço, ponto, hífen e sublinhado.
  constraint perfis_apelido_formato check (apelido ~ '^[[:alnum:]À-ÿ][[:alnum:]À-ÿ ._-]*$')
);

-- Apelido é único ignorando maiúsculas: "Gilson" e "gilson" são o mesmo.
create unique index if not exists perfis_apelido_unico
  on public.perfis (lower(apelido));

-- ——— Salas —————————————————————————————————————————————————
create table if not exists public.salas (
  id         text primary key,
  titulo     text    not null,
  subtitulo  text    not null,
  ordem      integer not null default 0
);

insert into public.salas (id, titulo, subtitulo, ordem) values
  ('geral',    'Geral',   'Quem está por aqui',      1),
  ('recados',  'Recados', 'Deixe um recado',          2),
  ('cafe',     'Café',    'Papo leve, sem pressa',    3)
on conflict (id) do update
  set titulo = excluded.titulo,
      subtitulo = excluded.subtitulo,
      ordem = excluded.ordem;

-- ——— Mensagens —————————————————————————————————————————————
-- `autor_id` e `autor_apelido` são preenchidos por trigger, a partir
-- do token. O app manda só `sala_id` e `corpo`; qualquer autor que
-- ele tente enviar é descartado. É isso que torna impossível se
-- passar por outra pessoa.
create table if not exists public.mensagens (
  id            bigint generated always as identity primary key,
  sala_id       text        not null references public.salas (id) on delete cascade,
  autor_id      uuid        not null references public.perfis (id) on delete cascade,
  autor_apelido text        not null,
  corpo         text        not null,
  criado_em     timestamptz not null default now(),
  constraint mensagens_corpo_tamanho check (char_length(corpo) between 1 and 500)
);

create index if not exists mensagens_sala_id_idx
  on public.mensagens (sala_id, id desc);

create index if not exists mensagens_autor_recente_idx
  on public.mensagens (autor_id, criado_em desc);

-- ——— Antes de gravar: quem falou, e se pode falar agora ————
-- As duas coisas moram na mesma função de propósito. Em triggers
-- separados a ordem seria a alfabética dos nomes — funcionaria hoje e
-- quebraria calado no dia em que alguém renomeasse um deles, porque o
-- limite precisa do autor que o carimbo acabou de definir.
create or replace function public.mensagens_antes_de_inserir()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_apelido   text;
  v_no_minuto integer;
  v_ultima    text;
  v_ultima_em timestamptz;
begin
  -- 1. Quem está falando. Sai do token, nunca do que o cliente mandou.
  select apelido into v_apelido from public.perfis where id = auth.uid();

  if v_apelido is null then
    raise exception 'Escolha um apelido antes de falar.' using errcode = 'P0001';
  end if;

  new.autor_id      := auth.uid();
  new.autor_apelido := v_apelido;
  new.criado_em     := now();
  new.corpo         := btrim(new.corpo);

  if char_length(new.corpo) = 0 then
    raise exception 'Mensagem vazia.' using errcode = 'P0001';
  end if;

  -- 2. Ritmo. O limite antigo vivia num Map na memória do servidor: sumia
  -- a cada deploy, não valia entre instâncias, e bastava gerar outro id no
  -- navegador para zerar. Contado aqui, por conta, trocar de id não ajuda.
  select count(*) into v_no_minuto
  from public.mensagens
  where autor_id = new.autor_id
    and criado_em > now() - interval '1 minute';

  if v_no_minuto >= 12 then
    raise exception 'Calma — um recado de cada vez.' using errcode = 'P0001';
  end if;

  -- 3. Repetir a mesma mensagem em seguida quase sempre é engano ou spam.
  select corpo, criado_em into v_ultima, v_ultima_em
  from public.mensagens
  where autor_id = new.autor_id
  order by id desc
  limit 1;

  if v_ultima is not null
     and lower(v_ultima) = lower(new.corpo)
     and v_ultima_em > now() - interval '30 seconds' then
    raise exception 'Você acabou de mandar isso.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Nomes de versões anteriores, para quem já rodou este arquivo antes.
drop trigger if exists mensagens_carimbar_autor on public.mensagens;
drop trigger if exists mensagens_limitar_ritmo  on public.mensagens;
drop function if exists public.mensagens_carimbar_autor();
drop function if exists public.mensagens_limitar_ritmo();

drop trigger if exists mensagens_antes_de_inserir on public.mensagens;
create trigger mensagens_antes_de_inserir
  before insert on public.mensagens
  for each row execute function public.mensagens_antes_de_inserir();

-- ——— Regras de acesso ——————————————————————————————————————
alter table public.perfis    enable row level security;
alter table public.salas     enable row level security;
alter table public.mensagens enable row level security;

drop policy if exists "salas visíveis para quem entrou"      on public.salas;
drop policy if exists "perfis visíveis para quem entrou"     on public.perfis;
drop policy if exists "cada um cria o próprio perfil"        on public.perfis;
drop policy if exists "cada um edita o próprio perfil"       on public.perfis;
drop policy if exists "mensagens visíveis para quem entrou"  on public.mensagens;
drop policy if exists "escrever só em nome próprio"          on public.mensagens;
drop policy if exists "apagar só o que é seu"                on public.mensagens;

create policy "salas visíveis para quem entrou"
  on public.salas for select to authenticated using (true);

create policy "perfis visíveis para quem entrou"
  on public.perfis for select to authenticated using (true);

create policy "cada um cria o próprio perfil"
  on public.perfis for insert to authenticated with check (id = auth.uid());

create policy "cada um edita o próprio perfil"
  on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "mensagens visíveis para quem entrou"
  on public.mensagens for select to authenticated using (true);

-- Mesmo que alguém chame a API na mão, o `with check` barra a
-- mensagem assinada com outro autor.
create policy "escrever só em nome próprio"
  on public.mensagens for insert to authenticated
  with check (autor_id = auth.uid());

create policy "apagar só o que é seu"
  on public.mensagens for delete to authenticated
  using (autor_id = auth.uid());

-- Sem política de UPDATE: ninguém reescreve mensagem já dita.

-- ——— Tempo real ————————————————————————————————————————————
-- Substitui o antigo polling de 1,8s. Uma conexão só, e o banco avisa.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mensagens'
  ) then
    alter publication supabase_realtime add table public.mensagens;
  end if;
end;
$$;
