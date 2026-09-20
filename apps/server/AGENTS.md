## Backend Architecture (NestJS)

### Serverless & Stateless Constraints

- Because deployment runs on Vercel's container infrastructure, the application must be completely stateless[cite: 1]. Do not use in-memory stores, persistent background workers, or stateful web sockets.
- Prisma must connect via Supabase's transaction pooler:
  ```env
  DATABASE_URL="postgres://[user]:[password]@[host]:6543/[db]?pgbouncer=true"
  DIRECT_URL="postgres://[user]:[password]@[host]:5432/[db]"
  ```
