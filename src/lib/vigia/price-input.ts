type Prices = { price?: number; priceC?: number; cost?: number };

export function editPrices(prices: Prices) {
  return {
    price: String(prices.price ?? ""),
    priceC: String(prices.priceC ?? ""),
    cost: String(prices.cost ?? ""),
  };
}

export function readPrices(fields: ReturnType<typeof editPrices>): Prices {
  const result: Prices = {};
  for (const key of ["price", "priceC", "cost"] as const) {
    const text = fields[key].trim().replace(",", ".");
    if (!text) continue;
    const value = Number(text);
    if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(text) || !Number.isFinite(value)) {
      throw new Error("Ingresá un precio positivo o cero, con hasta dos decimales.");
    }
    result[key] = value;
  }
  return result;
}
