/**
 * Alertas locales + Service Worker.
 * El navegador no permite programar notificaciones arbitrarias con la app cerrada
 * sin un servidor de push. Alternativa: avisos al abrir, Periodic Background Sync
 * cuando la PWA está instalada, y un resumen compartible por WhatsApp/correo.
 */
import { daysUntil } from "./dates";
import type { AlertSettings, Product } from "./types";

const ALERTS_CACHE = "vigia-meta";
const ALERTS_URL = "/vigia-alerts.json";

export interface DueAlert {
  id: string;
  title: string;
  body: string;
  level: "expired" | "today" | "soon";
  productId: string;
}

export function computeAlerts(
  products: Product[],
  settings: AlertSettings,
): DueAlert[] {
  const thresholds = [...settings.days].sort((a, b) => a - b);
  const out: DueAlert[] = [];

  for (const product of products) {
    if (product.quantity <= 0) continue;
    const days = daysUntil(product.expiresAt);
    const qty = product.quantity === 1 ? "1 unidad" : `${product.quantity} unidades`;

    if (days < 0) {
      out.push({
        id: `${product.id}:expired`,
        title: "Producto vencido",
        body: `${product.name} venció hace ${Math.abs(days)} día(s) · ${qty}`,
        level: "expired",
        productId: product.id,
      });
      continue;
    }
    if (days === 0) {
      out.push({
        id: `${product.id}:0`,
        title: "Vence hoy",
        body: `${product.name} · ${qty} · ${product.location}`,
        level: "today",
        productId: product.id,
      });
      continue;
    }
    if (thresholds.includes(days) || (days > 0 && days <= Math.min(...thresholds))) {
      const match = thresholds.find((t) => t === days) ?? Math.min(...thresholds);
      if (days <= match) {
        out.push({
          id: `${product.id}:${days}`,
          title: days === 1 ? "Vence mañana" : `Vence en ${days} días`,
          body: `${product.name} · ${qty}`,
          level: "soon",
          productId: product.id,
        });
      }
    }
  }
  return out;
}

export function buildDailySummary(products: Product[], storeName: string): string {
  const expired = products.filter((p) => daysUntil(p.expiresAt) < 0 && p.quantity > 0);
  const today = products.filter((p) => daysUntil(p.expiresAt) === 0 && p.quantity > 0);
  const week = products.filter((p) => {
    const d = daysUntil(p.expiresAt);
    return d > 0 && d <= 7 && p.quantity > 0;
  });
  const lines = [
    `Resumen Vigía — ${storeName}`,
    "",
    `Vencidos: ${expired.length}`,
    ...expired.map((p) => `· ${p.name} (${p.quantity})`),
    "",
    `Vencen hoy: ${today.length}`,
    ...today.map((p) => `· ${p.name} (${p.quantity})`),
    "",
    `Esta semana: ${week.length}`,
    ...week.map((p) => `· ${p.name} — ${daysUntil(p.expiresAt)} días`),
  ];
  return lines.join("\n");
}

export async function persistAlertSnapshot(alerts: DueAlert[]): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(ALERTS_CACHE);
    await cache.put(
      ALERTS_URL,
      new Response(JSON.stringify({ alerts, savedAt: Date.now() }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    /* ignore */
  }
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw-vigia.js");
  } catch {
    return null;
  }
}

export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    window.setTimeout(() => void ctx.close(), 300);
  } catch {
    /* ignore */
  }
}

export async function dispatchAlerts(
  alerts: DueAlert[],
  settings: AlertSettings,
  options: { viaNotification?: boolean } = {},
): Promise<void> {
  if (!alerts.length) return;
  if (settings.sound) beep();
  if (settings.vibration && navigator.vibrate) navigator.vibrate([40, 30, 40]);

  if (!options.viaNotification) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const expired = alerts.filter((a) => a.level === "expired");
  const rest = alerts.filter((a) => a.level !== "expired");
  const title = expired.length
    ? `${expired.length} producto(s) vencido(s)`
    : `${alerts.length} aviso(s) de vencimiento`;
  const body =
    rest[0]?.body ??
    expired[0]?.body ??
    "Abre Vigía para revisar el inventario.";

  const reg = await navigator.serviceWorker.getRegistration("/sw-vigia.js");
  if (reg) {
    await reg.showNotification(title, {
      body,
      tag: "vigia-digest",
      icon: "/icon-192.png",
    });
  } else {
    new Notification(title, { body, tag: "vigia-digest" });
  }
}

export async function registerPeriodicSync(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/sw-vigia.js");
  if (!reg) return;
  const periodic = (
    reg as ServiceWorkerRegistration & {
      periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
    }
  ).periodicSync;
  if (!periodic) return;
  try {
    await periodic.register("vigia-expiry-check", {
      minInterval: 12 * 60 * 60 * 1000,
    });
  } catch {
    /* not installed / no permission */
  }
}
