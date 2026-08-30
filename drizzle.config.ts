// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Path to the Drizzle schema file
  schema: './src/server/drizzle/schema.ts',
  driver: 'pg',
  dbCredentials: {
    // Neon connection string provided via env variable
    connectionString: process.env.DATABASE_URL as string,
  },
  out: './drizzle',
});
