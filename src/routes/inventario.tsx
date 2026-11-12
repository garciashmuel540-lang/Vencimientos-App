import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage } from "@/components/pages/inventory-page";
import type { ProductStatus } from "@/lib/vigia/types";

export const Route = createFileRoute("/inventario")({
  validateSearch: ({ estado }: Record<string, unknown>): { estado?: ProductStatus } =>
    estado === "ok" || estado === "soon" || estado === "expired" ? { estado } : {},
  component: InventoryPage,
});
