import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated native projects are built by Xcode/Gradle, not the web linter.
    "android/**",
    "ios/**",
    "mobile-web/**",
    "apps/native/.next/**",
    "apps/native/out/**",
  ]),
  {
    files: ["apps/native/**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "server-only", message: "The bundled native app must remain client-safe." },
            { name: "next-auth", message: "Auth.js server configuration belongs to the web/backend app." },
            { name: "stripe", message: "Stripe server code must never enter the native bundle." },
          ],
          patterns: [
            {
              group: [
                "@prisma/**",
                "@aws-sdk/**",
                "@/auth",
                "@/auth/**",
                "@/lib/prisma",
                "@/lib/server-**",
                "@/lib/stripe**",
                "@/lib/apple-iap/**",
                "@/lib/r2",
                "@/lib/**email**",
                "@/lib/admin-**",
                "@/lib/nutrition/providers/**",
                "**/auth",
                "**/lib/prisma",
                "**/lib/server-**",
                "**/lib/stripe**",
                "**/lib/apple-iap/**",
                "**/lib/r2",
                "**/lib/**email**",
                "**/lib/admin-**",
                "**/lib/nutrition/providers/**"
              ],
              message: "This module is server-only and cannot be imported by apps/native.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
