-- ─────────────────────────────────────────────────────────────────────────────
-- Bâtisseur — mise en service complète du serveur (versions 4, 5 et 6).
-- À coller en une seule fois dans Supabase → SQL Editor → Run.
-- Contient les migrations 004 (coopératives), 005 (notifications push),
-- 006 (aventures en équipe) et 007 (comptes et sauvegardes cloud).
-- Le script peut être relancé sans risque : tout est en « create if not exists »
-- ou « create or replace ». Aucune donnée existante n'est supprimée.
-- Prérequis : supabase/schema.sql (déjà en place depuis la version 3.7).
-- ─────────────────────────────────────────────────────────────────────────────
begin;

-- ══════════ 004_cooperatives ══════════
-- À exécuter une fois dans le SQL Editor du projet, après schema.sql.
-- Aucun secret d'administration n'est inclus ; les tables privées ne sont jamais exposées.

create table if not exists public.cooperatives (
 id bigint generated always as identity primary key, code text unique not null,
 name text not null check(length(name) between 3 and 30), owner uuid not null references public.players(id),
 active boolean not null default true, cycle int not null default 1, created_at timestamptz not null default now()
);
create table if not exists public.coop_members (
 player uuid primary key references public.players(id), coop bigint not null references public.cooperatives(id), joined_at timestamptz not null default now()
);
create index if not exists coop_members_coop_idx on public.coop_members(coop);
create table if not exists public.coop_projects (
 coop bigint references public.cooperatives(id), cycle int not null, progress int not null default 0,
 goal int not null default 1000 check(goal>0), completed_at timestamptz, primary key(coop,cycle)
);
create table if not exists public.coop_requests (
 id uuid primary key default gen_random_uuid(), coop bigint not null references public.cooperatives(id),
 recipient uuid not null references public.players(id), kind text not null check(kind in ('wood','stone','food')),
 amount int not null default 20 check(amount=20), donor uuid references public.players(id), claimed boolean not null default false,
 created_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists coop_requests_coop_idx on public.coop_requests(coop,created_at desc);
create table if not exists public.coop_daily (
 player uuid references public.players(id), day date not null, amount int not null default 0 check(amount between 0 and 200), primary key(player,day)
);
create table if not exists public.coop_claims (
 player uuid references public.players(id), coop bigint references public.cooperatives(id), cycle int not null,
 claimed_at timestamptz not null default now(), primary key(player,coop,cycle)
);
create table if not exists public.coop_receipts (
 player uuid references public.players(id), operation uuid not null, action text not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(player,operation)
);
revoke all on sequence public.cooperatives_id_seq from public,anon,authenticated;
alter table public.cooperatives enable row level security;
alter table public.coop_members enable row level security;
alter table public.coop_projects enable row level security;
alter table public.coop_requests enable row level security;
alter table public.coop_daily enable row level security;
alter table public.coop_claims enable row level security;
alter table public.coop_receipts enable row level security;
revoke all on public.cooperatives,public.coop_members,public.coop_projects,public.coop_requests,public.coop_daily,public.coop_claims,public.coop_receipts from public,anon,authenticated;

create or replace function public.bat_coop_capabilities() returns jsonb
language sql stable set search_path='' as $$select jsonb_build_object('version',1)$$;

create or replace function public._coop_view(p_player uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.cooperatives; p public.coop_projects; v_members jsonb; v_requests jsonb;
begin
 select co.* into c from public.cooperatives co join public.coop_members m on m.coop=co.id where m.player=p_player;
 if c.id is null then return jsonb_build_object('coop',null); end if;
 select * into p from public.coop_projects where coop=c.id and cycle=c.cycle;
 select coalesce(jsonb_agg(jsonb_build_object('id',pl.id,'name',pl.name,'village',pl.village,'owner',pl.id=c.owner) order by m.joined_at),'[]'::jsonb)
 into v_members from public.coop_members m join public.players pl on pl.id=m.player where m.coop=c.id;
 select coalesce(jsonb_agg(t.obj),'[]'::jsonb) into v_requests from (
  select jsonb_build_object('id',r.id,'recipient',r.recipient,'name',pl.name,'kind',r.kind,'amount',r.amount,'sent',r.donor is not null,'claimed',r.claimed) obj
  from public.coop_requests r join public.players pl on pl.id=r.recipient
  where r.coop=c.id and (r.donor is null or (r.recipient=p_player and not r.claimed)) order by r.created_at desc limit 40
 )t;
 return jsonb_build_object('coop',jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'owner',c.owner,'cycle',c.cycle,
 'progress',p.progress,'goal',p.goal,'completed',p.completed_at is not null,'completed_at',p.completed_at,
 'can_reward',p.completed_at is not null and exists(select 1 from public.coop_members where player=p_player and joined_at<=p.completed_at)
   and not exists(select 1 from public.coop_claims where player=p_player and coop=c.id and cycle=c.cycle)),
 'members',v_members,'requests',v_requests,'daily',coalesce((select amount from public.coop_daily where player=p_player and day=public._today()),0));
end$$;
revoke all on function public._coop_view(uuid) from public,anon,authenticated;

create or replace function public.bat_coop(p_id uuid,p_secret text,p_action text,p_args jsonb default '{}'::jsonb,p_operation uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid; c public.cooperatives; m public.coop_members; p public.coop_projects;
 req public.coop_requests; r jsonb; previous public.coop_receipts; v_code text; v_name text; v_kind text;
 v_grant jsonb:='{}'::jsonb; v_total int; v_reward boolean:=false; v_new_owner uuid;
begin
 me:=public._me(p_id,p_secret); -- verrouille ce joueur jusqu'à la fin de la transaction
 if p_action='status' then return public._coop_view(me); end if;
 if p_operation is null then raise exception 'operation requise'; end if;
 select * into previous from public.coop_receipts where player=me and operation=p_operation;
 if found then
  if previous.action<>p_action then raise exception 'operation reutilisee'; end if;
  return previous.result;
 end if;
 if (select count(*) from public.coop_receipts where player=me and created_at >= (public._today()::timestamp at time zone 'Europe/Paris'))>=100 then raise exception 'limite operations du jour'; end if;
 if p_action not in ('create','join','leave','request','send','contribute','claim','next','cancel') then raise exception 'action inconnue'; end if;
 select * into m from public.coop_members where player=me;
 if p_action='create' then
  if m.player is not null then raise exception 'deja membre'; end if;
  if (select count(*) from public.coop_receipts where player=me and action='create' and created_at >= (public._today()::timestamp at time zone 'Europe/Paris'))>=3 then raise exception 'limite de creations du jour'; end if;
  v_name:=btrim(coalesce(p_args->>'name',''));
  if length(v_name)<3 or length(v_name)>30 then raise exception 'nom invalide'; end if;
  loop
   v_code:=upper(encode(extensions.gen_random_bytes(3),'hex'));
   begin insert into public.cooperatives(code,name,owner) values(v_code,v_name,me) returning * into c; exit;
   exception when unique_violation then null; end;
  end loop;
  insert into public.coop_members(player,coop) values(me,c.id);
  insert into public.coop_projects(coop,cycle) values(c.id,1);
 elsif p_action='join' then
  if m.player is not null then raise exception 'deja membre'; end if;
  select * into c from public.cooperatives where code=upper(btrim(p_args->>'code')) and active for update;
  if c.id is null then raise exception 'code inconnu'; end if;
  if (select count(*) from public.coop_members where coop=c.id)>=20 then raise exception 'cooperative complete'; end if;
  insert into public.coop_members(player,coop) values(me,c.id);
 else
  if m.player is null then raise exception 'pas membre'; end if;
  select * into c from public.cooperatives where id=m.coop and active for update;
  if c.id is null then raise exception 'cooperative fermee'; end if;
  select * into p from public.coop_projects where coop=c.id and cycle=c.cycle for update;
  if p_action='leave' then
   if exists(select 1 from public.coop_requests where recipient=me and donor is not null and not claimed) then raise exception 'recuperer les colis avant de partir'; end if;
   delete from public.coop_requests where recipient=me and donor is null;
   delete from public.coop_members where player=me;
   if c.owner=me then
    select player into v_new_owner from public.coop_members where coop=c.id order by joined_at,player limit 1;
    if v_new_owner is null then update public.cooperatives set active=false where id=c.id;
    else update public.cooperatives set owner=v_new_owner where id=c.id; end if;
   end if;
  elsif p_action='request' then
   v_kind:=p_args->>'kind';
   if v_kind not in ('wood','stone','food') or v_kind is null then raise exception 'marchandise inconnue'; end if;
   if (select count(*) from public.coop_requests where recipient=me and donor is null)>=2 then raise exception 'deux demandes au maximum'; end if;
   if (select count(*) from public.coop_receipts where player=me and action='request' and created_at >= (public._today()::timestamp at time zone 'Europe/Paris'))>=5 then raise exception 'limite de demandes du jour'; end if;
   insert into public.coop_requests(coop,recipient,kind) values(c.id,me,v_kind);
  elsif p_action='cancel' then
   delete from public.coop_requests where id=(p_args->>'request')::uuid and coop=c.id and recipient=me and donor is null;
   if not found then raise exception 'demande indisponible'; end if;
  elsif p_action in ('send','contribute') then
   if p_action='send' then
    select * into req from public.coop_requests where id=(p_args->>'request')::uuid and coop=c.id for update;
    if req.id is null or req.recipient=me or req.donor is not null then raise exception 'demande indisponible'; end if;
    v_kind:=req.kind;
   else
    v_kind:=p_args->>'kind';
    if v_kind not in ('wood','stone','food') or v_kind is null then raise exception 'marchandise inconnue'; end if;
    if p.completed_at is not null then raise exception 'projet termine'; end if;
   end if;
   insert into public.coop_daily(player,day,amount) values(me,public._today(),0) on conflict do nothing;
   update public.coop_daily set amount=amount+20 where player=me and day=public._today() and amount<=180;
   if not found then raise exception 'limite de contributions du jour'; end if;
   if p_action='send' then update public.coop_requests set donor=me,sent_at=now() where id=req.id;
   else update public.coop_projects set progress=least(goal,progress+20),completed_at=case when progress+20>=goal then now() else null end where coop=c.id and cycle=c.cycle;
   end if;
  elsif p_action='claim' then
   for req in select * from public.coop_requests where coop=c.id and recipient=me and donor is not null and not claimed for update loop
    v_total:=coalesce((v_grant->>req.kind)::int,0)+req.amount;
    v_grant:=v_grant||jsonb_build_object(req.kind,v_total);
    update public.coop_requests set claimed=true where id=req.id;
   end loop;
   if p.completed_at is not null and m.joined_at<=p.completed_at
     and not exists(select 1 from public.coop_claims where player=me and coop=c.id and cycle=c.cycle)
     and not exists(select 1 from public.coop_claims where player=me and claimed_at >= (public._today()::timestamp at time zone 'Europe/Paris')) then
     insert into public.coop_claims(player,coop,cycle) values(me,c.id,c.cycle);
     v_grant:=v_grant||jsonb_build_object('coins',1000);v_reward:=true;
   end if;
  elsif p_action='next' then
   if c.owner<>me then raise exception 'reserve au fondateur'; end if;
   if p.completed_at is null or p.completed_at>now()-interval '24 hours' then raise exception 'prochain projet disponible 24 heures apres inauguration'; end if;
   update public.cooperatives set cycle=cycle+1 where id=c.id;
   insert into public.coop_projects(coop,cycle,goal) values(c.id,c.cycle+1,least(5000,1000+c.cycle*200));
  end if;
 end if;
 r:=jsonb_build_object('view',public._coop_view(me),'grant',v_grant,'reward',v_reward);
 insert into public.coop_receipts(player,operation,action,result) values(me,p_operation,p_action,r);
 return r;
end$$;
revoke all on function public.bat_coop(uuid,text,text,jsonb,uuid) from public;
revoke all on function public.bat_coop_capabilities() from public;
grant execute on function public.bat_coop(uuid,text,text,jsonb,uuid),public.bat_coop_capabilities() to anon,authenticated;


-- ══════════ 005_push ══════════
-- Notifications Web Push : abonnement volontaire et échéances personnelles.
-- Le déploiement de la fonction push-dispatch et de son cron est documenté séparément.

create table if not exists public.push_config (
 id boolean primary key default true check(id), enabled boolean not null default false,
 vapid_public_key text not null default ''
);
insert into public.push_config(id) values(true) on conflict do nothing;
create table if not exists public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), player_id uuid not null references public.players(id) on delete cascade,
 endpoint text not null unique, p256dh text not null, auth text not null,
 preferences jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists push_player_idx on public.push_subscriptions(player_id);
create table if not exists public.push_jobs (
 id bigint generated always as identity primary key,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 scope text not null, tag text not null, kind text not null check(kind in('orders','construction','projects','shipments','gifts')),
 ready_at timestamptz not null, sent_at timestamptz, lease_until timestamptz, attempts int not null default 0,
 unique(subscription_id,scope,tag)
);
create index if not exists push_jobs_due on public.push_jobs(ready_at) where sent_at is null;
alter table public.push_config enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_jobs enable row level security;
revoke all on public.push_config,public.push_subscriptions,public.push_jobs from public,anon,authenticated;
revoke all on sequence public.push_jobs_id_seq from public,anon,authenticated;

create or replace function public.bat_push_config() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',1,'enabled',enabled and length(vapid_public_key)=87,'publicKey',vapid_public_key) from public.push_config where id
$$;
create or replace function public.bat_push_subscribe(p_id uuid,p_secret text,p_subscription jsonb,p_preferences jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v uuid:=public._me(p_id,p_secret); ep text:=p_subscription->>'endpoint'; key text:=p_subscription#>>'{keys,p256dh}'; token text:=p_subscription#>>'{keys,auth}'; sid uuid; prefs jsonb;
begin
 if not exists(select 1 from public.push_config where id and enabled) then raise exception 'notifications indisponibles'; end if;
 if ep is null or length(ep)>2048 or ep !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]]+$' then raise exception 'abonnement invalide'; end if;
 if coalesce(key,'') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(token,'') !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'cles invalides'; end if;
 if exists(select 1 from public.push_subscriptions where endpoint=ep and player_id<>v) then raise exception 'abonnement deja associe'; end if;
 if not exists(select 1 from public.push_subscriptions where endpoint=ep) and (select count(*) from public.push_subscriptions where player_id=v)>=5 then raise exception 'cinq telephones au maximum'; end if;
 select jsonb_object_agg(k,case when jsonb_typeof(p_preferences->k)='boolean' then (p_preferences->k) else 'true'::jsonb end) into prefs from unnest(array['orders','construction','projects','shipments','gifts']) as k;
 insert into public.push_subscriptions(player_id,endpoint,p256dh,auth,preferences) values(v,ep,key,token,prefs)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,preferences=excluded.preferences,updated_at=now() where public.push_subscriptions.player_id=v returning id into sid;
 delete from public.push_jobs where subscription_id=sid and sent_at is null and not coalesce((prefs->>kind)::boolean,false);
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.bat_push_unsubscribe(p_id uuid,p_secret text,p_endpoint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v uuid:=public._me(p_id,p_secret);
begin delete from public.push_subscriptions where player_id=v and endpoint=p_endpoint; return jsonb_build_object('ok',true); end $$;
create or replace function public.bat_push_schedule(p_id uuid,p_secret text,p_endpoint text,p_scope text,p_events jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v uuid:=public._me(p_id,p_secret); sid uuid; item jsonb; due timestamptz; k text; t text;
begin
 select id into sid from public.push_subscriptions where player_id=v and endpoint=p_endpoint for update;
 if sid is null then raise exception 'abonnement inconnu'; end if;
 if p_scope is null or p_scope !~ '^slot[0-2]$' or p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>24 or octet_length(p_events::text)>10000 then raise exception 'calendrier invalide'; end if;
 -- Reconciliation atomique : annuler/terminer un chantier annule son ancien rappel.
 delete from public.push_jobs j where subscription_id=sid and scope=p_scope and sent_at is null and not exists(select 1 from jsonb_array_elements(p_events) e where e->>'tag'=j.tag);
 for item in select value from jsonb_array_elements(p_events) loop
  k:=item->>'kind';t:=item->>'tag';due:=(item->>'at')::timestamptz;
  if k is null or k not in('orders','construction','projects','shipments') or t is null or length(t)>150 or t !~ '^[A-Za-z0-9_:-]+$' or due is null or due>now()+interval '7 days 1 minute' then raise exception 'echeance invalide'; end if;
  if due<=now() or not exists(select 1 from public.push_subscriptions where id=sid and coalesce((preferences->>k)::boolean,false)) then continue; end if;
  insert into public.push_jobs(subscription_id,scope,tag,kind,ready_at) values(sid,p_scope,t,k,due) on conflict(subscription_id,scope,tag) do nothing;
 end loop;
 return jsonb_build_object('ok',true);
end $$;
-- Un vrai cadeau reçu peut notifier tous les téléphones du destinataire, sans ouvrir le jeu.
create or replace function public._push_gift() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.push_jobs(subscription_id,scope,tag,kind,ready_at)
 select id,'gifts','gift:'||new.id,'gifts',now() from public.push_subscriptions where player_id=new.to_id and coalesce((preferences->>'gifts')::boolean,false)
 on conflict do nothing;return new;
end $$;
drop trigger if exists gifts_push on public.gifts;
create trigger gifts_push after insert on public.gifts for each row execute function public._push_gift();

-- Seulement la fonction serveur (service_role), jamais les téléphones, peut lire les clés ou distribuer les tâches.
create or replace function public.bat_push_due() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform pg_advisory_xact_lock(72942617425);
 delete from public.push_jobs where ready_at<now()-interval '8 days';
 if not exists(select 1 from public.push_config where id and enabled) then return '[]'::jsonb; end if;
 with eligible as (
  select j.id,j.ready_at,row_number() over(partition by j.subscription_id order by j.ready_at,j.id) as position,
   greatest(0,8-(select count(*) from public.push_jobs sent where sent.subscription_id=j.subscription_id and (sent.sent_at>now()-interval '24 hours' or (sent.sent_at is null and sent.lease_until>now())))) as available
  from public.push_jobs j join public.push_subscriptions s on s.id=j.subscription_id
  where j.sent_at is null and j.ready_at<=now() and j.ready_at>now()-interval '24 hours' and j.attempts<5 and (j.lease_until is null or j.lease_until<now())
   and coalesce((s.preferences->>j.kind)::boolean,false)
 ), picked as(
  select j.id from public.push_jobs j join eligible e on e.id=j.id where e.position<=e.available
  order by j.ready_at,j.id limit 20 for update of j skip locked
 ), leased as(update public.push_jobs j set lease_until=now()+interval '5 minutes',attempts=attempts+1 from picked where j.id=picked.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'kind',j.kind,'scope',j.scope,'tag',j.tag,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))),'[]'::jsonb) into result from leased j join public.push_subscriptions s on s.id=j.subscription_id;
 return result;
end $$;
create or replace function public.bat_push_result(p_job bigint,p_status int) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_status in(404,410) then delete from public.push_subscriptions where id=(select subscription_id from public.push_jobs where id=p_job);
 elsif p_status>=200 and p_status<300 then update public.push_jobs set sent_at=now(),lease_until=null where id=p_job;
 else update public.push_jobs set lease_until=now()+interval '5 minutes' where id=p_job; end if;
end $$;
revoke all on function public._push_gift(),public.bat_push_due(),public.bat_push_result(bigint,int) from public,anon,authenticated;
grant execute on function public.bat_push_due(),public.bat_push_result(bigint,int) to service_role;
revoke all on function public.bat_push_config(),public.bat_push_subscribe(uuid,text,jsonb,jsonb),public.bat_push_unsubscribe(uuid,text,text),public.bat_push_schedule(uuid,text,text,text,jsonb) from public,authenticated;
grant execute on function public.bat_push_config(),public.bat_push_subscribe(uuid,text,jsonb,jsonb),public.bat_push_unsubscribe(uuid,text,text),public.bat_push_schedule(uuid,text,text,text,jsonb) to anon;


-- ══════════ 006_coop_adventures ══════════
-- Aventures collectives : après 004_cooperatives.sql. Migration additive, réexécutable.

create table if not exists public.coop_adventures (
 coop bigint not null references public.cooperatives(id), cycle int not null,
 kind text not null check(kind in('lighthouse','exhibition','regionalstation')),
 phase int not null default 0 check(phase between 0 and 3), started_at timestamptz not null default now(), completed_at timestamptz,
 primary key(coop,cycle)
);
create table if not exists public.coop_adventure_stages (
 coop bigint not null,cycle int not null,phase int not null check(phase between 0 and 2),
 resource text not null check(resource in('wood','stone','food')),goal int not null check(goal between 20 and 1000 and goal%20=0),
 progress int not null default 0 check(progress>=0),completed_at timestamptz,
 primary key(coop,cycle,phase),foreign key(coop,cycle) references public.coop_adventures(coop,cycle)
);
create table if not exists public.coop_adventure_rewards (
 player uuid not null references public.players(id),coop bigint not null,cycle int not null,phase int not null,
 coins int not null check(coins in(200,400,800)),decor text check(decor in('x_watchtower','x_gold_statue','x_mini_mill')),
 eligible_at timestamptz not null default now(),claimed_at timestamptz,
 primary key(player,coop,cycle,phase),foreign key(coop,cycle,phase) references public.coop_adventure_stages(coop,cycle,phase)
);
create table if not exists public.coop_adventure_cosmetics (
 player uuid not null references public.players(id),decor text not null check(decor in('x_watchtower','x_gold_statue','x_mini_mill')),
 earned_at timestamptz not null default now(),primary key(player,decor)
);
alter table public.coop_adventures enable row level security;
alter table public.coop_adventure_stages enable row level security;
alter table public.coop_adventure_rewards enable row level security;
alter table public.coop_adventure_cosmetics enable row level security;
revoke all on public.coop_adventures,public.coop_adventure_stages,public.coop_adventure_rewards,public.coop_adventure_cosmetics from public,anon,authenticated;

create or replace function public._adventure_rule(p_kind text) returns jsonb
language sql immutable set search_path='' as $$
 select case p_kind
 when 'lighthouse' then '{"decor":"x_watchtower","stages":[{"resource":"wood","goal":120,"coins":200},{"resource":"stone","goal":160,"coins":400},{"resource":"food","goal":200,"coins":800}]}'::jsonb
 when 'exhibition' then '{"decor":"x_gold_statue","stages":[{"resource":"wood","goal":160,"coins":200},{"resource":"stone","goal":120,"coins":400},{"resource":"food","goal":240,"coins":800}]}'::jsonb
 when 'regionalstation' then '{"decor":"x_mini_mill","stages":[{"resource":"stone","goal":160,"coins":200},{"resource":"wood","goal":200,"coins":400},{"resource":"food","goal":160,"coins":800}]}'::jsonb
 else null end
$$;
create or replace function public._adventure_view(p_player uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.cooperatives; a public.coop_adventures; stages jsonb; rewards jsonb; cosmetics jsonb;
begin
 select co.* into c from public.cooperatives co join public.coop_members m on m.coop=co.id where m.player=p_player and co.active;
 select coalesce(jsonb_agg(decor order by decor),'[]'::jsonb) into cosmetics from public.coop_adventure_cosmetics where player=p_player;
 if c.id is null then return jsonb_build_object('coop',null,'adventure',null,'owned',cosmetics);end if;
 select * into a from public.coop_adventures where coop=c.id order by cycle desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('phase',s.phase,'resource',s.resource,'goal',s.goal,'progress',s.progress,'completed',s.completed_at is not null,'coins',case s.phase when 0 then 200 when 1 then 400 else 800 end) order by s.phase),'[]'::jsonb)
 into stages from public.coop_adventure_stages s where s.coop=c.id and s.cycle=a.cycle;
 select coalesce(jsonb_agg(jsonb_build_object('cycle',r.cycle,'phase',r.phase,'coins',r.coins,'decor',r.decor) order by r.cycle,r.phase),'[]'::jsonb)
 into rewards from public.coop_adventure_rewards r where r.player=p_player and r.coop=c.id and r.claimed_at is null;
 return jsonb_build_object('coop',jsonb_build_object('id',c.id,'name',c.name,'owner',c.owner),'daily',coalesce((select amount from public.coop_daily where player=p_player and day=public._today()),0),
 'adventure',case when a.coop is null then null else jsonb_build_object('cycle',a.cycle,'kind',a.kind,'phase',a.phase,'startedAt',a.started_at,'completedAt',a.completed_at,'stages',stages) end,
 'rewards',rewards,'owned',cosmetics);
end $$;
create or replace function public.bat_adventure_capabilities() returns jsonb
language sql stable set search_path='' as $$select jsonb_build_object('version',1,'contribution',20,'daily',200)$$;
create or replace function public.bat_adventure(p_id uuid,p_secret text,p_action text,p_args jsonb default '{}'::jsonb,p_operation uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=public._me(p_id,p_secret);m public.coop_members;c public.cooperatives;a public.coop_adventures;s public.coop_adventure_stages;
 previous public.coop_receipts;rule jsonb;rec public.coop_adventure_rewards;v_cycle int;v_phase int;v_coins int:=0;v_cosmetics jsonb:='[]'::jsonb;result jsonb;v_decor text;inserted text;
begin
 if p_action='status' then return public._adventure_view(me);end if;
 if p_action is null or p_action not in('start','contribute','claim') then raise exception 'action inconnue';end if;
 if p_operation is null then raise exception 'operation requise';end if;
 select * into previous from public.coop_receipts where player=me and operation=p_operation;
 if found then if previous.action<>'adventure:'||p_action then raise exception 'operation reutilisee';end if;return previous.result;end if;
 if (select count(*) from public.coop_receipts where player=me and created_at >= (public._today()::timestamp at time zone 'Europe/Paris'))>=100 then raise exception 'limite operations du jour';end if;
 select * into m from public.coop_members where player=me;
 if m.player is null then raise exception 'pas membre';end if;
 select * into c from public.cooperatives where id=m.coop and active for update;
 if c.id is null then raise exception 'cooperative fermee';end if;
 select * into a from public.coop_adventures where coop=c.id order by cycle desc limit 1 for update;
 if p_action='start' then
  if c.owner<>me then raise exception 'reserve au fondateur';end if;
  if a.coop is not null and (a.completed_at is null or a.completed_at>now()-interval '24 hours') then raise exception 'aventure deja en cours ou repos de 24 heures';end if;
  rule:=public._adventure_rule(p_args->>'kind');if rule is null then raise exception 'aventure inconnue';end if;
  v_cycle:=coalesce(a.cycle,0)+1;
  insert into public.coop_adventures(coop,cycle,kind) values(c.id,v_cycle,p_args->>'kind');
  for v_phase in 0..2 loop insert into public.coop_adventure_stages(coop,cycle,phase,resource,goal) values(c.id,v_cycle,v_phase,rule#>>array['stages',v_phase::text,'resource'],(rule#>>array['stages',v_phase::text,'goal'])::int);end loop;
 elsif p_action='contribute' then
  if a.coop is null or a.phase>=3 then raise exception 'aucune aventure en cours';end if;
  if coalesce((p_args->>'cycle')::int,-1)<>a.cycle or coalesce((p_args->>'phase')::int,-1)<>a.phase then raise exception 'etape deja avancee';end if;
  select * into s from public.coop_adventure_stages where coop=c.id and cycle=a.cycle and phase=a.phase for update;
  if p_args->>'kind' is null or p_args->>'kind'<>s.resource then raise exception 'marchandise attendue differente';end if;
  insert into public.coop_daily(player,day,amount) values(me,public._today(),0) on conflict do nothing;
  update public.coop_daily set amount=amount+20 where player=me and day=public._today() and amount<=180;
  if not found then raise exception 'limite de contributions du jour';end if;
  update public.coop_adventure_stages set progress=least(goal,progress+20),completed_at=case when progress+20>=goal then now() else null end where coop=c.id and cycle=a.cycle and phase=a.phase returning * into s;
  if s.completed_at is not null then
   rule:=public._adventure_rule(a.kind);
   insert into public.coop_adventure_rewards(player,coop,cycle,phase,coins,decor)
   select player,c.id,a.cycle,a.phase,(rule#>>array['stages',a.phase::text,'coins'])::int,case when a.phase=2 then rule->>'decor' else null end
   from public.coop_members where coop=c.id;
   update public.coop_adventures set phase=phase+1,completed_at=case when phase=2 then now() else null end where coop=c.id and cycle=a.cycle;
  end if;
 elsif p_action='claim' then
  for rec in select * from public.coop_adventure_rewards where player=me and coop=c.id and claimed_at is null order by cycle,phase for update loop
   v_coins:=v_coins+rec.coins;
   if rec.decor is not null then
    inserted:=null;
    insert into public.coop_adventure_cosmetics(player,decor) values(me,rec.decor) on conflict do nothing returning decor into inserted;
    if inserted is not null then v_cosmetics:=v_cosmetics||to_jsonb(inserted);end if;
   end if;
   update public.coop_adventure_rewards set claimed_at=now() where player=me and coop=c.id and cycle=rec.cycle and phase=rec.phase;
  end loop;
 end if;
 result:=jsonb_build_object('view',public._adventure_view(me),'grant',case when v_coins>0 then jsonb_build_object('coins',v_coins) else '{}'::jsonb end,'cosmetics',v_cosmetics);
 insert into public.coop_receipts(player,operation,action,result) values(me,p_operation,'adventure:'||p_action,result);
 return result;
end $$;
revoke all on function public._adventure_rule(text),public._adventure_view(uuid) from public,anon,authenticated;
revoke all on function public.bat_adventure_capabilities(),public.bat_adventure(uuid,text,text,jsonb,uuid) from public;
grant execute on function public.bat_adventure_capabilities(),public.bat_adventure(uuid,text,text,jsonb,uuid) to anon,authenticated;


-- ══════════ 007_cloud_saves ══════════
-- Compte Supabase Auth : trois villages et cinq versions privées par emplacement.

create table if not exists public.cloud_slots (
 owner uuid not null references auth.users(id) on delete cascade,
 slot smallint not null check(slot between 0 and 2), revision int not null default 0,
 updated_at timestamptz not null default now(), primary key(owner,slot)
);
create table if not exists public.cloud_versions (
 owner uuid not null references auth.users(id) on delete cascade,
 slot smallint not null check(slot between 0 and 2), revision int not null check(revision>0),
 state jsonb not null, profile jsonb not null, identity jsonb,
 created_at timestamptz not null default now(), primary key(owner,slot,revision)
);
alter table public.cloud_slots enable row level security;
alter table public.cloud_versions enable row level security;
revoke all on public.cloud_slots,public.cloud_versions from public,anon,authenticated;
drop policy if exists cloud_slots_owner on public.cloud_slots;
create policy cloud_slots_owner on public.cloud_slots for select to authenticated using(owner=(select auth.uid()));
drop policy if exists cloud_versions_owner on public.cloud_versions;
create policy cloud_versions_owner on public.cloud_versions for select to authenticated using(owner=(select auth.uid()));
grant select on public.cloud_slots,public.cloud_versions to authenticated;
create or replace function public.bat_cloud_capabilities() returns jsonb language sql stable set search_path='' as $$select '{"version":1,"history":5,"slots":3}'::jsonb$$;
create or replace function public.bat_cloud_list() returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); result jsonb;
begin
 if who is null then raise exception 'connexion requise';end if;
 select coalesce(jsonb_agg(jsonb_build_object('slot',v.slot,'revision',v.revision,'headRevision',h.revision,'at',v.created_at,'name',v.state->>'name','level',v.state->'level','region',coalesce(v.state->>'regionId','home')) order by v.slot,v.revision desc),'[]'::jsonb)
 into result from public.cloud_versions v join public.cloud_slots h using(owner,slot) where v.owner=who;
 return result;
end$$;
create or replace function public.bat_cloud_read(p_slot int,p_revision int default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();result jsonb;
begin
 if who is null then raise exception 'connexion requise';end if;
 select jsonb_build_object('slot',v.slot,'revision',v.revision,'headRevision',h.revision,'state',v.state,'profile',v.profile,'identity',v.identity,'at',v.created_at)
 into result from public.cloud_versions v join public.cloud_slots h using(owner,slot)
 where v.owner=who and v.slot=p_slot and v.revision=coalesce(p_revision,h.revision);
 return result;
end$$;
create or replace function public.bat_cloud_save(p_slot int,p_state jsonb,p_profile jsonb,p_identity jsonb,p_expected int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();rev int;last_at timestamptz;
begin
 if who is null then raise exception 'connexion requise';end if;
 if p_slot is null or p_slot not between 0 and 2 or p_expected is null or p_expected<0 then raise exception 'emplacement invalide';end if;
 if jsonb_typeof(p_state) is distinct from 'object' or jsonb_typeof(p_state->'buildings') is distinct from 'array' or jsonb_array_length(p_state->'buildings')<1 or jsonb_typeof(p_state->'res') is distinct from 'object' or p_state->>'seed' is null or p_state ? 'botCity' or p_state->>'slot' is distinct from p_slot::text or octet_length(p_state::text)>3145728 then raise exception 'village invalide';end if;
 if jsonb_typeof(p_profile) is distinct from 'object' or octet_length(p_profile::text)>204800 then raise exception 'profil invalide';end if;
 if p_identity is not null and p_identity<>'null'::jsonb and (jsonb_typeof(p_identity) is distinct from 'object' or coalesce(p_identity->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or length(coalesce(p_identity->>'secret','')) not between 24 and 128 or length(coalesce(p_identity->>'code','')) not between 4 and 8 or octet_length(p_identity::text)>1024) then raise exception 'identite invalide';end if;
 if p_identity is not null and p_identity<>'null'::jsonb and not exists(select 1 from public.players where id::text=p_identity->>'id' and code=p_identity->>'code' and secret_hash=public._hash(p_identity->>'secret')) then raise exception 'identite invalide';end if;
 insert into public.cloud_slots(owner,slot) values(who,p_slot) on conflict do nothing;
 select revision,updated_at into rev,last_at from public.cloud_slots where owner=who and slot=p_slot for update;
 if rev<>p_expected then raise exception 'cloud conflict';end if;
 if rev>0 and last_at>now()-interval '20 seconds' then raise exception 'sauvegardes trop rapprochees';end if;
 rev:=rev+1;
 insert into public.cloud_versions(owner,slot,revision,state,profile,identity) values(who,p_slot,rev,p_state,p_profile,p_identity);
 update public.cloud_slots set revision=rev,updated_at=now() where owner=who and slot=p_slot;
 delete from public.cloud_versions where owner=who and slot=p_slot and revision<rev-4;
 return jsonb_build_object('slot',p_slot,'revision',rev,'at',now());
end$$;
revoke all on function public.bat_cloud_capabilities(),public.bat_cloud_list(),public.bat_cloud_read(int,int),public.bat_cloud_save(int,jsonb,jsonb,jsonb,int) from public,anon,authenticated;
grant execute on function public.bat_cloud_capabilities() to anon,authenticated;
grant execute on function public.bat_cloud_list(),public.bat_cloud_read(int,int),public.bat_cloud_save(int,jsonb,jsonb,jsonb,int) to authenticated;

-- Nettoyage : fonction témoin laissée par un test de connexion.
drop function if exists public._bat_probe();

commit;
notify pgrst, 'reload schema';
