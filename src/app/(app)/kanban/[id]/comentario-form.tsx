"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { createComentarioAction } from "@/lib/kanban/actions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ComentarioFormProps {
  tareaId: number;
}

/**
 * Append-only comment form (spec KM1), mirroring `bitacora-form.tsx`. Create
 * only: no `id` prop, no edit mode, and no author field — `createComentarioAction`
 * takes `autor_id` from the caller's own session because
 * `tarea_comentario_insert` pins it to `auth.uid()`, so an author input could
 * only ever be ignored or rejected.
 *
 * Clears on success so the next comment starts empty, and KEEPS the text on
 * failure — this thread has no edit path, so discarding a rejected comment would
 * simply lose the user's words.
 */
export function ComentarioForm({ tareaId }: ComentarioFormProps) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result = await createComentarioAction(tareaId, { texto });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title: es.kanban.comentarios.createSuccess,
        type: "success",
      });
      setTexto("");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="comentario-texto" className="text-base font-medium">
        {es.kanban.comentarios.nuevo}
      </label>
      <Textarea
        id="comentario-texto"
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        className="text-base"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="h-11 min-h-11 self-start"
      >
        {isPending ? es.common.saving : es.kanban.comentarios.enviar}
      </Button>
    </div>
  );
}
