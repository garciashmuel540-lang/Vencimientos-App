import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage } from "@/components/pages/inventory-page";

export const Route = createFileRoute("/inventario")({ component: InventoryPage });
