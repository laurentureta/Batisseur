-- Base isolée : auth.users/auth.uid et rôles Supabase doivent exister.
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare r jsonb;player json;identity jsonb;st jsonb:='{"slot":0,"name":"Test","seed":42,"res":{},"buildings":[{"id":1,"type":"townhall"}]}';i int;
begin
 r:=public.bat_cloud_save(0,st,'{}',null,0);if r->>'revision'<>'1'then raise exception 'first revision';end if;
 begin perform public.bat_cloud_save(0,st,'{}',null,0);raise exception 'conflict accepted';exception when others then if sqlerrm<>'cloud conflict'then raise;end if;end;
 for i in 2..7 loop
  update public.cloud_slots set updated_at=now()-interval'30 seconds';
  r:=public.bat_cloud_save(0,st||jsonb_build_object('name','Test'||i),'{}',null,i-1);
 end loop;
 player:=public.bat_register('cloud-integration-secret-valid-24','Cloud Tester','Village test');
 identity:=jsonb_build_object('id',player->>'id','code',player->>'code','secret','cloud-integration-secret-valid-24');
 r:=public.bat_cloud_save(1,st||'{"slot":1}', '{}',identity,0);
 if public.bat_cloud_read(1)->'identity'->>'id'<>player->>'id' then raise exception 'private identity missing';end if;
 begin perform public.bat_cloud_save(2,st||'{"slot":2}','{}',identity||'{"secret":"incorrect-integration-secret"}',0);raise exception 'identity auth bypass';exception when others then if sqlerrm<>'identite invalide'then raise;end if;end;
 if(select count(*)from public.cloud_versions where slot=0)<>5 then raise exception 'history not bounded';end if;
 if public.bat_cloud_read(0,1)is not null then raise exception 'old history retained';end if;
 if public.bat_cloud_read(0,3)->'state'->>'name'<>'Test3' then raise exception 'restore history';end if;
 begin perform public.bat_cloud_save(0,st||'{"botCity":{}}','{}',null,7);raise exception 'bot accepted';exception when others then if sqlerrm<>'village invalide'then raise;end if;end;
 begin perform public.bat_cloud_save(1,st,'{}',null,0);raise exception 'wrong slot accepted';exception when others then if sqlerrm<>'village invalide'then raise;end if;end;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
 if(select count(*)from public.cloud_versions)<>0 then raise exception 'RLS private version leaked';end if;
 if jsonb_array_length(public.bat_cloud_list())<>0 then raise exception 'other account listed';end if;
 if public.bat_cloud_read(0)is not null then raise exception 'other account readable';end if;
 begin insert into public.cloud_slots(owner,slot)values('22222222-2222-4222-8222-222222222222',0);raise exception 'direct write accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 begin perform public.bat_cloud_list();raise exception 'anonymous identity accepted';exception when others then if sqlerrm<>'connexion requise'then raise;end if;end;
end$$;
set local role anon;
do $$begin
 perform public.bat_cloud_capabilities();
 begin perform public.bat_cloud_read(0);raise exception 'anon read allowed';exception when insufficient_privilege then null;end;
end$$;
rollback;
