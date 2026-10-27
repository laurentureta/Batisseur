-- Base isolée uniquement : rollback final, aucun accès production.
\set ON_ERROR_STOP on
begin;
insert into public.players(id,code,secret_hash,name) values
 ('f1000000-0000-4000-8000-000000000001','PUSH01',public._hash(repeat('a',32)),'Push test A'),
 ('f1000000-0000-4000-8000-000000000002','PUSH02',public._hash(repeat('b',32)),'Push test B');
update public.push_config set enabled=true,vapid_public_key=repeat('A',87) where id;
do $test$
declare
 a uuid:='f1000000-0000-4000-8000-000000000001'; b uuid:='f1000000-0000-4000-8000-000000000002';
 sub jsonb:=jsonb_build_object('endpoint','https://fcm.googleapis.com/test-one','keys',jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('B',22)));
 events jsonb; result jsonb; sid uuid; job bigint; n int;
begin
 assert (public.bat_push_config()->>'enabled')::boolean;
 assert not has_table_privilege('anon','public.push_subscriptions','SELECT');
 assert not has_table_privilege('authenticated','public.push_jobs','SELECT');
 assert not has_function_privilege('anon','public.bat_push_due()','EXECUTE');
 assert has_function_privilege('service_role','public.bat_push_due()','EXECUTE');
 begin perform public.bat_push_subscribe(a,repeat('x',32),sub); raise exception 'invalid auth accepted'; exception when others then assert sqlerrm='joueur inconnu';end;
 begin perform public.bat_push_subscribe(a,repeat('a',32),jsonb_set(sub,'{endpoint}','"http://127.0.0.1/private"'));raise exception 'SSRF accepted';exception when others then assert sqlerrm='abonnement invalide';end;
 begin perform public.bat_push_subscribe(a,repeat('a',32),jsonb_set(sub,'{keys,auth}','"bad"'));raise exception 'bad key accepted';exception when others then assert sqlerrm='cles invalides';end;
 perform public.bat_push_subscribe(a,repeat('a',32),sub);
 select id into sid from public.push_subscriptions where player_id=a;
 assert sid is not null;
 begin perform public.bat_push_subscribe(b,repeat('b',32),sub);raise exception 'subscription stolen';exception when others then assert sqlerrm='abonnement deja associe';end;
 perform public.bat_push_unsubscribe(b,repeat('b',32),sub->>'endpoint');
 assert exists(select 1 from public.push_subscriptions where id=sid);
 select jsonb_agg(jsonb_build_object('tag','construction:home:'||i,'kind','construction','at',now()+interval '1 minute')) into events from generate_series(1,12) i;
 perform public.bat_push_schedule(a,repeat('a',32),sub->>'endpoint','slot0',events);
 perform public.bat_push_schedule(a,repeat('a',32),sub->>'endpoint','slot0',events);
 assert (select count(*) from public.push_jobs where subscription_id=sid)=12;
 begin perform public.bat_push_schedule(a,repeat('a',32),sub->>'endpoint','slot9',events);raise exception 'scope accepted';exception when others then assert sqlerrm='calendrier invalide';end;
 assert (select count(*) from public.push_jobs where subscription_id=sid)=12;
 -- Scope réconcilié seul ; slot1 conserve son propre événement.
 perform public.bat_push_schedule(a,repeat('a',32),sub->>'endpoint','slot1',jsonb_build_array(events->0));
 perform public.bat_push_schedule(a,repeat('a',32),sub->>'endpoint','slot0',jsonb_build_array(events->0,events->1));
 assert (select count(*) from public.push_jobs where subscription_id=sid)=3;
 perform public.bat_push_schedule(a,repeat('a',32),sub->>'endpoint','slot0',events);
 update public.push_jobs set ready_at=now()-interval '1 minute' where subscription_id=sid;
 result:=public.bat_push_due();assert jsonb_array_length(result)=8;
 -- Le bail compte aussi dans le quota, un deuxième cron ne peut pas sélectionner les autres.
 assert public.bat_push_due()='[]'::jsonb;
 for job in select (value->>'id')::bigint from jsonb_array_elements(result) loop perform public.bat_push_result(job,201);end loop;
 assert public.bat_push_due()='[]'::jsonb;
 assert (select count(*) from public.push_jobs where sent_at is not null and subscription_id=sid)=8;
 -- Les reçus d'envoi empêchent un nouvel envoi lors des prochaines sauvegardes.
 perform public.bat_push_schedule(a,repeat('a',32),sub->>'endpoint','slot0',events);
 assert (select count(*) from public.push_jobs where subscription_id=sid and scope='slot0')=12;
 -- Une préférence désactivée supprime uniquement les tâches en attente.
 perform public.bat_push_subscribe(a,repeat('a',32),sub,'{"construction":false,"gifts":true}');
 assert not exists(select 1 from public.push_jobs where subscription_id=sid and sent_at is null);
 insert into public.gifts(from_id,to_id,kind,amount,day) values(b,a,'wood',60,public._today());
 assert exists(select 1 from public.push_jobs where subscription_id=sid and kind='gifts');
 perform public.bat_push_subscribe(a,repeat('a',32),sub,'{"gifts":false}');
 assert not exists(select 1 from public.push_jobs where subscription_id=sid and kind='gifts');
 -- Un téléphone désactivé efface calendrier et clés.
 perform public.bat_push_unsubscribe(a,repeat('a',32),sub->>'endpoint');
 assert not exists(select 1 from public.push_subscriptions where id=sid);
 assert not exists(select 1 from public.push_jobs where subscription_id=sid);
 -- Fournisseurs autorisés Apple/Mozilla et préférences réellement respectées.
 sub:=jsonb_set(sub,'{endpoint}','"https://web.push.apple.com/test-two"');
 perform public.bat_push_subscribe(a,repeat('a',32),sub,'{"orders":false}');
 select id into sid from public.push_subscriptions where player_id=a;
 perform public.bat_push_schedule(a,repeat('a',32),sub->>'endpoint','slot0',jsonb_build_array(jsonb_build_object('tag','orders:1','kind','orders','at',now()+interval '1 minute')));
 assert not exists(select 1 from public.push_jobs where subscription_id=sid);
 insert into public.push_jobs(subscription_id,scope,tag,kind,ready_at) values(sid,'slot0','construction:retry','construction',now()-interval '1 minute') returning id into job;
 result:=public.bat_push_due();assert jsonb_array_length(result)=1;
 perform public.bat_push_result(job,503);assert public.bat_push_due()='[]'::jsonb;
 update public.push_jobs set lease_until=now()-interval '1 minute' where id=job;
 result:=public.bat_push_due();assert jsonb_array_length(result)=1;
 perform public.bat_push_result(job,410);assert not exists(select 1 from public.push_subscriptions where id=sid);
 raise notice 'Web Push integration : auth, endpoints, RLS, preferences, idempotency, scopes, quota, leases, gifts, retry, unsubscribe OK';
end $test$;
rollback;
