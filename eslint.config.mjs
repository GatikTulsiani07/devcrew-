import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "drizzle/**"],
  },
  ...tseslint.configs.recommended,
);
