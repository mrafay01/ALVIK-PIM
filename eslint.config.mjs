import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  {
    // Generated / build output — never lint these. Without this, `eslint .`
    // walks .next/ and reports thousands of errors in minified bundles.
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "out/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
