import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { useVigiaStore } from "@/lib/vigia/store";
import { productStatus } from "@/lib/vigia/dates";
import { askVigiaFn, type ChatProduct } from "@/lib/vigia/ai-chat";
import type { Product, ProductCategory, StoreLocation } from "@/lib/vigia/types";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "model";
  text: string;
}

const SUGGESTIONS = [
  "¿Qué se vence esta semana?",
  "Agrega una Coca-Cola que vence el 30/11/2026, 5 unidades",
  "Dame un resumen del inventario",
  "¿Qué hago con los vencidos?",
];

type ChatChunk =
  | { type: "text"; content: string }
  | { type: "action"; name: string; args: Record<string, unknown> }
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

export function ChatIA() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const products = useVigiaStore((s) => s.products);
  const settings = useVigiaStore((s) => s.settings);
  const soonWithin = Math.max(...settings.days, 30);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

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
      const today = new Date().toISOString().slice(0, 10);
      const chatProducts: ChatProduct[] = products
        .filter((p) => p.quantity > 0)
        .map((p) => ({
          name: p.name,
          quantity: p.quantity,
          expiresAt: p.expiresAt,
          status: productStatus(p, soonWithin),
          category: p.category,
        }));

      const stream = await askVigiaFn({
        data: {
          storeName: settings.storeName,
          today,
          products: chatProducts,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          question: q,
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
            const confirm = await runAction(chunk.name, chunk.args);
            appendToLastModel(`\n\n${confirm}`);
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
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir chat con IA"
          className="no-print fixed bottom-24 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          <MessageCircle className="size-5" />
        </button>
      )}
      {open && (
        <div className="no-print fixed inset-x-0 bottom-0 z-50 flex h-[80dvh] flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Asistente Vigía</p>
              <p className="text-xs text-muted-foreground">
                Pregunta o pídele acciones a tu inventario
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Cerrar chat"
            >
              <X className="size-5" />
            </Button>
          </header>
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hola 👋 Puedo revisar tu inventario, sugerirte qué hacer, y
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
            {messages.map((m, i) => (
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.text}
                  </ReactMarkdown>
                ) : (
                  m.text
                )}
              </div>
            ))}
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
        </div>
      )}
    </>
  );
}
