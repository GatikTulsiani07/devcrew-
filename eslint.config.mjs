import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".next/**", "dist/**", "drizzle/**"],
  },
  ...tseslint.configs.recommended,
);
