// Supabase Edge Function. Déployer avec verify_jwt=false : le cron utilise son propre secret.
import webpush from 'npm:web-push@3.6.7';
const TEXT: Record<string,string> = {
 orders:'Une nouvelle commande est disponible dans votre village.',
 construction:'Un chantier est terminé. Votre bâtiment attend son inauguration !',
 projects:'Une étape de votre grand projet est terminée.',
 shipments:'Une livraison régionale est arrivée à destination.',
 gifts:'Un ami vous a envoyé un cadeau. Venez le récupérer !',
};
const allowed = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
async function rpc(name: string, body = {}) {
 const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${name}`,{
  method:'POST',headers:{apikey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,Authorization:`Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
 });
 if(!response.ok)throw new Error(`Database status ${response.status}`);
 return response.status===204?null:response.json();
}
// Constant-time comparison without exposing scheduler credentials.
async function sameSecret(a: string,b: string) {
 const encoder = new TextEncoder(), [x,y] = await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);
 const xx=new Uint8Array(x),yy=new Uint8Array(y);let mismatch=0;for(let i=0;i<xx.length;i++)mismatch|=xx[i]^yy[i];return mismatch===0;
}
Deno.serve(async(req: Request)=>{
 const secret=Deno.env.get('PUSH_CRON_SECRET')||'';
 if(req.method!=='POST'||secret.length<32||!await sameSecret(req.headers.get('Authorization')||'',`Bearer ${secret}`))return new Response('Unauthorized',{status:401});
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY');
 if(!publicKey||!privateKey)return new Response('Push not configured',{status:503});
 webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')||'https://laurentureta.github.io/Batisseur/',publicKey,privateKey);
 try {
  const jobs=await rpc('bat_push_due');let sent=0,failed=0;
  // Au plus cinq envois simultanés, vingt par passage : borne adaptée au runtime Edge.
  const dispatch = async(job: any)=>{
   let status=400;
   if(allowed.test(job.subscription.endpoint)){
    try {
     const slot=/^slot([0-2])$/.exec(job.scope);
     const payload={body:TEXT[job.kind]||'Votre village vous attend.',tag:`${job.scope}:${job.tag}`,slot:slot?Number(slot[1]):null};
     const result=await webpush.sendNotification(job.subscription,JSON.stringify(payload),{TTL:3600,urgency:'normal',timeout:10000});status=result.statusCode;
    }catch(error){status=Number((error as {statusCode?:number}).statusCode)||503;}
   }
   await rpc('bat_push_result',{p_job:job.id,p_status:status});
   if(status>=200&&status<300)sent++;else failed++;
  };
  for(let i=0;i<jobs.length;i+=5) await Promise.all(jobs.slice(i,i+5).map(dispatch));
  return Response.json({sent,failed});
 }catch{return new Response('Dispatch unavailable',{status:503});}
});
