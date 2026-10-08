import { createFileRoute } from "@tanstack/react-router";
import { PriceCheckPage } from "@/components/pages/price-check-page";

export const Route = createFileRoute("/precio")({ component: PriceCheckPage });
