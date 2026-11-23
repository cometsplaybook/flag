// Playbook Builder – offline support.
// Online: always load the newest version from the server and remember it.
// Offline: use the remembered copy.
const CACHE = 'playbook-builder-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
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
  e.waitUntil(self.registration.getNotifications({ tag }).then(list => {
    const old = list[0], n = ((old && old.data && old.data.n) || (old ? 1 : 0)) + 1;
    const body = n > 1 && m.many ? m.many.replace('{n}', n) : (m.body || '');
    return self.registration.showNotification(n > 1 && m.many ? 'Playbook' : (m.title || 'Playbook'), {
      body, tag, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', lang: 'de',
      data: { url: m.url || './', n }
    });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.postMessage({ push: url }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
