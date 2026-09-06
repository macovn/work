# Bootstrap notes (audit fix C1 / M7)

Applies to the `0_init` baseline migration.

- **Empty / fresh database** (new deploy): `prisma migrate deploy` runs `0_init` and
  creates the whole schema. Nothing else needed.
- **Existing database created by the old `prisma db push` workflow** (schema already
  present, no `_prisma_migrations` history): do NOT let `migrate deploy` re-run `0_init`
  (it will fail because objects already exist). Instead mark the baseline as applied once:

      npx prisma migrate resolve --applied 0_init

  then all later migrations deploy normally.
- Local development: `npm run db:push` (`prisma db push`) remains available for throwaway
  dev databases; the production build (`prisma migrate deploy`) is additive and never
  destructive. Do not re-add `--accept-data-loss` to the build.
