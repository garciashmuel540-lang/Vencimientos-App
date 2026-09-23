# Vigía — control de vencimientos

Aplicación web progresiva para tiendas de conveniencia, minimarkets y bodegas.
Escanea códigos de barras, registra la fecha de caducidad y recibe avisos antes
de que el producto se venza. Todo se guarda en el dispositivo (IndexedDB).

## Cómo usarla

1. Abre la app en el celular (Chrome o Safari).
2. Sigue el tour de un minuto.
3. Pulsa el botón central para escanear. Si la cámara no está disponible, escribe el código o usa un ejemplo.
4. Completa la fecha de vencimiento y guarda.
5. En **Ajustes** elige con cuántos días de anticipación quieres el aviso.

## Despliegue

Es un proyecto TanStack Start. Tras `npm install`:

```bash
npm run dev      # desarrollo
npm run build    # producción
```

Publica el resultado en Vercel / Netlify. No hace falta base de datos ni
backend propio: las consultas a Open Food Facts y UPCitemdb salen de una
función de servidor incluida.

## Añadir otra API de productos

Edita `src/lib/vigia/barcode-api.ts`. Agrega un `fetchTuApi(barcode)` y
súmalo al `Promise.allSettled`. La fusión en `src/lib/vigia/lookup.ts` da
prioridad a Open Food Facts, luego UPCitemdb, luego el catálogo local.

## Limitación de notificaciones

Los navegadores no permiten programar avisos con la pestaña cerrada sin un
servicio de push. Vigía:

- muestra un banner al abrir
- pide permiso de Notification API
- registra un service worker (`public/sw-vigia.js`) con Periodic Background Sync cuando el sistema lo permite
- ofrece un resumen listo para WhatsApp o correo

## Archivos clave

| Ruta | Rol |
| --- | --- |
| `src/lib/vigia/barcode-api.ts` | consulta paralela a catálogos |
| `src/lib/vigia/db.ts` | IndexedDB (Dexie) |
| `src/lib/vigia/notifications.ts` | alertas |
| `src/components/scanner.tsx` | cámara html5-qrcode |
| `public/sw-vigia.js` | worker de avisos |
