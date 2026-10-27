// Exécution : deno test --allow-env tests/push-encryption.test.ts
// Aucun envoi réseau. Vérifie le chiffrement Web Push et l'authentification VAPID du runtime Edge.
import webpush from 'npm:web-push@3.6.7';
Deno.test('Web Push : message réellement chiffré et signé, sans requête réseau',async()=>{
 const keys=webpush.generateVAPIDKeys();
 const recipient=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const publicBytes=new Uint8Array(await crypto.subtle.exportKey('raw',recipient.publicKey));
 const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
 const subscription={endpoint:'https://web.push.apple.com/test-only',keys:{p256dh:encode(publicBytes),auth:encode(crypto.getRandomValues(new Uint8Array(16)))}};
 webpush.setVapidDetails('https://laurentureta.github.io/Batisseur/',keys.publicKey,keys.privateKey);
 const payload=JSON.stringify({body:'Un chantier est prêt.',tag:'construction:home:1',slot:0});
 const request=webpush.generateRequestDetails(subscription,payload,{TTL:3600});
 if(request.endpoint!==subscription.endpoint||request.method!=='POST')throw new Error('Invalid Web Push request');
 if(!request.headers.Authorization?.startsWith('vapid '))throw new Error('VAPID signature missing');
 if(request.headers['Content-Encoding']!=='aes128gcm')throw new Error('Encryption not enabled');
 if(new TextDecoder().decode(request.body).includes('Un chantier'))throw new Error('Plain text notification leaked');
 if(request.body.length<=payload.length)throw new Error('Encrypted frame missing');
});
