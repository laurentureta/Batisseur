// Chargé par importScripts depuis sw.js. Les messages n'acceptent ni HTML ni URL externe.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* message vide */ }
  const scope = new URL(self.registration.scope);
  const slot = Number.isInteger(payload.slot) && payload.slot >= 0 && payload.slot <= 2 ? payload.slot : null;
  const url = new URL('./', scope); if (slot !== null) url.searchParams.set('notificationSlot', String(slot));
  event.waitUntil(self.registration.showNotification('Bâtisseur', {
    body: String(payload.body || 'Votre village vous attend.').slice(0,180),
    icon: new URL('icons/icon-192.png', scope).href,
    badge: new URL('icons/favicon-64.png', scope).href,
    tag: String(payload.tag || 'batisseur').slice(0,160),
    data: { url: url.href },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const base = new URL(self.registration.scope), url = new URL(event.notification.data?.url || base.href, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async (clients) => {
    const client = clients.find((c)=>c.url.startsWith(base.href));
    if (client) { await client.focus(); client.postMessage({type:'notification:open',url:url.href}); return; }
    return self.clients.openWindow(url.href);
  }));
});
