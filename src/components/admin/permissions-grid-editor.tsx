"use client";

import {
  ACCIONES,
  MODULOS,
  type Accion,
  type DenseOverride,
  type Modulo,
} from "@/lib/permissions";
import { es } from "@/messages/es";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MODULE_LABELS: Record<Modulo, string> = {
  crm: es.admin.moduleCrm,
  kanban: es.admin.moduleKanban,
  documentos: es.admin.moduleDocumentos,
  dashboard: es.admin.moduleDashboard,
  admin: es.admin.moduleAdmin,
};

const ACTION_LABELS: Record<Accion, string> = {
  ver: es.admin.actionVer,
  crear: es.admin.actionCrear,
  editar: es.admin.actionEditar,
  eliminar: es.admin.actionEliminar,
  exportar: es.admin.actionExportar,
};

const INHERIT_VALUE = "__inherit__";
const ALLOW_VALUE = "__allow__";
const DENY_VALUE = "__deny__";

interface PermissionsGridEditorProps {
  /**
   * "full": every cell is a required boolean (role permisos — matches the
   * DB CHECK's full-grid shape). "override": a cell may be unset, meaning
   * "inherit the role" (spec U4) — used for a user's permisos_override.
   */
  mode: "full" | "override";
  value: DenseOverride;
  onChange: (
    modulo: Modulo,
    accion: Accion,
    value: boolean | undefined,
  ) => void;
  disabled?: boolean;
}

function cellToSelectValue(cell: boolean | undefined): string {
  if (cell === true) return ALLOW_VALUE;
  if (cell === false) return DENY_VALUE;
  return INHERIT_VALUE;
}

function selectValueToCell(selected: string | null): boolean | undefined {
  if (selected === ALLOW_VALUE) return true;
  if (selected === DENY_VALUE) return false;
  return undefined;
}

/**
 * Structured form over the permisos jsonb grid (task 4.7; reused by task
 * 4.5's per-user override editor). Renders one Select per module x action
 * cell instead of a raw JSON textarea, so a malformed shape is structurally
 * impossible to type — the DB CHECK (rol.permisos) and the zod schemas
 * (both grids) are still the actual validation gates, this is UX only.
 */
export function PermissionsGridEditor({
  mode,
  value,
  onChange,
  disabled,
}: PermissionsGridEditorProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{es.admin.permissionsGrid}</TableHead>
          {ACCIONES.map((accion) => (
            <TableHead key={accion}>{ACTION_LABELS[accion]}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {MODULOS.map((modulo) => (
          <TableRow key={modulo}>
            <TableCell className="font-medium">
              {MODULE_LABELS[modulo]}
            </TableCell>
            {ACCIONES.map((accion) => {
              const cell = value[modulo]?.[accion];
              return (
                <TableCell key={accion}>
                  <Select
                    value={cellToSelectValue(cell)}
                    onValueChange={(selected) => {
                      const nextValue =
                        mode === "full"
                          ? selected === ALLOW_VALUE
                          : selectValueToCell(selected);
                      onChange(modulo, accion, nextValue);
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      aria-label={`${MODULE_LABELS[modulo]} — ${ACTION_LABELS[accion]}`}
                      className="h-11 min-h-11 w-full min-w-32"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {mode === "override" ? (
                        <SelectItem value={INHERIT_VALUE}>
                          {es.admin.permissionInherit}
                        </SelectItem>
                      ) : null}
                      <SelectItem value={ALLOW_VALUE}>
                        {es.admin.permissionAllow}
                      </SelectItem>
                      <SelectItem value={DENY_VALUE}>
                        {es.admin.permissionDeny}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
