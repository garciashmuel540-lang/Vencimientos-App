/**
 * Script de generación de embeddings para el catálogo.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    const content = readFileSync(".env.local", "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && value) process.env[key] = value;
    }
    console.log("✅ .env.local cargado");
  } catch (err) {
    console.error("⚠️ No se pudo leer .env.local:", err.message);
    process.exit(1);
  }
}

loadEnv();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ Faltan variables en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BATCH_SIZE = 50;
const MODEL = "gemini-embedding-001";

function productToText(p) {
  const parts = [p.name];
  if (p.brand) parts.push(p.brand);
  if (p.presentation) parts.push(p.presentation);
  if (p.category) parts.push(p.category);
  if (p.department) parts.push(p.department);
  return parts.filter(Boolean).join(" · ");
}

async function embedBatch(texts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;
  const requests = texts.map((text) => ({
    model: `models/${MODEL}`,
    content: { parts: [{ text }] },
    outputDimensionality: 768,
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google API ${res.status}: ${errText}`);
  }
  const json = await res.json();
  return json.embeddings.map((e) => e.values);
}

async function main() {
  console.log("🚀 Iniciando generación de embeddings...\n");
  console.log("📥 Leyendo catálogo...");
  const PAGE = 1000;
  let all = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from("catalog")
      .select("barcode, name, brand, presentation, category, department")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("❌ Error leyendo catálogo:", error.message);
      process.exit(1);
    }
    const page = data ?? [];
    all = all.concat(page);
    if (page.length < PAGE) hasMore = false;
    else from += PAGE;
  }
  console.log(`✅ ${all.length} productos leídos.\n`);

  console.log("🔍 Verificando embeddings existentes...");
  const { data: existing } = await supabase
    .from("catalog_embeddings")
    .select("barcode");
  const existingSet = new Set((existing ?? []).map((e) => e.barcode));
  console.log(`✅ ${existingSet.size} ya tienen embedding.\n`);

  const pendientes = all.filter((p) => !existingSet.has(p.barcode));
  console.log(`📊 ${pendientes.length} productos por procesar.\n`);

  if (pendientes.length === 0) {
    console.log("🎉 ¡Todo ya está procesado!");
    return;
  }

  let procesados = 0;
  let errores = 0;
  const startTime = Date.now();

  for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
    const batch = pendientes.slice(i, i + BATCH_SIZE);
    const texts = batch.map(productToText);
    try {
      const embeddings = await embedBatch(texts);
      const rows = batch.map((p, idx) => ({
        barcode: p.barcode,
        embedding: embeddings[idx],
        content: texts[idx],
      }));
      const { error } = await supabase
        .from("catalog_embeddings")
        .upsert(rows, { onConflict: "barcode" });
      if (error) throw new Error(error.message);
      procesados += batch.length;
      const pct = ((procesados / pendientes.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`✅ ${procesados}/${pendientes.length} (${pct}%) - ${elapsed}s`);
      // Delay para no exceder cuota (100 req/min)
      await new Promise((r) => setTimeout(r, 5000));
    } catch (err) {
      console.error(`❌ Error en batch ${i}:`, err.message.slice(0, 200));
      if (err.message.includes("429")) {
        // Extraer retryDelay del mensaje
        const retryMatch = err.message.match(/"retryDelay":\s*"(\d+)s"/);
        const waitSec = retryMatch ? parseInt(retryMatch[1]) + 5 : 65;
        console.log(`⏳ Cuota alcanzada, esperando ${waitSec}s y reintentando...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        // Reintentar el mismo batch (no incrementar errores)
        i -= BATCH_SIZE;
        continue;
      }
      // Otros errores: contar y seguir
      errores += batch.length;
    }
  }

  console.log("\n============================================");
  console.log(`✅ Procesados: ${procesados}`);
  console.log(`❌ Errores: ${errores}`);
  console.log(`⏱️ Tiempo: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  console.log("============================================");
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
