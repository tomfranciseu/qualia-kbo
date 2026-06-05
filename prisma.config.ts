import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const defaultUrl = 'postgresql://kbo:kbo@localhost:5434/kbo';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.KBO_DATABASE_URL ?? defaultUrl,
  },
});
