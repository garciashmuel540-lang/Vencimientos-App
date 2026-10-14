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
  html,body{margin:0;background:#23483C;min-height:100%}
  #vigia-boot{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#23483C;transition:opacity .35s ease}
  #vigia-boot.done{opacity:0;pointer-events:none}
  @keyframes boot-pop {
    0% { transform: scale(0); opacity: 0; }
    60% { transform: scale(1.08); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes boot-leaf {
    0% { transform: scale(0) rotate(-45deg); opacity: 0; }
    60% { transform: scale(1.15) rotate(5deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes boot-stem {
    0% { transform: scaleY(0); opacity: 0; }
    100% { transform: scaleY(1); opacity: 1; }
  }
  @keyframes boot-check {
    0% { stroke-dashoffset: 200; opacity: 0; }
    100% { stroke-dashoffset: 0; opacity: 1; }
  }
  @keyframes boot-fade-up {
    0% { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  #vigia-boot .v-circle {
    transform-origin: 100px 115px;
    animation: boot-pop 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
  }
  #vigia-boot .v-leaf {
    transform-origin: 108px 45px;
    animation: boot-leaf 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.9s both;
  }
  #vigia-boot .v-stem {
    transform-origin: 100px 50px;
    animation: boot-stem 0.5s ease-out 1.5s both;
  }
  #vigia-boot .v-check {
    stroke-dasharray: 200;
    animation: boot-check 0.8s ease-out 1.8s both;
  }
  #vigia-boot .v-text {
    animation: boot-fade-up 0.5s ease-out 2.2s both;
    margin: 16px 0 0;
    font-family: Fraunces, Georgia, serif;
    font-size: 2rem;
    font-weight: 600;
    color: #F3EFE6;
  }
</style>
<div id="vigia-boot" aria-hidden="true">
  <svg viewBox="0 0 200 200" width="140" height="140" style="filter: drop-shadow(0 8px 24px rgba(0,0,0,.25))">
    <circle class="v-circle" cx="100" cy="115" r="70" fill="#F57C1F"/>
    <path class="v-check" d="M 65 115 L 90 140 L 135 90" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path class="v-stem" d="M 100 50 Q 95 35 105 25" stroke="#3D2817" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path class="v-leaf" d="M 108 45 Q 145 30 160 50 Q 135 65 108 55 Z" fill="#6BBE45"/>
  </svg>
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
      { name: "theme-color", content: "#23483c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
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
      <body className="antialiased" style={{ backgroundColor: "#23483C", margin: 0 }}>
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
