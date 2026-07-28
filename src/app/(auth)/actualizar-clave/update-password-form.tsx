"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  updatePasswordAction,
  type UpdatePasswordActionState,
} from "@/lib/auth/actions";
import { es } from "@/messages/es";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: UpdatePasswordActionState = {};

export function UpdatePasswordForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updatePasswordAction,
    initialState,
  );

  // Spec S6: no silent saves. The action itself does not redirect (a
  // Server Action cannot show a client-side toast), so success is
  // acknowledged here before navigating home.
  useEffect(() => {
    if (state.success) {
      toast.add({ title: es.common.saveSuccess, type: "success" });
      router.push("/");
    }
  }, [state.success, router]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{es.auth.updatePasswordTitle}</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-base font-medium">
              {es.auth.newPassword}
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="h-11 text-base"
            />
            <p className="text-sm text-muted-foreground">
              {es.auth.passwordTooWeak}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-base font-medium">
              {es.auth.confirmPassword}
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="h-11 text-base"
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={isPending}
            className="h-11 min-h-11 w-full text-base"
          >
            {isPending ? es.common.saving : es.auth.updatePasswordButton}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
