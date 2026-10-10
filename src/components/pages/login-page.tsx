import { useState, type FormEvent } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithEmail } from "@/lib/auth/supabase-auth";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Escribe tu email y contraseña.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      toast.success("Bienvenido a Vigía");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo iniciar sesión.";
      setError(
        msg.includes("Invalid login")
          ? "Email o contraseña incorrectos."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <img
            src="/icon-192.png"
            alt=""
            width={72}
            height={72}
            className="size-16 rounded-2xl shadow-md"
          />
          <h1
            className="font-display text-2xl font-medium tracking-tight"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Vigía
          </h1>
          <p className="text-sm text-muted-foreground">
            Inicia sesión para continuar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              disabled={loading}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              required
            />
          </div>

          {error ? (
            <p className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={loading}>
            {loading ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Entrando…
              </>
            ) : (
              <>
                <LogIn className="size-4" />
                Iniciar sesión
              </>
            )}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          ¿No tienes cuenta? Pídele al dueño que te invite.
        </p>
      </Card>
    </main>
  );
}
