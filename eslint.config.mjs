import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Prettier owns formatting; this must stay last to disable conflicting rules.
  eslintConfigPrettier,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // supabase/.temp is a gitignored runtime scratch dir (e.g. the Deno
      // edge-runtime bundle written by `supabase start`), never source we
      // own. The rest of supabase/ is SQL/TOML, not lintable JS/TS.
      "supabase/**",
    ],
  },
  {
    // Service-role Supabase client bypasses RLS entirely and must never
    // reach a client bundle (design decision "service_role key leakage",
    // Engram sdd/platform-foundation/design). `import "server-only"` in
    // lib/supabase/service-role.ts is the actual build-time enforcement;
    // this rule gives an earlier, editor-visible signal for the
    // client/presentational layer (components/** — see design's
    // container/presentational pattern), which should never talk to
    // Supabase directly regardless of the key involved.
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/service-role",
              message:
                "The service-role client is server-only. Never import it from components/** (client/presentational layer) — use a Server Action or Route Handler instead.",
            },
            {
              name: "@supabase/supabase-js",
              message:
                "Use lib/supabase/{client,server}.ts instead of @supabase/supabase-js directly.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
