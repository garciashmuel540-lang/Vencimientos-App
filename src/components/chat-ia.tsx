import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import * as Dialog from "@radix-ui/react-dialog";
import { Send, X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useVigiaStore } from "@/lib/vigia/store";
import { supabase } from "@/lib/supabase";
import { listRecountItems } from "@/lib/data/recounts-supabase";
import { getDb } from "@/lib/vigia/db";
import { compareRecount, quantity } from "@/lib/vigia/recounts";
import { localIntent } from "@/lib/vigia/ai/local-intent";
import { runSomQuery } from "@/lib/vigia/ai/client-queries";
import { ranked, relevance } from "@/lib/vigia/ai/context";
import { productStatus, statusOf } from "@/lib/vigia/dates";
import { askVigiaFn, type ChatProduct } from "@/lib/vigia/ai-chat";
import type { Product, ProductCategory, StoreLocation } from "@/lib/vigia/types";
import { useChatFocus } from "@/lib/vigia/chat-focus";
import { cn } from "@/lib/utils";
import { FS_PRODUCTS } from "@/lib/vigia/food-service-catalog";
import { toShortEmail } from "@/lib/auth/user-utils";
import { searchCatalogRAG } from "@/lib/data/catalog-rag";
import {
  pullAllFSCounts,
  pushFSCount,
  todayISO,
  type FSCountRow,
} from "@/lib/data/food-service-supabase";
import { calcFSItem } from "@/lib/vigia/food-service-calc";

interface Message {
  role: "user" | "model";
  text: string;
}

const STOP_WORDS = new Set([
  "que", "como", "cual", "donde", "cuando", "porque",
  "para", "pero", "este", "esta", "esto", "esos", "esas",
  "los", "las", "del", "una", "unos", "unas", "con", "sin",
  "los", "las", "hay", "tiene", "vale", "cuesta",
  "agrega", "borra", "pon", "ponle", "dame", "quiero",
]);

const SUGGESTIONS = [
  "¿Qué se vence esta semana?",
  "Agrega una Coca-Cola que vence el 30/11/2026, 5 unidades",
  "Dame un resumen del inventario",
  "¿Qué hago con los vencidos?",
];

type ChatChunk =
  | { type: "text"; content: string }
  | {
      type: "action";
      name: string;
      args: Record<string, unknown>;
      requiresConfirmation?: boolean;
      confirmationLabel?: string;
    }
  | { type: "error"; content: string };

const CATEGORIES: ProductCategory[] = [
  "bebida", "lacteo", "snack", "panaderia", "carnes",
  "limpieza", "cuidado", "congelados", "enlatados", "otros",
];

function safeCategory(v: unknown): ProductCategory {
  const s = String(v ?? "").toLowerCase();
  return (CATEGORIES.find((c) => c === s) ?? "otros") as ProductCategory;
}

function safeLocation(v: unknown): StoreLocation {
  const s = String(v ?? "").toLowerCase();
  const opts: StoreLocation[] = ["estante", "nevera", "congelador", "bodega", "mostrador"];
  return (opts.find((o) => o === s) ?? "estante") as StoreLocation;
}

function isIsoDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function findMatches(products: Product[], query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  // Coincidencia exacta primero
  const exact = products.filter((p) => p.name.toLowerCase() === q);
  if (exact.length) return exact;
  // Luego parcial
  return products.filter(
    (p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q),
  );
}

function animateSomArrival(target: HTMLDivElement | null) {
  if (!target || !target.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const source = document.querySelector("#som-page-trigger svg")?.getBoundingClientRect();
  if (!source || source.bottom < 0 || source.top > window.innerHeight) return;
  const end = target.getBoundingClientRect();
  const dx = source.left + source.width / 2 - end.left - end.width / 2;
  const dy = source.top + source.height / 2 - end.top - end.height / 2;
  target.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${source.width / end.width})` },
    { transform: `translate(${dx * .45}px, ${dy * .57 - 12}px) scale(1.2) rotate(-7deg)`, offset: .48 },
    { transform: "none" }
  ], { duration: 440, easing: "cubic-bezier(.25,.72,.25,1)" });
}

export function ChatIA() {
  const open = useChatFocus((s) => s.autoOpen);
  const openChat = useChatFocus((s) => s.openChat);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    name: string;
    args: Record<string, unknown>;
    label: string;
  } | null>(null);
  const [fsCounts, setFsCounts] = useState<FSCountRow[]>([]);
  const [userEmails, setUserEmails] = useState<Map<string, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  const focus = useChatFocus((s) => s.focused);

  const clearFocus = useChatFocus((s) => s.clear);
  const products = useVigiaStore((s) => s.products);
  const settings = useVigiaStore((s) => s.settings);
  const soonWithin = Math.max(...settings.days, 30);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Cargar conteos de FS y mapa de emails al abrir el chat
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      try {
        const counts = await pullAllFSCounts();
        if (!cancelled) {
          console.info(`[chat-ia] FS counts cargados: ${counts.length}`);
          setFsCounts(counts);
        }

        const { supabase } = await import("@/lib/supabase");
        if (supabase) {
          const { data, error } = await supabase.rpc("get_user_emails");
          if (!error && Array.isArray(data)) {
            const map = new Map<string, string>();
            for (const row of data as { user_id: string; email: string }[]) {
              map.set(row.user_id, row.email);
            }
            if (!cancelled) {
              console.info(`[chat-ia] emails cargados: ${map.size}`);
              setUserEmails(map);
            }
          } else if (error) {
            console.warn("[chat-ia] RPC get_user_emails falló:", error.message);
          }
        }
      } catch (err) {
        console.warn("[chat-ia] no se pudieron cargar FS/emails:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Auto-abrir cuando se enfoca un producto desde ProductSheet
  useEffect(() => {
    if (open && focus) {
      setMessages([
        {
          role: "model",
          text: `Pregúntame sobre **${focus.name}** (${focus.quantity} u., vence ${focus.expiresAt}).`,
        },
      ]);
    }
  }, [open, focus]);

  function appendToLastModel(text: string) {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === "model") {
        updated[updated.length - 1] = { ...last, text: last.text + text };
      }
      return updated;
    });
  }

  async function runAction(name: string, args: Record<string, unknown>) {
    const local = await runSomQuery(name, args);
    if (local !== undefined) return local;
    const store = useVigiaStore.getState();

    // 1. AGREGAR
    if (name === "agregarProducto") {
      const productName = String(args.name ?? "").trim();
      const qty = Math.max(1, Math.round(Number(args.quantity) || 1));
      const expiresAt = isIsoDate(args.expiresAt)
        ? String(args.expiresAt)
        : new Date().toISOString().slice(0, 10);

      await store.upsertProduct({
        barcode: "",
        name: productName,
        brand: String(args.brand ?? "").trim(),
        presentation: "",
        category: safeCategory(args.category),
        expiresAt,
        quantity: qty,
        location: "estante",
        notes: "",
        image: null,
        source: "manual",
      });
      return `✅ Agregado: **${productName}** (${qty} u.), vence el ${expiresAt}.`;
    }

    // 2. ELIMINAR
    if (name === "eliminarProducto") {
      const query = String(args.name ?? "").trim();
      const matches = findMatches(store.products, query);
      if (matches.length === 0) {
        return `⚠️ No encontré **${query}** en tu inventario.`;
      }
      if (matches.length === 1) {
        const p = matches[0];
        await store.remove(p.id);
        return `✅ Eliminado: **${p.name}** (${p.quantity} u.).`;
      }
      const lista = matches
        .slice(0, 5)
        .map((p) => `**${p.name}** (${p.quantity} u.)`)
        .join(", ");
      return `🤔 Encontré varios productos: ${lista}. Dime el nombre exacto, por favor.`;
    }

    // 3. CONSUMIR
    if (name === "consumirProducto") {
      const query = String(args.name ?? "").trim();
      const amount = Math.max(1, Math.round(Number(args.amount) || 1));
      const matches = findMatches(store.products, query);
      if (matches.length === 0) {
        return `⚠️ No encontré **${query}** en tu inventario.`;
      }
      if (matches.length === 1) {
        const p = matches[0];
        await store.consume(p.id, amount);
        const next = p.quantity - amount;
        if (next <= 0) {
          return `✅ Se agotó **${p.name}** (quitadas ${amount} u.).`;
        }
        return `✅ Quedan **${next} u.** de **${p.name}** (quitadas ${amount}).`;
      }
      const lista = matches
        .slice(0, 5)
        .map((p) => `**${p.name}** (${p.quantity} u.)`)
        .join(", ");
      return `🤔 Encontré varios: ${lista}. Dime el nombre exacto.`;
    }

    // 4. ACTUALIZAR VENCIMIENTO
    if (name === "actualizarVencimiento") {
      const query = String(args.name ?? "").trim();
      const expiresAt = isIsoDate(args.expiresAt)
        ? String(args.expiresAt)
        : null;
      if (!expiresAt) {
        return "⚠️ No entendí la fecha. Usa formato YYYY-MM-DD.";
      }
      const matches = findMatches(store.products, query);
      if (matches.length === 0) {
        return `⚠️ No encontré **${query}** en tu inventario.`;
      }
      if (matches.length === 1) {
        const p = matches[0];
        await store.upsertProduct(
          {
            barcode: p.barcode,
            name: p.name,
            brand: p.brand,
            presentation: p.presentation,
            category: p.category,
            expiresAt,
            quantity: p.quantity,
            location: p.location,
            notes: p.notes,
            image: p.image,
            source: p.source,
          },
          p.id,
        );
        return `✅ **${p.name}** ahora vence el ${expiresAt}.`;
      }
      const lista = matches
        .slice(0, 5)
        .map((p) => `**${p.name}**`)
        .join(", ");
      return `🤔 Encontré varios: ${lista}. Dime el nombre exacto.`;
    }

    // 5. ACTUALIZAR PRECIO
    if (name === "actualizarPrecio") {
      const query = String(args.name ?? "").trim();
      const price = typeof args.price === "number" ? args.price : undefined;
      const priceC = typeof args.priceC === "number" ? args.priceC : undefined;
      const cost = typeof args.cost === "number" ? args.cost : undefined;

      if (price == null && priceC == null && cost == null) {
        return "⚠️ Necesito saber qué precio actualizar (venta, mayoreo o costo).";
      }

      const cambios: string[] = [];
      if (price != null) cambios.push(`venta → C$ ${price.toFixed(2)}`);
      if (priceC != null) cambios.push(`mayoreo → C$ ${priceC.toFixed(2)}`);
      if (cost != null) cambios.push(`costo → C$ ${cost.toFixed(2)}`);
      const cambiosTxt = cambios.join(", ");

      // 1. Buscar en inventario
      const matches = findMatches(store.products, query);
      if (matches.length === 1) {
        const p = matches[0];
        await store.updatePrices(p.barcode, { price, priceC, cost });
        return `✅ **${p.name}**: ${cambiosTxt}.`;
      }
      if (matches.length > 1) {
        const lista = matches
          .slice(0, 5)
          .map((p) => `**${p.name}**`)
          .join(", ");
        return `🤔 Encontré varios en tu inventario: ${lista}. Dime el nombre exacto.`;
      }

      // 2. Si no está en inventario, buscar en catálogo
      const catalogMatches = await store.findCatalogMatches(query);
      if (catalogMatches.length === 0) {
        return `⚠️ No encontré **${query}** en tu inventario ni en el catálogo. Prueba con el nombre exacto o escanea el código.`;
      }
      if (catalogMatches.length > 1) {
        const lista = catalogMatches
          .slice(0, 5)
          .map((e) => `**${e.name}**${e.brand ? ` (${e.brand})` : ""}`)
          .join(", ");
        return `🤔 Encontré varios en el catálogo: ${lista}. Dime el nombre exacto.`;
      }

      const entry = catalogMatches[0];
      await store.updatePrices(entry.barcode, { price, priceC, cost });
      return `✅ **${entry.name}**${entry.brand ? ` (${entry.brand})` : ""} *(del catálogo)*: ${cambiosTxt}.`;
    }

    // 6. BUSCAR EN CATÁLOGO (solo consulta, no modifica)
    if (name === "buscarCatalogo") {
      const query = String(args.query ?? "").trim();
      if (!query) {
        return "⚠️ No entendí qué producto buscar.";
      }

      const keywords = query
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

      const results = await useVigiaStore.getState().searchCatalog(keywords);

      if (results.length === 0) {
        return `⚠️ No encontré "${query}" en el catálogo. Prueba con otro nombre.`;
      }

      const lineas = results
        .slice(0, 8)
        .map((r) => {
          // priceC es el precio CON IVA (al público). price es SIN IVA.
          const conIva =
            typeof r.priceC === "number"
              ? `C$ ${r.priceC.toFixed(2)}`
              : null;
          const sinIva =
            typeof r.price === "number"
              ? `C$ ${r.price.toFixed(2)}`
              : null;
          let priceTxt: string;
          if (conIva && sinIva) {
            priceTxt = `${conIva} con IVA (${sinIva} sin IVA)`;
          } else if (conIva) {
            priceTxt = `${conIva} con IVA`;
          } else if (sinIva) {
            priceTxt = `${sinIva} sin IVA`;
          } else {
            priceTxt = "sin precio";
          }
          return `- **${r.name}**${r.brand ? ` (${r.brand})` : ""}: ${priceTxt}`;
        })
        .join("\n");

      return `📋 Encontré ${results.length} producto(s) en el catálogo:\n${lineas}`;
    }

    // 7. FOOD SERVICE: consultar último conteo de un producto
    if (name === "consultarFS") {
      const query = String(args.productName ?? args.name ?? "").trim();
      if (!query) {
        return "⚠️ Necesito el nombre del producto de Food Service.";
      }
      const q = query.toLowerCase();
      const exact = FS_PRODUCTS.filter((p) => p.name.toLowerCase() === q);
      const matches = exact.length > 0
        ? exact
        : FS_PRODUCTS.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.code.toLowerCase().includes(q),
          );

      if (matches.length === 0) {
        return `⚠️ No encontré "${query}" en el catálogo de Food Service.`;
      }
      if (matches.length > 1) {
        const lista = matches
          .slice(0, 5)
          .map((p) => `**${p.name}**`)
          .join(", ");
        return `🤔 Encontré varios productos FS: ${lista}. Dime el nombre exacto.`;
      }

      const product = matches[0];
      const productCounts = fsCounts
        .filter((c) => c.product_code === product.code)
        .sort((a, b) => (b.count_date ?? "").localeCompare(a.count_date ?? ""));

      if (productCounts.length === 0) {
        return `📋 No tengo conteos guardados de **${product.name}** todavía.`;
      }

      // Agrupar por usuario
      const byUser = new Map<string, typeof productCounts>();
      for (const c of productCounts) {
        const uid = c.user_id ?? "unknown";
        const arr = byUser.get(uid) ?? [];
        arr.push(c);
        byUser.set(uid, arr);
      }

      if (byUser.size === 1) {
        // Solo un usuario: formato simple
        const last = productCounts[0];
        const calc = calcFSItem(product, {
          opened: last.opened,
          sealed: last.sealed,
          system_qty: last.system_qty,
        });
        return `📋 Último conteo de **${product.name}** (${last.count_date}):
- Abiertos: ${last.opened ?? "-"} · Sellados: ${last.sealed ?? "-"} · Sistema: ${last.system_qty ?? "-"}
- Producción: ${calc.production} · Inventario: ${calc.inventory}
- Resultado: **${calc.label}**`;
      }

      // Múltiples usuarios: mostrar por usuario
      const lines: string[] = [];
      lines.push(`📋 Conteos de **${product.name}** (por usuario):`);
      for (const [uid, counts] of byUser) {
        const email = userEmails.get(uid) ?? uid;
        lines.push(`\n👤 **${email}**:`);
        for (const c of counts) {
          const calc = calcFSItem(product, {
            opened: c.opened,
            sealed: c.sealed,
            system_qty: c.system_qty,
          });
          lines.push(
            `- ${c.count_date}: ab=${c.opened ?? "-"} · se=${c.sealed ?? "-"} · sis=${c.system_qty ?? "-"} → **${calc.label}**`,
          );
        }
      }
      return lines.join("\n");
    }

    // 8. FOOD SERVICE: listar conteos del día (o de una fecha)
    if (name === "listarFS") {
      const date = typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
        ? args.date
        : todayISO();

      const dayCounts = fsCounts.filter((c) => c.count_date === date);
      if (dayCounts.length === 0) {
        return `📋 No tengo conteos guardados del **${date}**.`;
      }

      const renderCount = (c: typeof dayCounts[0]) => {
        const product = FS_PRODUCTS.find((p) => p.code === c.product_code);
        if (!product) {
          return `- ${c.product_name}: ${c.opened ?? "-"} / ${c.sealed ?? "-"} / ${c.system_qty ?? "-"}`;
        }
        const calc = calcFSItem(product, {
          opened: c.opened,
          sealed: c.sealed,
          system_qty: c.system_qty,
        });
        return `- **${c.product_name}**: ${calc.label}`;
      };

      // Agrupar por usuario
      const byUser = new Map<string, typeof dayCounts>();
      for (const c of dayCounts) {
        const uid = c.user_id ?? "unknown";
        const arr = byUser.get(uid) ?? [];
        arr.push(c);
        byUser.set(uid, arr);
      }

      const lines: string[] = [];
      if (byUser.size === 1) {
        const sorted = [...dayCounts].sort((a, b) =>
          a.product_name.localeCompare(b.product_name),
        );
        for (const c of sorted) lines.push(renderCount(c));
      } else {
        for (const [uid, counts] of byUser) {
          const email = userEmails.get(uid) ?? uid;
          lines.push(`\n👤 **${email}** (${counts.length} productos):`);
          const sorted = [...counts].sort((a, b) =>
            a.product_name.localeCompare(b.product_name),
          );
          for (const c of sorted) lines.push(renderCount(c));
        }
      }

      return `📋 Conteos del ${date} (${dayCounts.length} productos):\n${lines.join("\n")}`;
    }

    // 9. FOOD SERVICE: comparar entre usuarios (solo admin)
    if (name === "compararFS") {
      const date = typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
        ? args.date
        : todayISO();

      const dayCounts = fsCounts.filter((c) => c.count_date === date);
      if (dayCounts.length === 0) {
        return `📋 No hay conteos del **${date}** para comparar.`;
      }

      const byProduct = new Map<string, FSCountRow[]>();
      for (const c of dayCounts) {
        const list = byProduct.get(c.product_code) ?? [];
        list.push(c);
        byProduct.set(c.product_code, list);
      }

      const lines: string[] = [];
      lines.push(`📊 Comparativo de FS del ${date}:`);
      for (const [code, counts] of byProduct) {
        if (counts.length < 2) continue;
        const product = FS_PRODUCTS.find((p) => p.code === code);
        const productName = product ? product.name : code;
        lines.push(`\n**${productName}**:`);
        for (const c of counts) {
          const calc = product
            ? calcFSItem(product, { opened: c.opened, sealed: c.sealed, system_qty: c.system_qty })
            : null;
          lines.push(`- ${c.product_name}: ${calc ? calc.label : "sin datos"}`);
        }
      }
      if (lines.length === 1) {
        lines.push("(no hay productos con conteos de múltiples usuarios)");
      }
      return lines.join("\n");
    }

    // 10. FOOD SERVICE: guardar conteo
    if (name === "guardarFS") {
      const query = String(args.productName ?? args.name ?? "").trim();
      const opened = typeof args.opened === "number" ? args.opened : null;
      const sealed = typeof args.sealed === "number" ? args.sealed : null;
      const system = typeof args.system === "number" ? args.system : null;

      if (!query) {
        return "⚠️ Necesito el nombre del producto de Food Service.";
      }
      if (opened === null || sealed === null || system === null) {
        return "⚠️ Necesito los 3 valores: abiertos, sellados y sistema.";
      }

      // Buscar el producto FS por nombre (coincidencia parcial)
      const q = query.toLowerCase();
      const exact = FS_PRODUCTS.filter((p) => p.name.toLowerCase() === q);
      const matches = exact.length > 0
        ? exact
        : FS_PRODUCTS.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.code.toLowerCase().includes(q),
          );

      if (matches.length === 0) {
        return `⚠️ No encontré "${query}" en el catálogo de Food Service.`;
      }
      if (matches.length > 1) {
        const lista = matches
          .slice(0, 5)
          .map((p) => `**${p.name}**`)
          .join(", ");
        return `🤔 Encontré varios productos FS: ${lista}. Dime el nombre exacto.`;
      }

      const product = matches[0];
      const date = todayISO();

      try {
        const saved = await pushFSCount({
          product_code: product.code,
          product_name: product.name,
          category: product.category,
          unit: product.unit,
          container_weight: product.containerWeight,
          unit_weight: product.unitWeight,
          opened,
          sealed,
          system_qty: system,
          count_date: date,
        });

        // Actualizar el estado local (quitar el anterior del mismo producto/fecha)
        setFsCounts((prev) => {
          const filtered = prev.filter(
            (c) =>
              !(
                c.product_code === saved.product_code &&
                c.count_date === saved.count_date
              ),
          );
          return [...filtered, saved];
        });

        // Calcular para mostrar el resultado
        const calc = calcFSItem(product, {
          opened,
          sealed,
          system_qty: system,
        });

        return `✅ Guardado: **${product.name}**
- Abiertos: ${opened} · Sellados: ${sealed} · Sistema: ${system}
- Producción: ${calc.production} · Inventario: ${calc.inventory}
- Resultado: **${calc.label}**`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        return `⚠️ Error al guardar: ${msg}`;
      }
    }

    return `⚠️ Acción desconocida: ${name}`;
  }

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    const userMsg: Message = { role: "user", text: q };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setMessages([...nextMessages, { role: "model", text: "" }]);

    try {
      const direct = localIntent(q);
      if (direct?.reply) {
        appendToLastModel(direct.reply);
        return;
      }
      if (direct?.action) {
        appendToLastModel(await runAction(direct.action, direct.args));
        return;
      }
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!session) throw new Error("Iniciá sesión para consultar a Som.");
      const now = new Date();
      const localTime = { timeZone: "America/Managua" };
      const today = new Intl.DateTimeFormat("en-CA", {
        ...localTime, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(now);
      const dayOfWeek = new Intl.DateTimeFormat("es-NI", { ...localTime, weekday: "long" }).format(now);
      const keywords = q.toLowerCase().match(/[\p{L}\p{N}]+/gu)
        ?.filter((word) => word.length >= 3 && !STOP_WORDS.has(word)) ?? [];
      const previousQuestion = [...messages].reverse().find((message) => message.role === "user")?.text ?? "";
      const previousWords = previousQuestion.toLowerCase().match(/[\p{L}\p{N}]+/gu)
        ?.filter((word) => word.length >= 3 && !STOP_WORDS.has(word)) ?? [];
      const score = (...fields: (string | undefined)[]) =>
        relevance(keywords, ...fields) * 4 + relevance(previousWords, ...fields);
      const chatProducts: ChatProduct[] = [...products]
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
        .map(({ name, quantity, expiresAt, category, barcode, brand, location, price, priceC, notes }) => ({
          name, quantity, expiresAt, category, barcode, brand, location, price, priceC,
          notes: notes?.slice(0, 250),
          status: statusOf(expiresAt, soonWithin, new Date(today + "T12:00:00")),
        }));
      const stats = {
        totalProducts: chatProducts.length, totalUnits: 0, ok: 0, soon: 0, expired: 0,
        byCategory: {} as Record<string, number>,
      };
      for (const product of chatProducts) {
        stats.totalUnits += product.quantity;
        stats[product.status]++;
        const category = product.category ?? "otros";
        stats.byCategory[category] = (stats.byCategory[category] ?? 0) + product.quantity;
      }
      const sources = Promise.allSettled([
        pullAllFSCounts(),
        listRecountItems(session.user.id),
        getDb().promotions.toArray(),
        getDb().history.toArray(),
      ] as const);

      // 1) Intentar RAG primero (búsqueda semántica)
      let catalogMatches: import("@/lib/vigia/ai/types").CatalogMatch[] = [];
      try {
        const rag = await searchCatalogRAG(q, 8);
        catalogMatches = rag.results
          .filter((r) => r.name)
          .map((r) => ({
            barcode: r.barcode,
            name: r.name,
            brand: r.brand ?? "",
            price: typeof r.price === "number" ? r.price : undefined,
            priceC: typeof r.price_c === "number" ? r.price_c : undefined,
            category: r.category,
          }));
        if (catalogMatches.length > 0) {
          console.info(
            `[chat-ia] RAG devolvió ${catalogMatches.length} productos`,
          );
        }
      } catch (err) {
        console.warn("[chat-ia] RAG falló:", err);
      }

      // 2) Fallback a búsqueda por keyword si RAG no dio nada
      if (catalogMatches.length === 0) {
        console.info("[chat-ia] RAG vacío, usando keyword search");
        catalogMatches = await useVigiaStore.getState().searchCatalog(keywords).catch(() => []);
      }

      const [counts, recounts, promotions, history] = await sources;
      const unavailable = [
        counts.status === "rejected" ? "Food Service" : "",
        recounts.status === "rejected" ? "Recuentos" : "",
        promotions.status === "rejected" ? "Promociones" : "",
        history.status === "rejected" ? "Historial" : "",
      ].filter(Boolean);
      const fsRows = counts.status === "fulfilled" ? counts.value : fsCounts;
      if (counts.status === "fulfilled") setFsCounts(fsRows);
      const fsByCode = new Map(FS_PRODUCTS.map((product) => [product.code, product]));
      const dates = new Set(q.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []);
      if (/\bhoy\b/i.test(q)) dates.add(today);
      for (const match of q.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)) {
        dates.add(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
      }
      const dateScore = (date: string) => dates.has(date) ? 20 : 0;
      const fsCountsCtx = ranked(fsRows, (row) => dateScore(row.count_date) + score(
        row.product_name, row.product_code, row.category, fsByCode.get(row.product_code)?.itemCode,
      ), 60).map(({ product_code, product_name, category, unit, opened, sealed, system_qty, count_date, updated_at }) => {
        const product = fsByCode.get(product_code);
        const result = product ? calcFSItem(product, { opened, sealed, system_qty }) : null;
        const calculated = result && result.status !== "incompleto" ? result : null;
        return { product_code, product_name, category, unit, opened, sealed, system_qty, count_date, updated_at,
          inventory: calculated?.inventory, difference: calculated?.difference, status: result?.status };
      });
      const documents = recounts.status === "fulfilled" ? recounts.value : [];
      const rankedDocuments = ranked(documents, (doc) => dateScore(doc.date) + score(doc.title) +
        doc.items.reduce((best, item) => Math.max(best, score(item.name, item.code, item.category)), 0), 12);
      let remainingItems = 120;
      const recountContext = rankedDocuments.map(({ title, date, itemCount, measuredCount, items }) => {
        const selected = ranked(items, (item) => score(item.name, item.code, item.category),
          Math.min(remainingItems, 60));
        remainingItems -= selected.length;
        return { title, date, itemCount, measuredCount, items: selected.map((item) => {
          const result = compareRecount(item);
          return { name: item.name, code: item.code, category: item.category,
            system: quantity(item.system), physical: quantity(item.physical),
            difference: result.difference, status: result.status };
        }) };
      });
      const promoRows = promotions.status === "fulfilled" ? promotions.value : [];
      const promoStatus = (promo: Pick<(typeof promoRows)[number], "startDate" | "endDate">) =>
        promo.startDate && promo.startDate > today ? "próxima"
          : promo.endDate && promo.endDate < today ? "vencida" : "activa";
      const historyRows = [...(history.status === "fulfilled" ? history.value : useVigiaStore.getState().history)]
        .sort((a, b) => b.at.localeCompare(a.at));
      const stream = await askVigiaFn({
        data: {
          accessToken: session.access_token,
          context: {
            storeName: settings.storeName, today, nowISO: now.toISOString(), dayOfWeek, question: q,
            products: ranked(chatProducts, (p) => score(p.name, p.brand, p.barcode, p.category, p.location), 60),
            history: messages.filter((m) => m.text).slice(-12),
            catalogMatches,
            focusedProduct: focus ? {
              name: focus.name, quantity: focus.quantity, expiresAt: focus.expiresAt,
              status: productStatus(focus, soonWithin), category: focus.category, brand: focus.brand,
              barcode: focus.barcode, price: focus.price, priceC: focus.priceC, location: focus.location,
            } : undefined,
            fsProducts: FS_PRODUCTS.map(({ code, itemCode, name, category, unit, containerWeight, unitWeight }) =>
              ({ code, itemCode, name, category, unit, containerWeight, unitWeight })),
            fsCounts: fsCountsCtx,
            fsCountTotal: fsRows.length,
            recounts: recountContext,
            recountTotal: documents.length,
            promotions: ranked(promoRows, (promo) => score(promo.name, promo.barcode, promo.category, promoStatus(promo)) +
              (promoStatus(promo) === "activa" ? 1 : 0), 40)
              .map(({ name, barcode, priceBefore, priceNow, startDate, endDate, dynamic, observations }) =>
                ({ name, barcode, priceBefore, priceNow, startDate, endDate, dynamic, observations: observations?.slice(0, 250),
                  status: promoStatus({ startDate, endDate }) })),
            promoTotal: promoRows.length,
            actionHistory: ranked(historyRows, (entry) => score(entry.name, entry.barcode, entry.action), 25)
              .map(({ action, name, barcode, at }) => ({ action, name, barcode, at })),
            settings,
            stats,
            unavailable,
          },
        },
      });

      const reader = stream.getReader();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;

          let chunk: ChatChunk;
          try {
            chunk = JSON.parse(line) as ChatChunk;
          } catch {
            continue;
          }

          if (chunk.type === "text") {
            appendToLastModel(chunk.content);
          } else if (chunk.type === "error") {
            appendToLastModel(`⚠️ ${chunk.content}`);
          } else if (chunk.type === "action") {
            if (chunk.requiresConfirmation) {
              setPendingAction({
                name: chunk.name,
                args: chunk.args,
                label: chunk.confirmationLabel ?? "Confirmar acción",
              });
            } else {
              const confirm = await runAction(chunk.name, chunk.args);
              appendToLastModel(`\n\n${confirm}`);
            }
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      appendToLastModel(`⚠️ ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(next) => next ? openChat() : clearFocus()}>
        <Dialog.Portal>
          <Dialog.Overlay className="no-print fixed inset-0 z-50 bg-black/20" />
          <Dialog.Content aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              const trigger = document.getElementById("som-page-trigger");
              if (trigger) { event.preventDefault(); trigger.focus({ preventScroll: true }); }
            }} className="som-panel no-print fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[80dvh] max-w-xl flex-col rounded-t-2xl border border-border bg-card shadow-2xl">
          <header className="som-panel-heading flex items-center gap-3 rounded-t-2xl border-b border-border px-4 py-2">
            <div className="som-chat-avatar" ref={animateSomArrival}>
              <Mascot mood={loading ? "thinking" : "happy"} size={44} />
            </div>
            <Dialog.Title className="flex-1 text-lg font-bold">Som</Dialog.Title>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Cerrar conversación"><X className="size-5"/></Button></Dialog.Close>
          </header>
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  ¡Hola! Soy Som 🍊 Puedo revisar tu inventario, sugerirte qué hacer, y
                  agregar, eliminar o actualizar productos si me lo pides.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              const showCursor = loading && isLast && m.role === "model";
              return (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:pl-4 [&_li]:my-0.5 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border/50 [&_th]:bg-black/5 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1 [&_h1]:my-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:my-1 [&_h3]:text-sm [&_h3]:font-semibold",
                  )}
                >
                  {m.role === "model" ? (
                    <>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.text}
                      </ReactMarkdown>
                      {showCursor && (
                        <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-[vigia-cursor_1s_steps(2,start)_infinite] bg-foreground align-middle" />
                      )}
                    </>
                  ) : (
                    m.text
                  )}
                </div>
              );
            })}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Pensando…
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
            style={{
              paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
            }}
          >
            <input
              aria-label="Mensaje para Som"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta o pídele algo…"
              disabled={loading}
              className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !input.trim()}
              aria-label="Enviar"
            >
              <Send className="size-4" />
            </Button>
          </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog
        open={Boolean(pendingAction)}
        onOpenChange={(v) => {
          if (!v) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar acción</AlertDialogTitle>
            <AlertDialogDescription>
              El asistente quiere: <strong>{pendingAction?.label}</strong>
              <br />
              ¿Estás seguro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                appendToLastModel("\n\n❌ Acción cancelada.");
                setPendingAction(null);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const action = pendingAction;
                setPendingAction(null);
                if (!action) return;
                setLoading(true);
                try {
                  const result = await runAction(action.name, action.args);
                  appendToLastModel(`\n\n${result}`);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Error";
                  appendToLastModel(`\n\n⚠️ ${msg}`);
                } finally {
                  setLoading(false);
                }
              }}
            >
              Sí, ejecutar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
