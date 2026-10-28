-- Compte Supabase Auth : trois villages et cinq versions privées par emplacement.
begin;
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
commit;
notify pgrst,'reload schema';
