/**
 * Hook de sesión con Supabase Auth.
 * Coexiste con better-auth (que se usa para la plataforma de preview).
 */
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface SupabaseUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  isAdmin: boolean;
}

export function useSupabaseAuth() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setUser(toUser(data.session?.user));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session?.user));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

function toUser(u: User | undefined | null): SupabaseUser | null {
  if (!u) return null;
  const role = (u.user_metadata?.role as string | undefined) ?? null;
  return {
    id: u.id,
    email: u.email ?? null,
    name: (u.user_metadata?.name as string | undefined) ?? null,
    role,
    isAdmin: role === "admin",
  };
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error("Supabase no está configurado");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOutSupabase() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
