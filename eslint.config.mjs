import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierRecommended from "eslint-plugin-prettier/recommended";

// eslint-config-next 16 ships native flat configs, so we consume them directly
// (no more FlatCompat / @eslint/eslintrc shim).
const eslintConfig = [
  // Base Next.js + TS rules
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Prettier integration: disable conflicting rules and surface formatting issues via ESLint.
  prettierRecommended,
  {
    // react-hooks@7 (bundled by eslint-config-next 16) adds React-Compiler-aligned rules that
    // flag intentional patterns here: hooks that expose mutable refs (useMarketPoll's in-memory
    // series — central to avoiding per-tick re-renders), SSR Date.now() seeding for
    // hydration-safe ticking, and deliberate mount/reset setState in effects (Ticker, history
    // and snapshot resets). Turn off just these new rules; all other react-hooks rules stay on.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
  // Project ignores
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
