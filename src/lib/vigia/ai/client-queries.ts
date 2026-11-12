import { listAdminUsers } from "@/lib/data/admin-users-supabase";
import { listCloudRecounts, listRecountItems } from "@/lib/data/recounts-supabase";
import { supabase } from "@/lib/supabase";
import { daysUntil, formatDate, productStatus } from "@/lib/vigia/dates";
import { getDb } from "@/lib/vigia/db";
import { compareRecount, quantity } from "@/lib/vigia/recounts";
import { useVigiaStore } from "@/lib/vigia/store";
import { LOCATION_LABEL } from "@/lib/vigia/types";
import { normalize } from "./context";
import { markdownTable } from "./markdown-table";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const limitOf = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(40, Math.floor(value)))
    : fallback;
const money = (value: number) => `C$ ${value.toFixed(2)}`;
const todayISO = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Managua",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const remaining = (total: number, shown: number) =>
  total > shown ? `\n\nMostrando ${shown} de ${total} resultados.` : "";

function matches(query: string, ...fields: (string | undefined)[]) {
  const source = normalize(fields.filter(Boolean).join(" "));
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .every((term) => source.includes(term));
}

export async function runSomQuery(name: string, args: Record<string, unknown>) {
  const { products, settings } = useVigiaStore.getState();
  const soonWithin = Math.max(...settings.days, 30);
  const today = todayISO();

  if (name === "estadisticas") {
    const expired = products.filter((p) => productStatus(p, soonWithin) === "expired").length;
    const soon = products.filter((p) => productStatus(p, soonWithin) === "soon").length;
    const units = products.reduce((total, p) => total + p.quantity, 0);
    const priced = products.filter((p) => typeof p.priceC === "number");
    const value = priced.reduce((total, p) => total + (p.priceC ?? 0) * p.quantity, 0);
    const rows: [string, string | number][] = [
      ["Registros", products.length],
      ["Unidades", units],
      ["Vencidos", expired],
      ["Por vencer", soon],
      ["Vigentes", products.length - expired - soon],
    ];
    if (priced.length)
      rows.push([`Valor con IVA (${priced.length} registros con precio)`, money(value)]);
    return `**${settings.storeName} · ${today}**\n\n${markdownTable(["Indicador", "Total"], rows)}`;
  }

  if (
    ["listarProductos", "buscarProducto", "contarProductos", "calcularFaltantes"].includes(name)
  ) {
    const query = text(args.query) || text(args.search);
    const status = text(args.status);
    const category = text(args.category);
    const location = text(args.location);
    const threshold = typeof args.threshold === "number" ? args.threshold : 3;
    const date = new Date(today + "T12:00:00");
    const list = products
      .filter((p) => {
        if (status && status !== "all" && productStatus(p, soonWithin) !== status) return false;
        if (category && normalize(p.category) !== normalize(category)) return false;
        if (location && normalize(p.location) !== normalize(location)) return false;
        const days = daysUntil(p.expiresAt, date);
        if (typeof args.fromDays === "number" && days < args.fromDays) return false;
        if (typeof args.toDays === "number" && days > args.toDays) return false;
        return (
          (name !== "calcularFaltantes" || p.quantity <= threshold) &&
          matches(query, p.name, p.brand, p.barcode, p.presentation)
        );
      })
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    if (name === "contarProductos") {
      return args.countUnits === true
        ? `**${list.reduce((sum, p) => sum + p.quantity, 0)} unidades** coinciden con esos filtros.`
        : `**${list.length} registros** coinciden con esos filtros.`;
    }
    if (!list.length) return "No encontré productos con esos filtros en el inventario.";
    const shown = list.slice(0, limitOf(args.limit, 12));
    return (
      markdownTable(
        ["Producto", "Unidades", "Vence", "Ubicación", "Código"],
        shown.map((p) => [
          p.name,
          p.quantity,
          formatDate(p.expiresAt),
          LOCATION_LABEL[p.location] ?? p.location,
          p.barcode || null,
        ]),
      ) + remaining(list.length, shown.length)
    );
  }

  if (name === "verPromociones") {
    const query = text(args.query);
    const barcode = text(args.barcode);
    const status = text(args.status);
    const list = (await getDb().promotions.toArray()).filter((p) => {
      const state =
        p.startDate && p.startDate > today
          ? "próxima"
          : p.endDate && p.endDate < today
            ? "vencida"
            : "activa";
      return (
        (!status || normalize(state) === normalize(status)) &&
        (!barcode || p.barcode === barcode) &&
        matches(query, p.name, p.barcode, p.category)
      );
    });
    if (!list.length) return "No encontré promociones con esos filtros.";
    const shown = list.slice(0, limitOf(args.limit, 10));
    return (
      shown
        .map(
          (p) =>
            `- **${p.name}** · ${money(p.priceNow)} antes ${money(p.priceBefore)}${p.endDate ? ` · hasta ${formatDate(p.endDate)}` : ""}`,
        )
        .join("\n") + remaining(list.length, shown.length)
    );
  }

  if (name === "verHistorial") {
    const action = text(args.action);
    const date = args.today === true ? today : text(args.date);
    const query = text(args.query);
    const list = (await getDb().history.orderBy("at").reverse().toArray()).filter(
      (entry) =>
        (!action || entry.action === action) &&
        (!date || entry.at.slice(0, 10) === date) &&
        matches(query, entry.name, entry.barcode),
    );
    if (!list.length) return "No encontré movimientos con esos filtros.";
    const labels = {
      created: "Registrado",
      updated: "Editado",
      consumed: "Vendido o usado",
      removed: "Quitado",
      expired: "Marcado vencido",
      price_changed: "Precio actualizado",
    };
    const shown = list.slice(0, limitOf(args.limit, 10));
    return (
      shown
        .map((entry) => `- ${entry.at.slice(0, 10)} · ${labels[entry.action]} · **${entry.name}**`)
        .join("\n") + remaining(list.length, shown.length)
    );
  }

  if (name === "verAjustes") {
    return `**${settings.storeName}**\n\n- Avisos de vencimiento: ${settings.days.join(", ")} días antes\n- Sonido: ${settings.sound ? "sí" : "no"} · vibración: ${settings.vibration ? "sí" : "no"}\n- Avisos al abrir: ${settings.notifyOnOpen ? "sí" : "no"}`;
  }

  if (name === "consultarRecuentos") {
    const user = (await supabase?.auth.getSession())?.data.session?.user;
    if (!user) return "Iniciá sesión para consultar tus recuentos.";
    const date = text(args.date);
    const title = text(args.title);
    const query = text(args.query);
    const status = text(args.status);
    if (!query && !status && args.latest !== true) {
      const docs = (await listCloudRecounts(user.id))?.filter(
        (doc) => (!date || doc.date === date) && matches(title, doc.title),
      );
      if (!docs) return "No pude abrir la lista de recuentos de la cuenta.";
      if (!docs.length) return "No encontré recuentos con esos filtros.";
      const shown = docs.slice(0, limitOf(args.limit, 10));
      return (
        markdownTable(
          ["Recuento", "Fecha", "Contados"],
          shown.map((doc) => [doc.title, doc.date, `${doc.measuredCount}/${doc.itemCount}`]),
        ) + remaining(docs.length, shown.length)
      );
    }
    const latest = args.latest === true && !title;
    const docs = (
      await listRecountItems(user.id, { date: date || undefined, limit: latest ? 1 : undefined })
    )
      .filter((doc) => (!date || doc.date === date) && matches(title, doc.title))
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
    if (!docs.length) return "No encontré recuentos con esos filtros.";
    const list = (args.latest === true ? docs.slice(0, 1) : docs).flatMap((doc) =>
      doc.items.flatMap((item) => {
        const result = compareRecount(item);
        if (
          (status && result.status !== status) ||
          !matches(query, item.name, item.code, item.category)
        )
          return [];
        return [
          [
            item.name,
            item.code || null,
            `${doc.title} (${doc.date})`,
            quantity(item.physical),
            quantity(item.system),
            result.label,
          ],
        ];
      }),
    );
    if (!list.length)
      return `Revisé ${args.latest === true ? `**${docs[0].title}** (${docs[0].date})` : "tus recuentos"} y no encontré ítems con esos filtros.`;
    const shown = list.slice(0, limitOf(args.limit, 12));
    return (
      markdownTable(["Producto", "Código", "Recuento", "Físico", "Sistema", "Resultado"], shown) +
      remaining(list.length, shown.length)
    );
  }

  if (name === "listarUsuarios") {
    const user = (await supabase?.auth.getUser())?.data.user;
    if (user?.user_metadata?.role !== "admin")
      return "La lista de usuarios está disponible para administradores.";
    const list = await listAdminUsers();
    return (
      `**${list.length} usuarios**\n\n` +
      list
        .slice(0, 20)
        .map((entry) => `- ${entry.email ?? "Usuario sin correo"} · ${entry.role}`)
        .join("\n") +
      remaining(list.length, Math.min(20, list.length))
    );
  }
}
