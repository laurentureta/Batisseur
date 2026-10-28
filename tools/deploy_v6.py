#!/usr/bin/env python3
"""Active les migrations Bâtisseur v6 avec SUPABASE_ACCESS_TOKEN injecté.
Aucun secret n'est écrit dans le dépôt ni affiché. Utiliser --with-push pour
activer aussi les notifications avec un trousseau VAPID hors du dépôt.
"""
import argparse, json, os, pathlib, subprocess, sys, urllib.request, urllib.error
PROJECT='kuiyozeeqzjaqzifnfok'
BASE=f'https://api.supabase.com/v1/projects/{PROJECT}'
ROOT=pathlib.Path(__file__).resolve().parents[1]
SITE='https://laurentureta.github.io/Batisseur/'
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--with-push',action='store_true');parser.add_argument('--keys',type=pathlib.Path);args=parser.parse_args()
 token=os.environ.get('SUPABASE_ACCESS_TOKEN')
 if not token:print('SUPABASE_ACCESS_TOKEN absent : aucune opération distante effectuée.');return 2
 if args.with_push and not args.keys:raise RuntimeError('Préciser --keys avec un chemin privé hors du dépôt pour les notifications.')
 def api(path,body=None,method='POST'):
  request=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
  try:
   with urllib.request.urlopen(request,timeout=60)as response:return json.loads(response.read()or'null')
  except urllib.error.HTTPError as e:raise RuntimeError(f'Opération Supabase refusée (HTTP {e.code}). Aucun secret affiché.')from None
 def sql(query):return api('/database/query',{'query':query})
 for file in ['004_cooperatives.sql','006_coop_adventures.sql','007_cloud_saves.sql']:
  sql((ROOT/'supabase/migrations'/file).read_text())
 # Les e-mails de confirmation/récupération doivent revenir vers le jeu installé.
 auth=api('/config/auth',method='GET')
 allowed=auth.get('uri_allow_list','')or''
 if isinstance(allowed,str):allowed=[s.strip()for s in allowed.split(',')if s.strip()]
 for url in [SITE,SITE+'**']:
  if url not in allowed:allowed.append(url)
 api('/config/auth',{'site_url':SITE,'uri_allow_list':','.join(allowed),'external_email_enabled':True,'disable_signup':False},method='PATCH')
 result=sql("select public.bat_cloud_capabilities()->>'version' as cloud, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='bat_adventure') as adventures;")
 if not result or result[0].get('cloud')!='1' or not result[0].get('adventures'):raise RuntimeError('Vérification de migration incomplète.')
 if args.with_push:
  done=subprocess.run([sys.executable,str(ROOT/'tools/deploy_push.py'),'--keys',str(args.keys)],cwd=ROOT,capture_output=True,text=True,timeout=300)
  if done.returncode:raise RuntimeError('Migrations v6 actives, mais activation Web Push incomplète. Relancer tools/deploy_push.py avec le même trousseau privé.')
 print('Services v6 activés : coopératives, aventures, sauvegardes privées et URL d’authentification vérifiées. Tester ensuite la connexion et la récupération depuis le téléphone.')
 return 0
if __name__=='__main__':
 try:sys.exit(main())
 except Exception as e:
  print('Activation interrompue : '+(str(e)if isinstance(e,RuntimeError)else type(e).__name__),file=sys.stderr);sys.exit(1)
