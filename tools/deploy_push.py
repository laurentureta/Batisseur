#!/usr/bin/env python3
"""Active Web Push avec le jeton Management Supabase injecté dans l'environnement.
Ne publie aucune clé privée. Le trousseau VAPID doit être sauvegardé hors du dépôt.
Usage: python3 tools/deploy_push.py --keys /workspace/.onboarding/push-secrets.json
Prérequis: Python cryptography, Node/npm (CLI Supabase), accès réseau Supabase/npm.
"""
import argparse, base64, json, os, pathlib, secrets, subprocess, sys, urllib.request, urllib.error
from cryptography.hazmat.primitives.asymmetric import ec

PROJECT = 'kuiyozeeqzjaqzifnfok'
REPO = pathlib.Path(__file__).resolve().parents[1]
BASE = f'https://api.supabase.com/v1/projects/{PROJECT}'

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--keys',required=True,type=pathlib.Path);args=parser.parse_args()
 token=os.environ.get('SUPABASE_ACCESS_TOKEN')
 if not token: print('SUPABASE_ACCESS_TOKEN absent : aucune opération distante effectuée.');return 2
 location=args.keys.expanduser().resolve()
 if location==REPO or REPO in location.parents: raise RuntimeError('Le trousseau privé doit rester en dehors du dépôt Git.')
 if location.exists():
  if location.stat().st_mode & 0o077: raise RuntimeError('Trousseau trop accessible : appliquer chmod 600 avant de continuer.')
  keys=json.loads(location.read_text())
 else:
  private=ec.generate_private_key(ec.SECP256R1());numbers=private.private_numbers();public=numbers.public_numbers
  encode=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
  keys={'VAPID_PUBLIC_KEY':encode(b'\x04'+public.x.to_bytes(32,'big')+public.y.to_bytes(32,'big')),'VAPID_PRIVATE_KEY':encode(numbers.private_value.to_bytes(32,'big')),'PUSH_CRON_SECRET':secrets.token_urlsafe(48)}
  location.parent.mkdir(parents=True,exist_ok=True)
  fd=os.open(location,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'w') as stream:json.dump(keys,stream)
 def api(path, data):
  request=urllib.request.Request(BASE+path,data=json.dumps(data).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
  try:
   with urllib.request.urlopen(request,timeout=60) as response:return json.loads(response.read() or 'null')
  except urllib.error.HTTPError as error:raise RuntimeError(f'Opération Supabase refusée (HTTP {error.code}). Aucun secret affiché.') from None
 def sql(query):return api('/database/query',{'query':query})
 quote=lambda s:"'"+s.replace("'","''")+"'"
 sql((REPO/'supabase/migrations/005_push.sql').read_text())
 config=sql('select vapid_public_key from public.push_config where id;')
 if config and config[0].get('vapid_public_key') not in('',keys['VAPID_PUBLIC_KEY']):raise RuntimeError('Le serveur utilise un autre trousseau VAPID. Restaurer le trousseau original ; aucune rotation automatique.')
 api('/secrets',[{'name':name,'value':value} for name,value in keys.items()])
 command=['npx','--yes','supabase@2.122.0','functions','deploy','push-dispatch','--project-ref',PROJECT,'--no-verify-jwt','--use-api']
 cli_env=dict(os.environ);cli_env.setdefault('npm_config_cache','/tmp/batisseur-npm-cache');cli_env.setdefault('SUPABASE_HOME','/tmp/batisseur-supabase-cli')
 result=subprocess.run(command,cwd=REPO,env=cli_env,capture_output=True,text=True,timeout=240)
 if result.returncode:raise RuntimeError('Déploiement Edge Function échoué. Les sorties ont été masquées pour protéger les données du projet. Vérifier Supabase CLI et les accès réseau.')
 # Vérifier la fonction avant d'activer le cron et la configuration publique.
 request=urllib.request.Request(f'https://{PROJECT}.supabase.co/functions/v1/push-dispatch',data=b'{}',headers={'Authorization':'Bearer '+keys['PUSH_CRON_SECRET'],'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=60) as response:
  if response.status!=200:raise RuntimeError('La fonction ne répond pas correctement.')
 sql("""create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
""")
 # Le token de cron est conservé dans Vault, jamais en clair dans la commande cron.
 cron_secret=quote(keys['PUSH_CRON_SECRET'])
 sql(f"""do $setup$ begin
 if exists(select 1 from vault.secrets where name='batisseur_push_cron') then
  perform vault.update_secret((select id from vault.secrets where name='batisseur_push_cron'),{cron_secret});
 else perform vault.create_secret({cron_secret},'batisseur_push_cron','Bâtisseur Web Push scheduler');end if;
end $setup$;
select cron.schedule('batisseur-push-dispatch','* * * * *',$cron$
 select net.http_post(url := 'https://{PROJECT}.supabase.co/functions/v1/push-dispatch',
 headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='batisseur_push_cron')),
 body := '{{}}'::jsonb,timeout_milliseconds := 55000);
$cron$);
update public.push_config set enabled=true,vapid_public_key={quote(keys['VAPID_PUBLIC_KEY'])} where id;
notify pgrst,'reload schema';
""")
 result=sql("select public.bat_push_config()->>'enabled' as enabled, exists(select 1 from cron.job where jobname='batisseur-push-dispatch' and active) as cron;")
 if not result or result[0].get('enabled')!='true' or not result[0].get('cron'):raise RuntimeError('Vérification finale incomplète. Consulter le projet Supabase.')
 print('Web Push activé : fonction serveur, clés privées, Vault, cron et configuration vérifiés. Tester ensuite depuis un vrai téléphone installé sur l’écran d’accueil.')
 return 0
if __name__=='__main__':
 try:sys.exit(main())
 except Exception as error:
  # Pas de traceback ni corps HTTP : ne jamais révéler de secrets dans les journaux.
  message=str(error) if isinstance(error,RuntimeError) else type(error).__name__
  print('Activation interrompue : '+message,file=sys.stderr);sys.exit(1)
