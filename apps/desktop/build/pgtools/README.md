Place the PostgreSQL 17 client tools here before `npm run dist` on the Windows build machine:
`pg_dump.exe` plus the DLLs it needs (libpq.dll, libintl, libiconv, ssleay/libeay, ...), taken from the
EDB "binaries" zip for PostgreSQL 17 (Windows x64). The embedded-postgres package only ships
`postgres`, `initdb` and `pg_ctl`, so without these files daily backups fail with a clear log entry.
