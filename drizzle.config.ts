import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/src/db/schema.ts",
  out: "./migrations",
});
