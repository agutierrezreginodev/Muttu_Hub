"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  requestPasswordRecoveryAction,
  type RecoveryActionState,
} from "@/lib/auth/actions";
import { es } from "@/messages/es";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: RecoveryActionState = {};

export function RecoveryForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordRecoveryAction,
    initialState,
  );

  if (state.success) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{es.auth.recoveryTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base">{es.auth.recoverySent}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{es.auth.recoveryTitle}</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-base font-medium">
              {es.auth.email}
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-11 text-base"
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            disabled={isPending}
            className="h-11 min-h-11 w-full text-base"
          >
            {isPending ? es.common.saving : es.auth.recoverySubmit}
          </Button>
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {es.auth.backToLogin}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
