// Build used by Vercel (it runs the "vercel-build" script instead of "build").
// Keeps the database schema in step with prisma/schema.prisma on every deploy.
//   SKIP_DB_PUSH=1            skip the schema sync
//   PRISMA_ACCEPT_DATA_LOSS=1 allow changes that drop columns/tables (set it for one deploy, then remove it)
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

run("npx prisma generate");
if (process.env.SKIP_DB_PUSH !== "1" && process.env.DATABASE_URL) {
  const loss = process.env.PRISMA_ACCEPT_DATA_LOSS === "1" ? " --accept-data-loss" : "";
  run(`npx prisma db push --skip-generate${loss}`);
}
run("npx next build");
