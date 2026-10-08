import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
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
import { productStatus } from "@/lib/vigia/dates";
import { askVigiaFn, type ChatProduct } from "@/lib/vigia/ai-chat";
import type { Product, ProductCategory, StoreLocation } from "@/lib/vigia/types";
import { useChatFocus } from "@/lib/vigia/chat-focus";
import { cn } from "@/lib/utils";

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

export function ChatIA() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    name: string;
    args: Record<string, unknown>;
    label: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const focus = useChatFocus((s) => s.focused);
  const autoOpen = useChatFocus((s) => s.autoOpen);
  const clearFocus = useChatFocus((s) => s.clear);
  const products = useVigiaStore((s) => s.products);
  const settings = useVigiaStore((s) => s.settings);
  const soonWithin = Math.max(...settings.days, 30);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Auto-abrir cuando se enfoca un producto desde ProductSheet
  useEffect(() => {
    if (autoOpen && focus) {
      setOpen(true);
      setMessages([
        {
          role: "model",
          text: `Pregúntame sobre **${focus.name}** (${focus.quantity} u., vence ${focus.expiresAt}).`,
        },
      ]);
    }
  }, [autoOpen, focus]);

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

      // Extraer palabras clave del mensaje (>= 3 letras)
      const keywords = q
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

      const catalogMatches = await useVigiaStore
        .getState()
        .searchCatalog(keywords);

      const stream = await askVigiaFn({
        data: {
          storeName: settings.storeName,
          today,
          products: chatProducts,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          question: q,
          catalogMatches,
          focusedProduct: focus
            ? {
                name: focus.name,
                quantity: focus.quantity,
                expiresAt: focus.expiresAt,
                status: productStatus(focus, soonWithin),
                category: focus.category,
                brand: focus.brand,
              }
            : undefined,
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
              onClick={() => {
                setOpen(false);
                clearFocus();
              }}
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
