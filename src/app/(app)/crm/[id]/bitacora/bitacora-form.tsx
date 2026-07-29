"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { addBitacoraEntryAction } from "@/lib/crm/actions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface BitacoraFormProps {
  clienteId: number;
}

/**
 * Append-only create form (task 8.4, spec BIT4/BIT5). This component ONLY
 * ever creates a new row — there is no edit mode, no `id` prop, and no
 * `autorId` field: `addBitacoraEntryAction` forces `autor_id` server-side
 * from the caller's own session, never from anything this form sends.
 */
export function BitacoraForm({ clienteId }: BitacoraFormProps) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result = await addBitacoraEntryAction(clienteId, { texto });
      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({ title: es.crm.bitacora.createSuccess, type: "success" });
      setTexto("");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="bitacora-texto" className="text-base font-medium">
        {es.crm.bitacora.nuevaEntrada}
      </label>
      <Textarea
        id="bitacora-texto"
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || texto.trim().length === 0}
        className="h-11 min-h-11 w-fit text-base"
      >
        {isPending ? es.common.saving : es.crm.bitacora.agregar}
      </Button>
    </div>
  );
}
