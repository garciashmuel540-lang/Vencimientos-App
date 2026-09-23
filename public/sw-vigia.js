/* Service worker de alertas de Vigía.
   No cachea la app (Vite/HMR y el plugin PWA de la plataforma se encargan).
   Recibe mensajes de la página y, si hay Periodic Background Sync, revisa
   el snapshot de alertas guardado en Cache Storage. */

const ALERTS_CACHE = "vigia-meta";
const ALERTS_URL = "/vigia-alerts.json";
const SHOWN_KEY = "vigia-shown";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "NOTIFY" && data.title) {
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body || "",
        tag: data.tag || "vigia",
        renotify: true,
        icon: "/icon-192.png",
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
      return undefined;
    }),
  );
});

async function checkSnapshot() {
  try {
    const cache = await caches.open(ALERTS_CACHE);
    const res = await cache.match(ALERTS_URL);
    if (!res) return;
    const payload = await res.json();
    const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
    const urgent = alerts.filter(
      (a) => a.level === "expired" || a.level === "today",
    );
    if (!urgent.length) return;

    const shownRes = await cache.match(SHOWN_KEY);
    const shown = shownRes ? await shownRes.json() : { ids: [], at: 0 };
    const day = new Date().toISOString().slice(0, 10);
    const already = shown.day === day ? new Set(shown.ids) : new Set();
    const fresh = urgent.filter((a) => !already.has(a.id));
    if (!fresh.length) return;

    await self.registration.showNotification(
      fresh.length === 1 ? fresh[0].title : `${fresh.length} avisos de vencimiento`,
      {
        body: fresh[0].body,
        tag: "vigia-digest",
        renotify: true,
        icon: "/icon-192.png",
      },
    );
    const ids = [...already, ...fresh.map((a) => a.id)];
    await cache.put(
      SHOWN_KEY,
      new Response(JSON.stringify({ day, ids }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch (err) {
    console.warn("[vigia sw]", err);
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "vigia-expiry-check") {
    event.waitUntil(checkSnapshot());
  }
});
