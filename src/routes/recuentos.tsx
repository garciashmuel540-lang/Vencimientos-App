import { createFileRoute } from "@tanstack/react-router";
import { RecountsPage } from "@/components/pages/recounts-page";
export const Route = createFileRoute("/recuentos")({ component: RecountsPage });
