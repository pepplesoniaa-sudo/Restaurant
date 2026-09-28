import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// When a prisma.config.ts exists, Prisma stops auto-loading .env. Load it
// explicitly so schema datasource resolution keeps working from any CWD.
// Hosted builds (Vercel) have no .env file: their variables are already set.
if (typeof process.loadEnvFile === 'function' && existsSync('.env')) {
  process.loadEnvFile();
}

export default defineConfig({
  // Single source of truth stays in packages/db; this lets Prisma commands
  // run from the repo root without a second copy of the schema.
  schema: 'packages/db/schema.prisma',
});
