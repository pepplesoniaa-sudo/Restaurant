import { defineConfig } from 'prisma/config';

// When a prisma.config.ts exists, Prisma stops auto-loading .env. Load it
// explicitly so schema datasource resolution keeps working from any CWD.
if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile();
}

export default defineConfig({
  // Single source of truth stays in packages/db; this lets Prisma commands
  // run from the repo root without a second copy of the schema.
  schema: 'packages/db/schema.prisma',
});
