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
    // `wrangler dev`가 남기는 번들 임시 파일. 검사 대상이 아닌데도 스캔돼서,
    // 한 번이라도 로컬에서 워커를 띄우면 `npm run lint`가 남의 코드로 64건씩
    // 실패했다 — 공식 검증 입구가 빌드 산출물 때문에 막히면 안 된다.
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
