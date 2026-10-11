import { createFileRoute } from "@tanstack/react-router";
import { FoodServicePage } from "@/components/pages/food-service-page";

export const Route = createFileRoute("/food-service")({
  component: FoodServicePage,
});
