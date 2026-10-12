/**
 * Utilidades para manejar usuarios con o sin dominio.
 * Si el input no tiene @, se le agrega @vigia.local.
 */

export const VIGIA_DOMAIN = "@vigia.local";

/**
 * Convierte un input de usuario a un email válido.
 * - "slopez" → "slopez@vigia.local"
 * - "slopez@tutienda.com" → "slopez@tutienda.com"
 */
export function toEmail(input: string): string {
  const clean = input.trim().toLowerCase();
  if (!clean) return "";
  if (clean.includes("@")) return clean;
  return clean + VIGIA_DOMAIN;
}

/**
 * Convierte un email a su forma "corta" para mostrar.
 * - "slopez@vigia.local" → "slopez"
 * - "adri@p.com" → "adri@p.com" (email real, se muestra completo)
 */
export function toShortEmail(email: string | null | undefined): string {
  if (!email) return "usuario";
  if (email.endsWith(VIGIA_DOMAIN)) {
    return email.slice(0, -VIGIA_DOMAIN.length);
  }
  return email;
}

/**
 * Detecta si un email es un "usuario interno" (@vigia.local).
 */
export function isInternalEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith(VIGIA_DOMAIN));
}
