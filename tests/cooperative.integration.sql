-- Exécuter sur une base de test ayant reçu schema.sql et 004_cooperatives.sql.
-- Toutes les données de ce test sont annulées à la fin.
\set ON_ERROR_STOP on
begin;
do $$
declare a uuid; b uuid; outsider uuid; secret text:='local-test-secret-000000000000'; c jsonb; r jsonb; op uuid; request_id uuid; coop_id bigint; rejected boolean;
begin
 a:=(public.bat_register(secret,'Alice test','Village A')->>'id')::uuid;
 b:=(public.bat_register(secret,'Benoît test','Village B')->>'id')::uuid;
 outsider:=(public.bat_register(secret,'Chloé test','Village C')->>'id')::uuid;
 rejected:=false;
 begin perform public.bat_coop(a,'incorrect','status'); exception when others then rejected:=true; end;
 assert rejected,'Le secret incorrect doit être refusé';
 c:=public.bat_coop(a,secret,'create','{"name":"Les Bâtisseurs test"}',gen_random_uuid());
 coop_id:=(c#>>'{view,coop,id}')::bigint;
 perform public.bat_coop(b,secret,'join',jsonb_build_object('code',c#>>'{view,coop,code}'),gen_random_uuid());
 assert (select count(*) from public.coop_members where coop=coop_id)=2,'Deux membres attendus';
 perform public.bat_coop(a,secret,'request','{"kind":"wood"}',gen_random_uuid());
 select id into request_id from public.coop_requests where recipient=a and coop=coop_id;
 op:=gen_random_uuid();
 r:=public.bat_coop(b,secret,'send',jsonb_build_object('request',request_id),op);
 assert public.bat_coop(b,secret,'send',jsonb_build_object('request',request_id),op)=r,'Un rejeu doit retourner le même reçu';
 assert (select amount from public.coop_daily where player=b)=20,'Un rejeu ne double pas la dépense';
 rejected:=false;
 begin perform public.bat_coop(b,secret,'send',jsonb_build_object('request',request_id),gen_random_uuid()); exception when others then rejected:=true; end;
 assert rejected,'Un colis ne peut être envoyé deux fois';
 r:=public.bat_coop(a,secret,'claim','{}',gen_random_uuid());
 assert (r#>>'{grant,wood}')::int=20,'Le destinataire reçoit le colis';
 r:=public.bat_coop(a,secret,'claim','{}',gen_random_uuid());
 assert r->'grant'='{}'::jsonb,'Le colis est récupéré une seule fois';
 perform public.bat_coop(a,secret,'request','{"kind":"food"}',gen_random_uuid());
 select id into request_id from public.coop_requests where recipient=a and donor is null;
 rejected:=false;
 begin perform public.bat_coop(b,secret,'cancel',jsonb_build_object('request',request_id),gen_random_uuid());exception when others then rejected:=true;end;
 assert rejected,'Un joueur ne peut annuler la demande d’un autre';
 perform public.bat_coop(a,secret,'cancel',jsonb_build_object('request',request_id),gen_random_uuid());
 assert not exists(select 1 from public.coop_requests where id=request_id),'Une demande en attente peut être annulée';
 for i in 1..9 loop perform public.bat_coop(b,secret,'contribute','{"kind":"stone"}',gen_random_uuid());end loop;
 assert (select amount from public.coop_daily where player=b)=200,'Quota partagé entre colis et chantier';
 rejected:=false;
 begin perform public.bat_coop(b,secret,'contribute','{"kind":"wood"}',gen_random_uuid());exception when others then rejected:=true;end;
 assert rejected,'Le quota quotidien doit être appliqué côté serveur';
 update public.coop_projects set progress=980 where coop=coop_id and cycle=1;
 perform public.bat_coop(a,secret,'contribute','{"kind":"food"}',gen_random_uuid());
 assert (select completed_at is not null from public.coop_projects where coop=coop_id and cycle=1),'Le projet doit être inauguré à 1000';
 r:=public.bat_coop(a,secret,'claim','{}',gen_random_uuid());
 assert (r#>>'{grant,coins}')::int=1000,'La récompense du projet doit être fixe';
 r:=public.bat_coop(a,secret,'claim','{}',gen_random_uuid());
 assert r->'grant'='{}'::jsonb,'La récompense ne peut être récupérée deux fois';
 perform public.bat_coop(outsider,secret,'join',jsonb_build_object('code',c#>>'{view,coop,code}'),gen_random_uuid());
 update public.coop_members set joined_at=now()+interval '1 second' where player=outsider;
 r:=public.bat_coop(outsider,secret,'claim','{}',gen_random_uuid());
 assert r->'grant'='{}'::jsonb,'Une arrivée après les travaux ne donne pas de récompense';
 rejected:=false;
 begin perform public.bat_coop(a,secret,'request','{"kind":"gems"}',gen_random_uuid());exception when others then rejected:=true;end;
 assert rejected,'Les ressources premium ne peuvent pas être forgées';
 rejected:=false;
 begin perform public.bat_coop(b,secret,'next','{}',gen_random_uuid());exception when others then rejected:=true;end;
 assert rejected,'Seul le fondateur prépare le prochain chantier';
 for i in 1..3 loop
  perform public.bat_coop(a,secret,'request','{"kind":"food"}',gen_random_uuid());
  select id into request_id from public.coop_requests where recipient=a and donor is null;
  perform public.bat_coop(a,secret,'cancel',jsonb_build_object('request',request_id),gen_random_uuid());
 end loop;
 rejected:=false;
 begin perform public.bat_coop(a,secret,'request','{"kind":"food"}',gen_random_uuid());exception when others then rejected:=true;end;
 assert rejected,'Annuler une demande ne réinitialise pas le quota journalier';
 raise notice 'PASS: authentification, adhésion, dons idempotents, récupération unique, quotas, projet, éligibilité et droits';
end$$;
set local role anon;
do $$
declare rejected boolean:=false;
begin
 begin perform * from public.coop_members;exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Les tables privées ne doivent pas être lisibles par anon';
 assert (public.bat_coop_capabilities()->>'version')::int=1,'Seule la capacité publique est lisible';
 raise notice 'PASS: isolation des tables et capacités publiques';
end$$;
reset role;
rollback;
