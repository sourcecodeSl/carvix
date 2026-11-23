# Local setup

1. Run `pnpm install`.
2. Copy `.env.example` files and replace development placeholders if needed.
3. Run `docker compose up -d postgres redis`.
4. Run `pnpm db:generate`.
5. Run `pnpm db:migrate`.
6. Run `pnpm dev`.

Postgres is exposed only on `127.0.0.1:55432` and Redis on `127.0.0.1:6379`.

Stop infrastructure with `docker compose down`. Add `-v` only when intentionally deleting local data.
