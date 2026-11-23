// Playbook Builder – offline support.
// Online: always load the newest version from the server and remember it.
// Offline: use the remembered copy.
const CACHE = 'playbook-builder-v1';
const BADGE = 'playbook-badge';   // number on the app icon (unread notifications since the app was last opened)
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== BADGE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./')))
  );
});

// ----- push notifications (from the team's push service) -----
// several messages of the same kind are shown as one: "3 neue Fragen zu Plays"
self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { title: 'Playbook', body: e.data ? e.data.text() : '' }; }
  const tag = m.tag || 'pb';
  // an open app fetches the news at once
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ pushed: tag }))).catch(() => {});
  e.waitUntil(badge(1).catch(() => {}).then(() => remember('notes', m, true)).catch(() => {}).then(() => self.registration.getNotifications({ tag })).then(list => {
    const old = list[0], n = ((old && old.data && old.data.n) || (old ? 1 : 0)) + 1;
    const body = n > 1 && m.many ? m.many.replace('{n}', n) : (m.body || '');
    return self.registration.showNotification(n > 1 && m.many ? 'Playbook' : (m.title || 'Playbook'), {
      body, tag, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', lang: 'de',
      data: { url: m.url || './', n, title: m.title || '', body: m.body || '' }
    });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {}, note = { title: d.title || e.notification.title, body: d.body || e.notification.body, url: d.url || './' };
  const url = new URL(note.url, self.registration.scope).href;
  remember('clicked', note, false).catch(() => {});   // the app shows what it was about when it opens
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.postMessage({ push: url, note }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});

// the red number on the app icon (iPhone home screen app, Chrome/Edge on the PC); the app sets it back to 0 when it is opened
async function badge(add) {
  const c = await caches.open(BADGE), key = new Request('badge-count');
  const r = await c.match(key); let n = r ? (+(await r.text()) || 0) : 0;
  n = Math.max(0, n + add); await c.put(key, new Response(String(n)));
  if (self.navigator.setAppBadge) { if (n) await self.navigator.setAppBadge(n); else await self.navigator.clearAppBadge(); }
}

// the last notifications of this device (shown in the app under 🔔) and the one just tapped
async function remember(key, m, list) {
  const c = await caches.open(BADGE), k = new Request('pb-' + key), it = { title: m.title || '', body: m.body || '', url: m.url || './', t: Date.now() };
  if (!list) return c.put(k, new Response(JSON.stringify(it)));
  const r = await c.match(k); let a = []; try { a = r ? JSON.parse(await r.text()) : []; } catch (e) { }
  a.unshift(it); await c.put(k, new Response(JSON.stringify(a.slice(0, 30))));
}
