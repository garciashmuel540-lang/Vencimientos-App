import { createFileRoute } from "@tanstack/react-router";
import { ScanPage } from "@/components/pages/scan-page";

export const Route = createFileRoute("/escanear")({ component: ScanPage });
