"use client";

import { useActionState, useEffect, useState } from "react";

import { es } from "@/messages/es";
import { inviteUserAction, type AdminActionState } from "@/lib/admin/actions";
import type { RolOption } from "@/lib/admin/directory";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialState: AdminActionState = {};

interface InviteUserDialogProps {
  roles: RolOption[];
}

/** Invite user (task 4.4, spec U8): admin form (nombre, email, rol) -> service-role Server Action. */
export function InviteUserDialog({ roles }: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    inviteUserAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.add({ title: es.admin.inviteSuccess, type: "success" });
      setOpen(false);
    }
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-11 min-h-11" />}>
        {es.admin.inviteUser}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.admin.inviteUserTitle}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-nombre" className="text-base font-medium">
              {es.admin.name}
            </label>
            <Input
              id="invite-nombre"
              name="nombre"
              required
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-base font-medium">
              {es.admin.email}
            </label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-rol" className="text-base font-medium">
              {es.admin.role}
            </label>
            <Select name="rolId" required>
              <SelectTrigger id="invite-rol" className="h-11 min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles
                  .filter((rol) => rol.activo)
                  .map((rol) => (
                    <SelectItem key={rol.id} value={String(rol.id)}>
                      {rol.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              disabled={isPending}
              className="h-11 min-h-11 w-full text-base sm:w-auto"
            >
              {isPending ? es.common.saving : es.admin.inviteUser}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
