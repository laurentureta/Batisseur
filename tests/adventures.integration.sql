-- Exécuter uniquement dans une base de test après schema.sql, 004 et 006. Aucun effet persistant.
\set ON_ERROR_STOP on
begin;
insert into public.players(id,code,secret_hash,name) values
 ('a6000000-0000-4000-8000-000000000001','ADV001',public._hash(repeat('a',32)),'Alice'),
 ('a6000000-0000-4000-8000-000000000002','ADV002',public._hash(repeat('b',32)),'Basile'),
 ('a6000000-0000-4000-8000-000000000003','ADV003',public._hash(repeat('c',32)),'Camille'),
 ('a6000000-0000-4000-8000-000000000004','ADV004',public._hash(repeat('d',32)),'Diane');
do $test$
declare
 a uuid:='a6000000-0000-4000-8000-000000000001';b uuid:='a6000000-0000-4000-8000-000000000002';c uuid:='a6000000-0000-4000-8000-000000000003';d uuid:='a6000000-0000-4000-8000-000000000004';
 r jsonb;old jsonb;op uuid;cid bigint;code text;i int;v_phase int;kind text;
begin
 assert (public.bat_adventure_capabilities()->>'version')::int=1;
 assert not has_table_privilege('anon','public.coop_adventures','SELECT');
 assert not has_table_privilege('authenticated','public.coop_adventure_rewards','SELECT');
 assert not has_function_privilege('anon','public._adventure_view(uuid)','EXECUTE');
 begin perform public.bat_adventure(a,repeat('z',32),'status');raise exception 'bad auth accepted';exception when others then assert sqlerrm='joueur inconnu';end;
 assert public.bat_adventure(a,repeat('a',32),'status')->'coop'='null'::jsonb;
 begin perform public.bat_adventure(a,repeat('a',32),'start','{"kind":"lighthouse"}',gen_random_uuid());raise exception 'outsider accepted';exception when others then assert sqlerrm='pas membre';end;
 r:=public.bat_coop(a,repeat('a',32),'create','{"name":"Aventure test"}',gen_random_uuid());
 cid:=(r#>>'{view,coop,id}')::bigint;code:=r#>>'{view,coop,code}';
 perform public.bat_coop(b,repeat('b',32),'join',jsonb_build_object('code',code),gen_random_uuid());
 perform public.bat_coop(c,repeat('c',32),'join',jsonb_build_object('code',code),gen_random_uuid());
 begin perform public.bat_adventure(b,repeat('b',32),'start','{"kind":"lighthouse"}',gen_random_uuid());raise exception 'non founder accepted';exception when others then assert sqlerrm='reserve au fondateur';end;
 begin perform public.bat_adventure(a,repeat('a',32),'start','{"kind":"premiumhack"}',gen_random_uuid());raise exception 'unknown adventure accepted';exception when others then assert sqlerrm='aventure inconnue';end;
 op:=gen_random_uuid();r:=public.bat_adventure(a,repeat('a',32),'start','{"kind":"lighthouse"}',op);
 assert r#>>'{view,adventure,kind}'='lighthouse';assert jsonb_array_length(r#>'{view,adventure,stages}')=3;
 assert public.bat_adventure(a,repeat('a',32),'start','{"kind":"exhibition"}',op)=r;
 begin perform public.bat_coop(a,repeat('a',32),'claim','{}',op);raise exception 'namespace reused';exception when others then assert sqlerrm='operation reutilisee';end;
 begin perform public.bat_adventure(a,repeat('a',32),'contribute','{"cycle":1,"phase":0,"kind":"food"}',gen_random_uuid());raise exception 'wrong resource accepted';exception when others then assert sqlerrm='marchandise attendue differente';end;
 op:=gen_random_uuid();r:=public.bat_adventure(a,repeat('a',32),'contribute','{"cycle":1,"phase":0,"kind":"wood","amount":100000}',op);
 assert (r#>>'{view,adventure,stages,0,progress}')::int=20;
 assert public.bat_adventure(a,repeat('a',32),'contribute','{"cycle":1,"phase":0,"kind":"wood"}',op)=r;
 assert (select amount from public.coop_daily where player=a and day=public._today())=20;
 for i in 1..5 loop perform public.bat_adventure(a,repeat('a',32),'contribute','{"cycle":1,"phase":0,"kind":"wood"}',gen_random_uuid());end loop;
 assert (public.bat_adventure(b,repeat('b',32),'status')#>>'{adventure,phase}')::int=1;
 -- Diane arrive après l'étape0 ; elle ne reçoit pas de récompense rétroactive.
 perform public.bat_coop(d,repeat('d',32),'join',jsonb_build_object('code',code),gen_random_uuid());
 assert not exists(select 1 from public.coop_adventure_rewards where player=d);
 begin perform public.bat_adventure(a,repeat('a',32),'contribute','{"cycle":1,"phase":0,"kind":"wood"}',gen_random_uuid());raise exception 'stale phase accepted';exception when others then assert sqlerrm='etape deja avancee';end;
 for i in 1..4 loop perform public.bat_adventure(a,repeat('a',32),'contribute','{"cycle":1,"phase":1,"kind":"stone"}',gen_random_uuid());end loop;
 begin perform public.bat_coop(a,repeat('a',32),'contribute','{"kind":"wood"}',gen_random_uuid());raise exception 'shared quota bypassed';exception when others then assert sqlerrm='limite de contributions du jour';end;
 for i in 1..4 loop perform public.bat_adventure(b,repeat('b',32),'contribute','{"cycle":1,"phase":1,"kind":"stone"}',gen_random_uuid());end loop;
 for i in 1..6 loop perform public.bat_adventure(b,repeat('b',32),'contribute','{"cycle":1,"phase":2,"kind":"food"}',gen_random_uuid());end loop;
 for i in 1..4 loop perform public.bat_adventure(c,repeat('c',32),'contribute','{"cycle":1,"phase":2,"kind":"food"}',gen_random_uuid());end loop;
 assert (public.bat_adventure(d,repeat('d',32),'status')#>>'{adventure,phase}')::int=3;
 assert (select count(*) from public.coop_adventure_rewards where coop=cid)=11;
 op:=gen_random_uuid();r:=public.bat_adventure(a,repeat('a',32),'claim','{}',op);
 assert (r#>>'{grant,coins}')::int=1400;assert r->'cosmetics'='["x_watchtower"]'::jsonb;
 assert public.bat_adventure(a,repeat('a',32),'claim','{}',op)=r;
 r:=public.bat_adventure(a,repeat('a',32),'claim','{}',gen_random_uuid());assert r->'grant'='{}'::jsonb;assert r->'cosmetics'='[]'::jsonb;
 r:=public.bat_adventure(d,repeat('d',32),'claim','{}',gen_random_uuid());assert (r#>>'{grant,coins}')::int=1200;
 begin perform public.bat_adventure(a,repeat('a',32),'start','{"kind":"lighthouse"}',gen_random_uuid());raise exception 'cooldown bypassed';exception when others then assert sqlerrm='aventure deja en cours ou repos de 24 heures';end;
 -- Tester le cycle suivant sans attendre24h dans cette base isolée.
 update public.coop_adventures set completed_at=now()-interval '25 hours' where coop=cid;
 perform public.bat_adventure(c,repeat('c',32),'claim','{}',gen_random_uuid());
 perform public.bat_adventure(a,repeat('a',32),'start','{"kind":"lighthouse"}',gen_random_uuid());
 -- Une récompense du cycle1 reste récupérable même si le cycle2 a commencé.
 r:=public.bat_adventure(b,repeat('b',32),'claim','{}',gen_random_uuid());assert (r#>>'{grant,coins}')::int=1400;
 for v_phase in 0..2 loop
  update public.coop_adventure_stages set progress=goal-20 where coop=cid and cycle=2 and coop_adventure_stages.phase=v_phase;
  select resource into kind from public.coop_adventure_stages where coop=cid and cycle=2 and coop_adventure_stages.phase=v_phase;
  perform public.bat_adventure(c,repeat('c',32),'contribute',jsonb_build_object('cycle',2,'phase',v_phase,'kind',kind),gen_random_uuid());
 end loop;
 r:=public.bat_adventure(c,repeat('c',32),'claim','{}',gen_random_uuid());assert (r#>>'{grant,coins}')::int=1400;assert r->'cosmetics'='[]'::jsonb;
 assert (select count(*) from public.coop_adventure_cosmetics where player=c and decor='x_watchtower')=1;
 assert (public.bat_coop(a,repeat('a',32),'status')#>>'{coop,progress}')::int=0;
 raise notice 'Aventures : partage réel, trois étapes, quota commun, reçus, rôles, ressources fixes, éligibilité, récompenses et cycles OK';
end $test$;
rollback;
