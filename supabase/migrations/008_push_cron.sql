-- Le planificateur du serveur s'authentifie avec un secret tiré au sort par la base elle-même :
-- il n'est jamais affiché, ni dans la configuration publique, ni dans la commande de la tâche.
-- Nécessite les extensions pg_net et pg_cron (Supabase → Database → Extensions).
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.push_cron as
 select true as id, encode(extensions.gen_random_bytes(36),'hex') as secret;
alter table public.push_cron enable row level security;
revoke all on public.push_cron from public,anon,authenticated;

-- Seule la fonction d'envoi (service_role) peut comparer le secret reçu.
create or replace function public.bat_push_cron_secret() returns text
language sql stable security definer set search_path='' as $$select secret from public.push_cron limit 1$$;
revoke all on function public.bat_push_cron_secret() from public,anon,authenticated;
grant execute on function public.bat_push_cron_secret() to service_role;

-- Appel régulier de push-dispatch : le secret reste dans la base, jamais dans la tâche planifiée.
create or replace function public._push_tick() returns bigint
language plpgsql security definer set search_path='' as $$
declare s text; request bigint;
begin
 select secret into s from public.push_cron limit 1;
 if s is null then return null; end if;
 select net.http_post(
  url := 'https://kuiyozeeqzjaqzifnfok.supabase.co/functions/v1/push-dispatch',
  body := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||s),
  timeout_milliseconds := 20000
 ) into request;
 return request;
end$$;
revoke all on function public._push_tick() from public,anon,authenticated;
commit;

-- Enfin, la tâche : une passe par minute.
select cron.schedule('push-dispatch', '* * * * *', 'select public._push_tick()');
