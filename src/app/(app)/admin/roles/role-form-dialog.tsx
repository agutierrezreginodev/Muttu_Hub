"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { createRoleAction, updateRoleAction } from "@/lib/admin/actions";
import {
  emptyPermisosGrid,
  type Accion,
  type Modulo,
  type PermisosGrid,
} from "@/lib/permissions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PermissionsGridEditor } from "@/components/admin/permissions-grid-editor";
import type { RoleRow } from "./roles-table";

interface RoleFormDialogProps {
  mode: "create" | "edit";
  role?: RoleRow;
}

/**
 * Create/edit role (task 4.7, spec U5): structured form over the permisos
 * jsonb column — the DB CHECK (private.permisos_grid_valid) is the real
 * shape guarantee; the grid editor makes an invalid shape hard to even
 * type, and roleSchema (zod) validates before the request leaves the
 * client, matching the DB's own key set exactly.
 */
export function RoleFormDialog({ mode, role }: RoleFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(role?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(role?.descripcion ?? "");
  const [permisos, setPermisos] = useState<PermisosGrid>(
    role?.permisos ?? emptyPermisosGrid(),
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleCellChange(
    modulo: Modulo,
    accion: Accion,
    value: boolean | undefined,
  ) {
    setPermisos((previous) => ({
      ...previous,
      [modulo]: { ...previous[modulo], [accion]: value ?? false },
    }));
  }

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createRoleAction({ nombre, descripcion, permisos })
          : await updateRoleAction({
              rolId: role!.id,
              nombre,
              descripcion,
              permisos,
            });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title:
          mode === "create"
            ? es.admin.roleCreateSuccess
            : es.admin.roleUpdateSuccess,
        type: "success",
      });
      setOpen(false);
    });
  }

  const titleId = `role-form-title-${role?.id ?? "new"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={mode === "create" ? "default" : "outline"}
            className="h-11 min-h-11"
          />
        }
      >
        {mode === "create" ? es.admin.createRole : es.common.edit}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle id={titleId}>
            {mode === "create"
              ? es.admin.createRoleTitle
              : es.admin.editRoleTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-nombre`}
              className="text-base font-medium"
            >
              {es.admin.roleName}
            </label>
            <Input
              id={`${titleId}-nombre`}
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              required
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-descripcion`}
              className="text-base font-medium"
            >
              {es.admin.roleDescription}
            </label>
            <Textarea
              id={`${titleId}-descripcion`}
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              className="text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-base font-medium">
              {es.admin.permissionsGrid}
            </span>
            <PermissionsGridEditor
              mode="full"
              value={permisos}
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
