import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/pages/reports-page";

export const Route = createFileRoute("/reportes")({ component: ReportsPage });
