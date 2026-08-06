"use client";

import { useState, useTransition, type FormEvent } from "react";

import { setResumenDiarioAction } from "@/lib/notificaciones/preferencias/actions";
import { es } from "@/messages/es";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PreferenciasFormProps {
  resumenDiarioEmail: boolean;
}

/**
 * Digest opt-out (slice 13).
 *
 * The toggle is client state rather than an uncontrolled input so a failed
 * save leaves the checkbox where the user put it — reverting it silently
 * would tell them the opposite of what the server now holds.
 *
 * Wired with `useTransition` and a typed action argument, the same shape the
 * `(app)` dialogs use (`catalogo-form-dialog`, `oportunidad-form-dialog`),
 * not the `useActionState`/FormData shape of the `(auth)` forms. That choice
 * keeps the boolean a boolean end to end: FormData would turn it into an
 * absent-or-"on" string that both sides have to agree how to decode.
 */
export function PreferenciasForm({
  resumenDiarioEmail,
}: PreferenciasFormProps) {
  const [checked, setChecked] = useState(resumenDiarioEmail);
  const [error, setError] = useState<string | undefined>(undefined);
  const [guardado, setGuardado] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setGuardado(false);

    startTransition(async () => {
      const result = await setResumenDiarioAction({
        resumenDiarioEmail: checked,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setGuardado(true);
    });
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-lg">
          {es.preferencias.resumenDiario.titulo}
        </CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-3">
          <div className="flex min-h-11 items-center gap-3">
            <input
              id="resumenDiarioEmail"
              name="resumenDiarioEmail"
              type="checkbox"
              checked={checked}
              aria-describedby="resumenDiarioEmail-ayuda"
              onChange={(event) => {
                setChecked(event.target.checked);
                setGuardado(false);
              }}
              className="size-5 shrink-0 accent-primary"
            />
            <label
              htmlFor="resumenDiarioEmail"
              className="text-base font-medium"
            >
              {es.preferencias.resumenDiario.label}
            </label>
          </div>
          <p
            id="resumenDiarioEmail-ayuda"
            className="text-sm text-muted-foreground"
          >
            {es.preferencias.resumenDiario.ayuda}
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {guardado ? (
            <p role="status" className="text-sm text-muted-foreground">
              {es.preferencias.resumenDiario.guardado}
            </p>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={isPending}
            className="h-11 min-h-11 text-base"
          >
            {isPending ? es.common.saving : es.common.save}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
