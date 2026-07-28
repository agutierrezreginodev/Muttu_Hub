import type { Metadata } from "next";

import { es } from "@/messages/es";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = {
  title: `${es.auth.recoveryTitle} · ${es.common.appName}`,
};

export default function RecoveryPage() {
  return <RecoveryForm />;
}
