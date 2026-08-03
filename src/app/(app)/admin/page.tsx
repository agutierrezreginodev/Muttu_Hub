import type { Metadata } from "next";
import Link from "next/link";

import { es } from "@/messages/es";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: `${es.admin.title} · ${es.common.appName}`,
};

const sections = [
  {
    href: "/admin/usuarios",
    title: es.admin.users,
    description: es.admin.usersDescription,
  },
  {
    href: "/admin/roles",
    title: es.admin.roles,
    description: es.admin.rolesDescription,
  },
  {
    href: "/admin/accesos",
    title: es.admin.accessLog,
    description: es.admin.accessLogDescription,
  },
  {
    href: "/admin/catalogos",
    title: es.admin.catalogos.title,
    description: es.admin.catalogosDescription,
  },
  {
    href: "/admin/documentos",
    title: es.admin.categoryGrants.title,
    description: es.admin.categoryGrants.description,
  },
];

/**
 * Admin overview (spec S1: one flow, one purpose per screen — this screen's
 * one purpose is choosing which admin section to open next).
 */
export default function AdminPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{es.admin.title}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="block">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
