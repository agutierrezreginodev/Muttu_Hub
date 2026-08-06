"use client";

import { useState, useTransition } from "react";

import { togglePromoteCompromisoAction } from "@/lib/kanban/actions";
import { es } from "@/messages/es";
import { Button } from "@/components/ui/button";

interface PromoteToggleProps {
  tareaId: number;
  /** Current `origen` — `'Ambos'` means the card is already on the board. */
  origen: string;
}

const ORIGEN_AMBOS = "Ambos";

/**
 * Promote a compromiso onto the Kanban board, or take it back off (slice 9,
 * spec KP2).
 *
 * The label states the ACTION, not the state, and flips after a successful
 * write. A control reading "En el tablero" would leave the user guessing
 * whether that describes where the row is or what the click will do.
 *
 * Optimism is deliberately absent: `origen` decides whether a card exists on
 * a whole other screen, so the button waits for the server rather than
 * painting a promotion that might not have happened.
 */
export function PromoteToggle({ tareaId, origen }: PromoteToggleProps) {
  const [enTablero, setEnTablero] = useState(origen === ORIGEN_AMBOS);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(undefined);

    startTransition(async () => {
      const promote = !enTablero;
      const result = await togglePromoteCompromisoAction(tareaId, promote);

      if (result.error) {
        setError(result.error);
        return;
      }

      setEnTablero(promote);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={enTablero ? "secondary" : "outline"}
        size="sm"
        disabled={isPending}
        aria-pressed={enTablero}
        onClick={handleClick}
        className="h-11 min-h-11"
      >
        {enTablero
          ? es.crm.compromisos.promoteRemove
          : es.crm.compromisos.promoteAdd}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
