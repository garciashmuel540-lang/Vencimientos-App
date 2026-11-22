import { createFileRoute } from "@tanstack/react-router";
import { StorePage } from "@/components/pages/store-page";

export const Route = createFileRoute("/tienda")({ component: StorePage });
