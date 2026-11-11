import { readFile } from "node:fs/promises";
import pg from "pg";

// A project may also have a separate DATABASE_URL for its app builder.
// Apply this schema only to the same Supabase project used by the frontend.
const dsn = process.env.SUPABASE_RECOUNTS_DATABASE_URL || process.env.DATABASE_URL;
const apiUrl = process.env.VITE_SUPABASE_URL;
function matchesProject(dsn, apiUrl) {
  try {
    const db = new URL(dsn);
    const ref = /^([a-z0-9]+)\.supabase\.co$/.exec(new URL(apiUrl).hostname)?.[1];
    return Boolean(
      ref &&
      (db.hostname === `db.${ref}.supabase.co` ||
        (db.hostname.endsWith(".pooler.supabase.com") && db.username.endsWith(`.${ref}`))),
    );
  } catch {
    return false;
  }
}
if (process.env.VERCEL_ENV === "production" && dsn && apiUrl) {
  const sameProject = matchesProject(dsn, apiUrl);
  if (!sameProject) {
    console.log("[recounts] No matching Supabase database connection. Migration not applied.");
  } else {
    const client = new pg.Client({ connectionString: dsn, connectionTimeoutMillis: 10000 });
    try {
      await client.connect();
      const { rows } = await client.query(
        "select to_regclass('public.food_service_counts') is not null and to_regprocedure('auth.uid()') is not null as ready",
      );
      if (!rows[0].ready) throw new Error("Expected Supabase inventory schema not found");
      await client.query(
        await readFile(
          new URL("../supabase/migrations/20261111_vigia_recounts.sql", import.meta.url),
          "utf8",
        ),
      );
      console.log("[recounts] Supabase schema ready.");
    } catch (error) {
      console.warn(
        "[recounts] Supabase schema could not be applied.",
        typeof error?.code === "string" ? error.code : "",
      );
    } finally {
      await client.end().catch(() => {});
    }
  }
} else if (process.env.VERCEL_ENV === "production") {
  console.log("[recounts] No Supabase database connection configured.");
}
