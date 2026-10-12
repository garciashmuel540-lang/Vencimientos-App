/**
 * Cliente para gestionar usuarios vía Edge Function admin-users.
 */
import { supabase } from "@/lib/supabase";

export interface AdminUser {
  id: string;
  email: string | null;
  role: string;
  created_at?: string;
  last_sign_in_at?: string | null;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  role: "admin" | "employee";
}

const FUNCTIONS_URL =
  "https://mmmidsrtuilctckqzrij.supabase.co/functions/v1/admin-users";

async function callAdminFunction<T>(
  body: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("No hay sesión activa");

  const res = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? `Error ${res.status}`);
  }
  return json as T;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const result = await callAdminFunction<{ users: AdminUser[] }>({
    action: "list",
  });
  return result.users ?? [];
}

export async function createAdminUser(
  payload: CreateUserPayload,
): Promise<AdminUser> {
  const result = await callAdminFunction<{ user: AdminUser }>({
    action: "create",
    email: payload.email,
    password: payload.password,
    role: payload.role,
  });
  return result.user;
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await callAdminFunction<{ ok: boolean }>({
    action: "delete",
    userId,
  });
}

export async function setAdminUserRole(
  userId: string,
  role: "admin" | "employee",
): Promise<void> {
  await callAdminFunction<{ ok: boolean }>({
    action: "setRole",
    userId,
    role,
  });
}
