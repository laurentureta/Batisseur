-- Notifications Web Push : abonnement volontaire et échéances personnelles.
-- Le déploiement de la fonction push-dispatch et de son cron est documenté séparément.
begin;
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
commit;
notify pgrst,'reload schema';
