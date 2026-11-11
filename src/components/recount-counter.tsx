import { useState } from "react";
import { Delete, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { quantity } from "@/lib/vigia/recounts";

export function RecountCounter({
  name,
  physical,
  onChange,
}: {
  name: string;
  physical: string;
  onChange: (value: string, add?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [replace, setReplace] = useState(false);
  const amount = quantity(draft);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">Físico acumulado</span>
        <output aria-label={`Físico ${name}`} className="text-xl font-semibold tabular-nums">
          {physical || "—"}
        </output>
      </div>
      <div className="grid grid-cols-4 gap-2" aria-label={`Ajustar ${name}`}>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 px-1"
          aria-label={`Restar 1 a ${name}`}
          disabled={(quantity(physical) ?? 0) <= 0}
          onClick={() => onChange("-1", true)}
        >
          <Minus className="size-4" />1
        </Button>
        {[1, 5, 10].map((n) => (
          <Button
            type="button"
            key={n}
            variant="secondary"
            className="min-h-11 px-1"
            aria-label={`Sumar ${n} a ${name}`}
            onClick={() => onChange(String(n), true)}
          >
            +{n}
          </Button>
        ))}
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) {
            setDraft("");
            setReplace(false);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="min-h-11 w-full">
            <Plus className="size-4" />
            Sumar por área
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
          <DialogTitle>{replace ? "Ajustar total físico" : "Sumar por área"}</DialogTitle>
          <DialogDescription className="break-words">
            {name} · Total actual: {physical || "sin contar"}
          </DialogDescription>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={replace ? "outline" : "secondary"}
              onClick={() => {
                setReplace(false);
                setDraft("");
              }}
            >
              Sumar
            </Button>
            <Button
              type="button"
              variant={replace ? "secondary" : "outline"}
              onClick={() => {
                setReplace(true);
                setDraft(physical);
              }}
            >
              Ajustar total
            </Button>
          </div>
          <output
            className="rounded-xl bg-muted p-3 text-right text-3xl font-semibold tabular-nums"
            aria-label="Cantidad por ingresar"
          >
            {draft || "0"}
          </output>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((key) => (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 text-lg"
                key={key}
                onClick={() =>
                  setDraft((value) =>
                    value.length >= 12 || (key === "." && value.includes("."))
                      ? value
                      : key === "." && !value
                        ? "0."
                        : value === "0" && key !== "."
                          ? key
                          : value + key,
                  )
                }
              >
                {key}
              </Button>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              aria-label="Borrar último dígito"
              onClick={() => setDraft((value) => value.slice(0, -1))}
            >
              <Delete className="size-5" />
            </Button>
          </div>
          <Button
            type="button"
            disabled={amount === null}
            onClick={() => {
              onChange(String(amount), !replace);
              setOpen(false);
            }}
          >
            {replace ? "Guardar total" : "Agregar al físico"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
