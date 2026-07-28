import type { Metadata } from "next";

import { es } from "@/messages/es";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = {
  title: `${es.auth.updatePasswordTitle} · ${es.common.appName}`,
};

export default function UpdatePasswordPage() {
  return <UpdatePasswordForm />;
}
