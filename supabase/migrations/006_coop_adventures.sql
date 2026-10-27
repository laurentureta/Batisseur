-- Aventures collectives : après 004_cooperatives.sql. Migration additive, réexécutable.
begin;
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
commit;
notify pgrst,'reload schema';
