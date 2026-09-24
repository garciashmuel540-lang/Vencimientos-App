import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { useVigiaStore } from "@/lib/vigia/store";
import { productStatus } from "@/lib/vigia/dates";
import { askVigiaFn, type ChatProduct } from "@/lib/vigia/ai-chat";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "model";
  text: string;
}

const SUGGESTIONS = [
  "¿Qué se vence esta semana?",
  "¿Qué hago con los vencidos?",
  "¿Tengo leche?",
  "Dame un resumen del inventario",
];

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

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    const userMsg: Message = { role: "user", text: q };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    // Creamos un mensaje vacío del modelo donde iremos escribiendo
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

      // Consumimos el stream y actualizamos el último mensaje
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "model") {
              updated[updated.length - 1] = {
                ...last,
                text: last.text + value,
              };
            }
            return updated;
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setMessages((prev) => [
        ...prev,
        { role: "model", text: `⚠️ ${msg}` },
      ]);
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
                Pregunta por tu inventario
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
                  Hola 👋 Soy tu asistente. Puedo revisar tu inventario,
                  buscar productos y sugerirte qué hacer con los vencidos.
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
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
              placeholder="Escribe tu pregunta…"
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