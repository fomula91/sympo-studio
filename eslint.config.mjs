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
    // `wrangler types`가 생성하는 파일. 손으로 고치지 않으므로 검사 대상이 아니다.
    "worker-configuration.d.ts",
    ".open-next/**",
  ]),
]);

export default eslintConfig;
