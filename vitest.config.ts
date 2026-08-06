import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // `supabase/functions` is excluded from tsconfig (the Edge Function is
    // Deno code tsc cannot read), but its PURE modules are ordinary
    // TypeScript and must actually run under vitest — otherwise the
    // "vitest-testable Edge Function" claim is only a claim.
    include: ["src/**/*.test.{ts,tsx}", "supabase/functions/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
