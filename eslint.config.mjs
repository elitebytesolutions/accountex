import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Pages only compose feature components; API calls live in src/features/*/api.ts.
    files: ["src/app/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Call the API through src/features/*/api.ts instead." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Server build output and generated Prisma client:
    "dist/**",
    "src/server/generated/**",
    // Static HTML prototype the screens are designed from, not app code:
    "template/**",
  ]),
]);

export default eslintConfig;
