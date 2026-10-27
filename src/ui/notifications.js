import { h } from './dom.js';
import { openScreen } from './screens.js';
import { PUSH_KINDS } from '../net/Notifications.js';
export function openNotifications(ui) {
  const client = ui.game.notifications;
  let checked = false;
  const action = async (fn) => { try { await fn(); } catch (e) { ui.toast(e.message, 'error'); } finally { screen.refresh(true); } };
  const screen = openScreen(ui,{ id:'notifications', title:'🔔 Notifications', cls:'city-screen', render(body) {
    const support = client.support();
    body.append(h('h2.city-heading','Votre village vous prévient'),h('p.city-note','Recevez un message sur votre téléphone quand une commande, un chantier ou une livraison est prêt, même lorsque le jeu est fermé. Les cadeaux des vrais amis peuvent aussi vous prévenir.'));
    if (!support.available) { body.append(h('article.city-card',h('h3',support.install?'Installer Bâtisseur sur iPhone':'Compatibilité'),h('p',support.message))); return; }
    if (client.error) body.append(h('p.city-error',{role:'status'},client.error));
    if (!checked) { body.append(h('p.city-note','Vérification du téléphone et du service…')); return; }
    const ready = client.config?.enabled && client.config.publicKey;
    body.append(h('article.city-card',h('h3',client.enabled?'Ce téléphone est connecté':ready?'Prêt à connecter ce téléphone':'Activation du serveur nécessaire'),h('p',client.enabled?'Les échéances de vos villages sauvegardés sont transmises au serveur. Vous pouvez désactiver les notifications à tout moment.':ready?'L’autorisation sera demandée uniquement lorsque vous toucherez le bouton ci-dessous.':'Le jeu peut être installé, mais les envois en arrière-plan attendent la configuration du service Web Push.'),h('button.btn.primary',{disabled:client.loading||(!ready&&!client.enabled),onclick:()=>action(()=>client.enabled?client.disable():client.enable())},client.loading?'Connexion…':client.enabled?'Désactiver sur ce téléphone':'Activer les notifications')));
    body.append(h('h3','Choisir mes rappels'));
    for (const [kind,label] of Object.entries(PUSH_KINDS)) body.append(h('label.city-card.notification-choice',h('input',{type:'checkbox',checked:client.preferences[kind],disabled:client.loading,onchange:(e)=>action(()=>client.setPreference(kind,e.target.checked))}),h('span',label)));
    body.append(h('p.city-note','Les rappels suivent les heures réelles. Un même événement est envoyé une seule fois. Le téléphone et le réseau peuvent retarder sa réception. Aucune notification publicitaire.'));
  }});
  client.status().finally(()=>{checked=true;if(ui.screen===screen)screen.refresh(true);});
  return screen;
}
