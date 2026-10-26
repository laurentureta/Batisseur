-- À exécuter une fois dans le SQL Editor du projet, après schema.sql.
-- Aucun secret d'administration n'est inclus ; les tables privées ne sont jamais exposées.
begin;
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
commit;
notify pgrst, 'reload schema';
