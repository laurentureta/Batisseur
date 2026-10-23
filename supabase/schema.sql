-- Bâtisseur : amis, visites de villages et cadeaux quotidiens (état final du serveur).
-- Aucune table n'est lisible directement (RLS sans politique) : tout passe par les fonctions bat_*.
create extension if not exists pgcrypto with schema extensions;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  secret_hash text not null,
  name text not null default 'Maire',
  avatar text not null default '',
  village text not null default 'Mon village',
  level int not null default 1,
  pop int not null default 0,
  snapshot jsonb,
  snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index players_created_idx on public.players(created_at);

create table public.friends (
  player_id uuid not null references public.players(id) on delete cascade,
  friend_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, friend_id),
  check (player_id <> friend_id)
);
create index friends_friend_idx on public.friends(friend_id);

create table public.gifts (
  id bigint generated always as identity primary key,
  from_id uuid not null references public.players(id) on delete cascade,
  to_id uuid not null references public.players(id) on delete cascade,
  kind text not null,
  amount int not null,
  day date not null,
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (from_id, to_id, day)
);
create index gifts_to_idx on public.gifts(to_id) where not claimed;

alter table public.players enable row level security;
alter table public.friends enable row level security;
alter table public.gifts enable row level security;
revoke all on public.players, public.friends, public.gifts from anon, authenticated;

-- ───────── Outils internes (non appelables par le jeu) ─────────
create or replace function public._today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Europe/Paris')::date $$;

create or replace function public._hash(p_secret text) returns text
language sql immutable set search_path = '' as $$ select encode(extensions.digest(p_secret, 'sha256'), 'hex') $$;

create or replace function public._me(p_id uuid, p_secret text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if p_secret is null or length(p_secret) < 24 then raise exception 'secret invalide'; end if;
  update public.players set last_seen = now()
    where id = p_id and secret_hash = public._hash(p_secret)
    returning id into v;
  if v is null then raise exception 'joueur inconnu'; end if;
  return v;
end $$;

create or replace function public.bat_cleanup() returns void
language sql security definer set search_path = '' as $$
  delete from public.gifts where created_at < now() - interval '30 days';
$$;

-- ───────── Fonctions appelées par le jeu (/rest/v1/rpc/…) ─────────
create or replace function public.bat_register(p_secret text, p_name text, p_village text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_id uuid;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
begin
  if p_secret is null or length(p_secret) < 24 or length(p_secret) > 128 then raise exception 'secret invalide'; end if;
  if (select count(*) from public.players where created_at > now() - interval '1 minute') > 60 then
    raise exception 'trop d''inscriptions, réessaie dans une minute';
  end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.players where code = v_code);
  end loop;
  insert into public.players (code, secret_hash, name, village)
    values (v_code, public._hash(p_secret), left(coalesce(nullif(trim(p_name), ''), 'Maire'), 24), left(coalesce(nullif(trim(p_village), ''), 'Mon village'), 28))
    returning id into v_id;
  return json_build_object('id', v_id, 'code', v_code);
end $$;

create or replace function public.bat_update(p_id uuid, p_secret text, p_name text, p_avatar text, p_village text, p_level int, p_pop int, p_snapshot jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare v uuid := public._me(p_id, p_secret);
begin
  if p_snapshot is not null and octet_length(p_snapshot::text) > 400000 then raise exception 'village trop gros'; end if;
  update public.players set
    name = left(coalesce(nullif(trim(p_name), ''), name), 24),
    avatar = left(coalesce(p_avatar, avatar), 32),
    village = left(coalesce(nullif(trim(p_village), ''), village), 28),
    level = greatest(1, least(coalesce(p_level, level), 999)),
    pop = greatest(0, least(coalesce(p_pop, pop), 10000000)),
    snapshot = coalesce(p_snapshot, snapshot),
    snapshot_at = case when p_snapshot is not null then now() else snapshot_at end
  where id = v;
  return json_build_object('ok', true);
end $$;

create or replace function public.bat_add_friend(p_id uuid, p_secret text, p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v uuid := public._me(p_id, p_secret);
  f public.players%rowtype;
  n int;
begin
  select * into f from public.players where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if f.id is null then raise exception 'code inconnu'; end if;
  if f.id = v then raise exception 'c''est ton propre code'; end if;
  select count(*) into n from public.friends where player_id = v;
  if n >= 100 then raise exception 'trop d''amis'; end if;
  insert into public.friends (player_id, friend_id) values (v, f.id), (f.id, v) on conflict do nothing;
  return json_build_object('id', f.id, 'code', f.code, 'name', f.name, 'village', f.village, 'level', f.level, 'pop', f.pop);
end $$;

create or replace function public.bat_remove_friend(p_id uuid, p_secret text, p_friend uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare v uuid := public._me(p_id, p_secret);
begin
  delete from public.friends where (player_id = v and friend_id = p_friend) or (player_id = p_friend and friend_id = v);
  return json_build_object('ok', true);
end $$;

create or replace function public.bat_friends(p_id uuid, p_secret text)
returns json language plpgsql security definer set search_path = '' as $$
declare v uuid := public._me(p_id, p_secret);
begin
  return coalesce((
    select json_agg(json_build_object(
      'id', p.id, 'code', p.code, 'name', p.name, 'avatar', p.avatar, 'village', p.village,
      'level', p.level, 'pop', p.pop, 'last_seen', p.last_seen, 'has_village', p.snapshot is not null,
      'gift_sent', exists (select 1 from public.gifts g where g.from_id = v and g.to_id = p.id and g.day = public._today())
    ) order by p.last_seen desc)
    from public.friends fr join public.players p on p.id = fr.friend_id
    where fr.player_id = v), '[]'::json);
end $$;

create or replace function public.bat_village(p_id uuid, p_secret text, p_friend uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v uuid := public._me(p_id, p_secret);
  r json;
begin
  if not exists (select 1 from public.friends where player_id = v and friend_id = p_friend) then raise exception 'pas ami'; end if;
  select json_build_object('name', name, 'avatar', avatar, 'village', village, 'level', level, 'pop', pop, 'snapshot', snapshot, 'snapshot_at', snapshot_at)
    into r from public.players where id = p_friend;
  return r;
end $$;

create or replace function public.bat_send_gift(p_id uuid, p_secret text, p_friend uuid, p_kind text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v uuid := public._me(p_id, p_secret);
  amt int;
begin
  if not exists (select 1 from public.friends where player_id = v and friend_id = p_friend) then raise exception 'pas ami'; end if;
  amt := case p_kind when 'coins' then 250 when 'wood' then 60 when 'stone' then 40 when 'food' then 60 else null end;
  if amt is null then raise exception 'cadeau inconnu'; end if;
  insert into public.gifts (from_id, to_id, kind, amount, day) values (v, p_friend, p_kind, amt, public._today())
    on conflict (from_id, to_id, day) do nothing;
  if not found then raise exception 'déjà envoyé aujourd''hui'; end if;
  return json_build_object('ok', true, 'kind', p_kind, 'amount', amt);
end $$;

create or replace function public.bat_inbox(p_id uuid, p_secret text)
returns json language plpgsql security definer set search_path = '' as $$
declare v uuid := public._me(p_id, p_secret);
begin
  return coalesce((
    select json_agg(json_build_object('id', g.id, 'kind', g.kind, 'amount', g.amount, 'from', p.name, 'from_village', p.village, 'day', g.day) order by g.created_at)
    from public.gifts g join public.players p on p.id = g.from_id
    where g.to_id = v and not g.claimed), '[]'::json);
end $$;

create or replace function public.bat_claim(p_id uuid, p_secret text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v uuid := public._me(p_id, p_secret);
  done_today int;
  r json;
begin
  select count(*) into done_today from public.gifts where to_id = v and claimed and day = public._today();
  with picked as (
    select id from public.gifts where to_id = v and not claimed order by created_at limit greatest(0, 20 - done_today)
  ), upd as (
    update public.gifts g set claimed = true from picked where g.id = picked.id returning g.kind, g.amount
  )
  select coalesce(json_agg(json_build_object('kind', kind, 'amount', amount)), '[]'::json) into r from upd;
  return r;
end $$;

-- ───────── Droits ─────────
revoke all on function public._me(uuid, text), public._hash(text), public._today(), public.bat_cleanup() from public, anon, authenticated;
revoke execute on function
  public.bat_register(text, text, text), public.bat_update(uuid, text, text, text, text, int, int, jsonb),
  public.bat_add_friend(uuid, text, text), public.bat_remove_friend(uuid, text, uuid), public.bat_friends(uuid, text),
  public.bat_village(uuid, text, uuid), public.bat_send_gift(uuid, text, uuid, text), public.bat_inbox(uuid, text), public.bat_claim(uuid, text)
from authenticated;
grant execute on function
  public.bat_register(text, text, text), public.bat_update(uuid, text, text, text, text, int, int, jsonb),
  public.bat_add_friend(uuid, text, text), public.bat_remove_friend(uuid, text, uuid), public.bat_friends(uuid, text),
  public.bat_village(uuid, text, uuid), public.bat_send_gift(uuid, text, uuid, text), public.bat_inbox(uuid, text), public.bat_claim(uuid, text)
to anon;
