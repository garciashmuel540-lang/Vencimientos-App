import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { SupabaseGuard } from "@/components/auth/supabase-guard";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppShell } from "@/components/app-shell";
import appCss from "../styles.css?url";

const APP_NAME = "Vigía";

const THEME_BOOT = `try{var t=localStorage.getItem("vigia-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

/** Splash visible desde el primer paint (antes de hidratar React). */
const BOOT_SPLASH = `
<style>
  #vigia-boot{position:fixed;inset:0;z-index:9999;display:grid;place-content:center;justify-items:center;background:var(--color-background,#fff9ef);color:var(--color-foreground,#503224);transition:opacity .2s ease}
  #vigia-boot.done{opacity:0;pointer-events:none}
  #vigia-boot p{margin:0;font:700 1.8rem system-ui}
</style>
<div id="vigia-boot" aria-hidden="true">
  <span style="font-size:4rem">🍊</span>
  <p class="v-text">Vigía</p>
</div>
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Control de vencimientos para tiendas de conveniencia. Escanea, registra y recibe avisos antes de que un producto caduque.",
      },
      { name: "theme-color", content: "#fff9ef" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192-green.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased" >
        <div dangerouslySetInnerHTML={{ __html: BOOT_SPLASH }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <PreviewHostBridge />
        <AuthProvider>
          <SupabaseGuard>
            <AppShell>
              <Outlet />
            </AppShell>
          </SupabaseGuard>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
