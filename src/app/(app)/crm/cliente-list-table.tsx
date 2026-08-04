import Link from "next/link";
import { Users } from "lucide-react";

import { es } from "@/messages/es";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ClienteListItem } from "@/lib/crm/queries";

interface ClienteListTableProps {
  rows: ClienteListItem[];
}

/**
 * Presentational cliente list (task 6.7). Renders whatever `listClientes()`
 * returned — spec FC6's empty state (a caller without `crm.ver` sees an
 * empty list, never an error) is entirely a query-layer/RLS concern; this
 * component just renders zero rows the same way it would for "no search
 * matches".
 */
export function ClienteListTable({ rows }: ClienteListTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-6" />}
        title={es.crm.noResults}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{es.crm.nombre}</TableHead>
          <TableHead>{es.crm.tipoCliente}</TableHead>
          <TableHead>{es.crm.estado}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <Link href={`/crm/${row.id}`} className="hover:underline">
                {row.nombre}
              </Link>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.tipoCliente ?? "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.estado ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
