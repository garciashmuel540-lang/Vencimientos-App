import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/vigia/dates";
import type { ProductStatus } from "@/lib/vigia/types";

const variant: Record<ProductStatus, "ok" | "soon" | "expired"> = {
  ok: "ok",
  soon: "soon",
  expired: "expired",
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant={variant[status]}>{statusLabel(status)}</Badge>;
}
