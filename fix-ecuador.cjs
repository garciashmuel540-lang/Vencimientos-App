const fs = require('fs');
const p = 'src/lib/vigia/barcode-api.ts';
let c = fs.readFileSync(p, 'utf8');

// Nueva función: Open Products Facts (productos generales de todo el mundo)
const marker = 'export const lookupBarcodeFn';

const nuevaFuncion = `async function fetchOpenProductsFacts(barcode: string): Promise<LookupResult | null> {
  const res = await fetch(
    \`https://world.openproductsfacts.org/api/v2/product/\${encodeURIComponent(barcode)}.json\`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
      },
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { status?: number; product?: OffProduct };
  if (json.status !== 1 || !json.product) return null;
  const p = json.product;
  const name =
    p.product_name_es?.trim() ||
    p.product_name?.trim() ||
    p.generic_name?.trim() ||
    "";
  if (!name) return null;
  const blob = \`\${name} \${p.brands ?? ""} \${p.categories ?? ""}\`;
  return {
    barcode,
    name,
    brand: (p.brands ?? "").split(",")[0]?.trim() ?? "",
    presentation: p.quantity ?? "",
    category: guessCategory(blob),
    image: p.image_front_small_url || p.image_url || null,
    source: "openproductsfacts",
    found: true,
    sourcesTried: ["openproductsfacts"],
  };
}

`;

if (!c.includes('fetchOpenProductsFacts')) {
  c = c.replace(marker, nuevaFuncion + marker);
  console.log('✅ Función fetchOpenProductsFacts agregada');
}

// Actualizar Promise.allSettled
const oldSettled = `const settled = await Promise.allSettled([
      fetchOpenFoodFacts(barcode),
      fetchUpcItemDb(barcode),
      fetchOpenBeautyFacts(barcode),
    ]);`;

const newSettled = `const settled = await Promise.allSettled([
      fetchOpenFoodFacts(barcode),
      fetchUpcItemDb(barcode),
      fetchOpenBeautyFacts(barcode),
      fetchOpenProductsFacts(barcode),
    ]);`;

if (c.includes(oldSettled)) {
  c = c.replace(oldSettled, newSettled);
  console.log('✅ Promise.allSettled actualizado (4 fuentes)');
}

// Actualizar sourcesTried
c = c.replace(
  'const sourcesTried = ["openfoodfacts", "upcitemdb", "openbeautyfacts"];',
  'const sourcesTried = ["openfoodfacts", "upcitemdb", "openbeautyfacts", "openproductsfacts"];'
);

// Actualizar lógica de selección
const oldPicked = `const beauty = settled[2].status === "fulfilled" ? settled[2].value : null;
    const picked = off ?? upc ?? beauty;`;

const newPicked = `const beauty = settled[2].status === "fulfilled" ? settled[2].value : null;
    const products = settled[3].status === "fulfilled" ? settled[3].value : null;
    const picked = off ?? upc ?? beauty ?? products;`;

if (c.includes(oldPicked)) {
  c = c.replace(oldPicked, newPicked);
  console.log('✅ Lógica de selección actualizada (4 fuentes)');
}

fs.writeFileSync(p, c);
console.log('🎉 Cambios aplicados');
