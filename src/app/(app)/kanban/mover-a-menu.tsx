"use client";

import { useState } from "react";

import { es } from "@/messages/es";
import type { CatalogoPickerOption } from "@/lib/kanban/columnas";
import { Button } from "@/components/ui/button";

interface MoverAMenuProps {
  /** ACTIVE columns only, in `orden` — the same list the board renders. */
  columnas: CatalogoPickerOption[];
  /** The card's STORED columna; `null` for a card that has never been moved. */
  columnaActual: string | null;
  onSelect: (codigo: string) => void;
}

/**
 * The touch and keyboard path for moving a card (design D9). NOT a fallback:
 * native HTML5 drag and drop is neither touch-capable nor keyboard-accessible,
 * so on a phone or from a keyboard this is the ONLY way a card moves.
 *
 * Built on `Button` rather than a dropdown-menu primitive because the installed
 * shadcn kit ships none (`src/components/ui/` has badge/button/card/dialog/
 * input/select/skeleton/table/textarea/toast only — the same constraint
 * `user-menu.tsx` documents). `aria-haspopup`/`aria-expanded` carry the
 * disclosure semantics a real menu primitive would provide.
 *
 * Reports the `codigo`, never the `etiqueta`: labels are admin-editable, codes
 * are not (absent from `catalogo`'s UPDATE grant).
 */
export function MoverAMenu({
  columnas,
  columnaActual,
  onSelect,
}: MoverAMenuProps) {
  const [open, setOpen] = useState(false);

  // A card already in a column has no reason to offer it — that move is a
  // no-op round trip. A null `columna` stores nothing, so every column is a
  // genuine destination even though the card RENDERS in the first one (D3).
  const destinos = columnas.filter(
    (columna) => columna.codigo !== columnaActual,
  );

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="h-11 min-h-11"
      >
        {es.kanban.tarjeta.moverA}
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute z-10 mt-1 flex w-44 flex-col gap-1 rounded-lg border bg-popover p-1 shadow-md"
        >
          {destinos.map((columna) => (
            <Button
              key={columna.codigo}
              type="button"
              variant="ghost"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(columna.codigo);
              }}
              className="h-11 min-h-11 justify-start"
            >
              {columna.etiqueta}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
