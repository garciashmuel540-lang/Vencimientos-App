import { CalendarClock, MapPin, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { daysLabel, productStatus } from "@/lib/vigia/dates";
import { LOCATION_LABEL, type Product } from "@/lib/vigia/types";
import { cn } from "@/lib/utils";

export function ProductCard({
  product,
  soonWithin,
  onClick,
}: {
  product: Product;
  soonWithin: number;
  onClick: () => void;
}) {
  const status = productStatus(product, soonWithin);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left"
      aria-label={`${product.name}, ${daysLabel(product.expiresAt)}`}
    >
      <Card className="flex gap-3 p-3 transition-[box-shadow] duration-150 hover:shadow-md">
        <div
          className={cn(
            "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted",
            status === "expired" && "ring-2 ring-bad/40",
            status === "soon" && "ring-2 ring-warn/40",
          )}
        >
          {product.image ? (
            <img
              src={product.image}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <Package className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium leading-tight">{product.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {product.brand || "Sin marca"}
                {product.presentation ? ` · ${product.presentation}` : ""}
              </p>
            </div>
            <StatusBadge status={status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              {daysLabel(product.expiresAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {LOCATION_LABEL[product.location]}
            </span>
            <span className="tabular">{product.quantity} u.</span>
          </div>
        </div>
      </Card>
    </button>
  );
}
