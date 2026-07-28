"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { updateUserAction } from "@/lib/admin/actions";
import type { RolOption } from "@/lib/admin/directory";
import {
  denseOverride,
  type Accion,
  type DenseOverride,
  type Modulo,
} from "@/lib/permissions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
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
import { PermissionsGridEditor } from "@/components/admin/permissions-grid-editor";
import type { UserRow } from "./users-table";

interface EditUserDialogProps {
  user: UserRow;
  roles: RolOption[];
}

/**
 * Edit user (task 4.5): role + permisos_override editor. The override grid
 * is edited as structured state, not a raw form, so updateUserAction is
 * called directly (a Server Action can be invoked as a plain async
 * function, not only via <form action>) — nested per-cell state doesn't
 * map cleanly onto FormData. zod (editUserSchema, shared with the action)
 * still validates before the request leaves the client just as strictly as
 * the server-side parse.
 */
export function EditUserDialog({ user, roles }: EditUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [rolId, setRolId] = useState(user.rolId);
  const [grid, setGrid] = useState<DenseOverride>(
    denseOverride(user.permisosOverride),
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleCellChange(
    modulo: Modulo,
    accion: Accion,
    value: boolean | undefined,
  ) {
    setGrid((previous) => {
      const nextModule = { ...previous[modulo] };
      if (value === undefined) {
        delete nextModule[accion];
      } else {
        nextModule[accion] = value;
      }
      return { ...previous, [modulo]: nextModule };
    });
  }

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result = await updateUserAction(user.id, rolId, grid);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.add({ title: es.admin.userUpdateSuccess, type: "success" });
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className="h-11 min-h-11" />}
      >
        {es.common.edit}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {es.admin.editUser} — {user.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`edit-rol-${user.id}`}
              className="text-base font-medium"
            >
              {es.admin.role}
            </label>
            <Select
              value={String(rolId)}
              onValueChange={(value) => setRolId(Number(value))}
            >
              <SelectTrigger
                id={`edit-rol-${user.id}`}
                className="h-11 min-h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles
                  .filter((rol) => rol.activo || rol.id === rolId)
                  .map((rol) => (
                    <SelectItem key={rol.id} value={String(rol.id)}>
                      {rol.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-base font-medium">
              {es.admin.permissionsGrid}
            </span>
            <PermissionsGridEditor
              mode="override"
              value={grid}
              onChange={handleCellChange}
              disabled={isPending}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="h-11 min-h-11 w-full text-base sm:w-auto"
          >
            {isPending ? es.common.saving : es.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
