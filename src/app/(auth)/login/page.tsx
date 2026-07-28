import type { Metadata } from "next";

import { es } from "@/messages/es";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: `${es.auth.loginTitle} · ${es.common.appName}`,
};

export default function LoginPage() {
  return <LoginForm />;
}
