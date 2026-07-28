"use client";

import { useActionState } from "react";
import Link from "next/link";

import { loginAction, type AuthActionState } from "@/lib/auth/actions";
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

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{es.auth.loginTitle}</CardTitle>
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-base font-medium">
              {es.auth.password}
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
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
            {isPending ? es.common.saving : es.auth.signIn}
          </Button>
          <Link
            href="/recuperar"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {es.auth.forgotPassword}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
