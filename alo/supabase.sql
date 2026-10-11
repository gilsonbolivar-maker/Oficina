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

create policy "perfis visíveis para quem entrou"
  on public.perfis for select to authenticated using (true);

create policy "cada um cria o próprio perfil"
  on public.perfis for insert to authenticated with check (id = auth.uid());

create policy "cada um edita o próprio perfil"
  on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "apagar só o que é seu"
  on public.mensagens for delete to authenticated
  using (autor_id = auth.uid());

-- Sem política de UPDATE: ninguém reescreve mensagem já dita.
-- Quem pode ler cada sala e escrever nela vem logo abaixo, junto das
-- salas privadas.

-- ——— Salas privadas e conversas individuais ————————————————
-- Três tipos de sala:
--   publica    — as fixas lá de cima; todo mundo que entrou lê e escreve;
--   privada    — criada por alguém; entra quem recebe o link de convite;
--   individual — conversa entre duas pessoas; só as duas enxergam.
--
-- Quem pode o quê fica na tabela `membros` e é conferido pelo Postgres
-- em cada leitura e escrita. O app nunca decide quem é membro: criar
-- sala, entrar por convite e abrir conversa passam pelas funções abaixo,
-- que rodam com permissão do banco e conferem tudo antes de gravar.
alter table public.salas add column if not exists tipo text not null default 'publica';
alter table public.salas add column if not exists dono_id uuid references public.perfis (id) on delete cascade;
alter table public.salas add column if not exists convite text;
alter table public.salas add column if not exists criada_em timestamptz not null default now();
alter table public.salas alter column subtitulo set default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'salas_tipo_valido') then
    alter table public.salas add constraint salas_tipo_valido
      check (tipo in ('publica', 'privada', 'individual'));
  end if;
end;
$$;

create unique index if not exists salas_convite_unico
  on public.salas (convite) where convite is not null;

create table if not exists public.membros (
  sala_id   text        not null references public.salas (id) on delete cascade,
  perfil_id uuid        not null references public.perfis (id) on delete cascade,
  entrou_em timestamptz not null default now(),
  primary key (sala_id, perfil_id)
);

create index if not exists membros_perfil_idx on public.membros (perfil_id);

-- Usada pelas regras de acesso. Roda como dono do banco para poder
-- olhar `membros` sem cair na própria regra de `membros` (o que daria
-- uma volta infinita).
create or replace function public.eh_membro(p_sala text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membros
    where sala_id = p_sala and perfil_id = auth.uid()
  );
$$;

create or replace function public.sala_aberta(p_sala text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.salas where id = p_sala and tipo = 'publica')
      or public.eh_membro(p_sala);
$$;

-- Código de convite: 64 letras e números ao acaso. Impossível de adivinhar.
create or replace function public.novo_codigo()
returns text
language sql
volatile
set search_path = public
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- Cria uma sala privada; quem cria é o dono e o primeiro membro.
create or replace function public.criar_sala(p_titulo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text := btrim(regexp_replace(coalesce(p_titulo, ''), '\s+', ' ', 'g'));
  v_id     text := gen_random_uuid()::text;
begin
  if not exists (select 1 from public.perfis where id = auth.uid()) then
    raise exception 'Escolha um apelido antes.' using errcode = 'P0001';
  end if;
  if char_length(v_titulo) not between 2 and 40 then
    raise exception 'O nome da sala precisa ter de 2 a 40 letras.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.salas
      where dono_id = auth.uid() and criada_em > now() - interval '1 hour') >= 10 then
    raise exception 'Muitas salas novas em pouco tempo. Espere um pouco.' using errcode = 'P0001';
  end if;

  insert into public.salas (id, titulo, subtitulo, ordem, tipo, dono_id, convite)
  values (v_id, v_titulo, '', 0, 'privada', auth.uid(), public.novo_codigo());

  insert into public.membros (sala_id, perfil_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

-- Quem tem o código do convite vira membro. Devolve a sala.
create or replace function public.entrar_por_convite(p_codigo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sala text;
begin
  if not exists (select 1 from public.perfis where id = auth.uid()) then
    raise exception 'Escolha um apelido antes.' using errcode = 'P0001';
  end if;

  select id into v_sala from public.salas
  where tipo = 'privada' and convite = p_codigo;

  if v_sala is null then
    raise exception 'Esse convite não vale mais. Peça um novo a quem chamou você.'
      using errcode = 'P0001';
  end if;

  insert into public.membros (sala_id, perfil_id) values (v_sala, auth.uid())
  on conflict do nothing;
  return v_sala;
end;
$$;

-- Troca o código: o link antigo para de funcionar. Só o dono.
create or replace function public.trocar_convite(p_sala text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := public.novo_codigo();
begin
  update public.salas set convite = v_codigo
  where id = p_sala and tipo = 'privada' and dono_id = auth.uid();
  if not found then
    raise exception 'Só quem criou a sala pode trocar o convite.' using errcode = 'P0001';
  end if;
  return v_codigo;
end;
$$;

-- Abre (ou reabre) a conversa individual com outra pessoa. O id é
-- sempre o mesmo para o mesmo par, então não nasce conversa repetida.
create or replace function public.abrir_conversa(p_outro uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eu uuid := auth.uid();
  v_id text;
begin
  if not exists (select 1 from public.perfis where id = v_eu) then
    raise exception 'Escolha um apelido antes.' using errcode = 'P0001';
  end if;
  if p_outro is null or p_outro = v_eu then
    raise exception 'Escolha outra pessoa.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.perfis where id = p_outro) then
    raise exception 'Essa pessoa não está mais aqui.' using errcode = 'P0001';
  end if;

  v_id := 'dm:' || least(v_eu, p_outro)::text || ':' || greatest(v_eu, p_outro)::text;

  insert into public.salas (id, titulo, subtitulo, ordem, tipo)
  values (v_id, 'Conversa', '', 0, 'individual')
  on conflict (id) do nothing;

  insert into public.membros (sala_id, perfil_id)
  values (v_id, v_eu), (v_id, p_outro)
  on conflict do nothing;
  return v_id;
end;
$$;

revoke execute on function public.criar_sala(text)         from public, anon;
revoke execute on function public.entrar_por_convite(text) from public, anon;
revoke execute on function public.trocar_convite(text)     from public, anon;
revoke execute on function public.abrir_conversa(uuid)     from public, anon;
revoke execute on function public.eh_membro(text)          from public, anon;
revoke execute on function public.sala_aberta(text)        from public, anon;
grant  execute on function public.criar_sala(text)         to authenticated;
grant  execute on function public.entrar_por_convite(text) to authenticated;
grant  execute on function public.trocar_convite(text)     to authenticated;
grant  execute on function public.abrir_conversa(uuid)     to authenticated;
grant  execute on function public.eh_membro(text)          to authenticated;
grant  execute on function public.sala_aberta(text)        to authenticated;

alter table public.membros enable row level security;

drop policy if exists "salas visíveis para quem entrou"     on public.salas;
drop policy if exists "salas visíveis para quem pode"       on public.salas;
drop policy if exists "dono apaga a sala privada"           on public.salas;
drop policy if exists "membros visíveis entre si"           on public.membros;
drop policy if exists "cada um sai quando quiser"           on public.membros;
drop policy if exists "mensagens visíveis para quem entrou" on public.mensagens;
drop policy if exists "mensagens visíveis para quem pode"   on public.mensagens;
drop policy if exists "escrever só em nome próprio"         on public.mensagens;

-- Pública: todo mundo vê. Privada e individual: só quem é membro.
create policy "salas visíveis para quem pode"
  on public.salas for select to authenticated
  using (tipo = 'publica' or public.eh_membro(id));

create policy "dono apaga a sala privada"
  on public.salas for delete to authenticated
  using (tipo = 'privada' and dono_id = auth.uid());

-- Quem está numa sala vê quem mais está nela — e só nela.
create policy "membros visíveis entre si"
  on public.membros for select to authenticated
  using (public.eh_membro(sala_id));

create policy "cada um sai quando quiser"
  on public.membros for delete to authenticated
  using (perfil_id = auth.uid());

-- Sem política de INSERT em `membros`: só as funções acima põem gente
-- numa sala. Ninguém se adiciona sozinho pela API.

create policy "mensagens visíveis para quem pode"
  on public.mensagens for select to authenticated
  using (public.sala_aberta(sala_id));

-- Mesmo que alguém chame a API na mão, o `with check` barra a
-- mensagem assinada com outro autor ou mandada para sala alheia.
create policy "escrever só em nome próprio"
  on public.mensagens for insert to authenticated
  with check (autor_id = auth.uid() and public.sala_aberta(sala_id));

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
