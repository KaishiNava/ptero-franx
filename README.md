# FRANXX PTERO v2 — Next.js + Custom Runtime API

FRANXX PTERO is a custom private server panel. The web interface is built with Next.js App Router and React. The existing Express runtime API is retained as an internal service so existing authentication, Supabase metadata, server/file operations, access-key routes and WebSocket console are not thrown away during the UI migration.

## Architecture

- **Next.js web app** listens on Railway's public `PORT`.
- **Express API/runtime service** listens internally on `API_PORT` (default `3001`).
- Next.js rewrites `/api/*`, `/ws`, and `/runtime/*` to the internal Express service.
- Supabase remains the metadata/account source of truth when configured.
- Runtime files and server processes live on the panel host. Use a Railway Volume mounted at `/data` for persistent runtime files.

This custom panel runs its own Node/Python/custom processes; it is not a frontend for the official Pterodactyl daemon.

## Local development

Requires Node.js 22.

```bash
npm install
npm run dev
```

Next.js is served on port `3000` and the internal API on `3001`.

## Production / Railway

Set the Railway start command to `npm start`. The launcher starts the Express API internally and Next.js on Railway's assigned `PORT`.

Configure Railway Variables:

- `JWT_SECRET`: long, random, persistent secret (required in production).
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase service role key; never expose it to browser variables.
- `ROOT_USERNAME`: initial/configured root username.
- `ROOT_PASSWORD`: initial root password used only to provision the first root account when needed.
- `DATA_DIR=/data`
- `SERVERS_DIR=/data/servers`
- `API_PORT=3001` (normally leave this default).
- `MAX_UPLOAD_MB=100` (optional).
- `PANEL_URL`: public panel URL if runtime URL generation requires it.

Attach a Railway Volume at `/data` to persist server files and local metadata fallback files across redeploys. Verify that Supabase tables from `supabase.sql` have been applied. Never commit `.env` files, real API keys, service role keys, or root credentials.

## Routes

- `/home` — dashboard overview.
- `/console` — server list, power controls, resource overview and live console.
- `/console/[serverId]` — route entry for the console workspace; select the server in the panel to manage it.
- Admin-only `/admin` workspace — panel users and access keys.

## Existing API compatibility

The existing Express routes are kept behind the Next.js rewrites, including login, `/api/me`, server CRUD/power/stats/files, root user management, access-key management, and `/ws` live console. Do not create `NEXT_PUBLIC_*` variables for secrets. Client-side access is protected by the existing bearer-token API checks; every sensitive operation must continue to be authorized by the backend, not just hidden in the UI.

## Validation

```bash
npm run check
npm run build
```

The build must be run after dependencies are installed. Runtime-specific actions should also be tested on Railway with a non-production test server before using them on important data. This is a first migration pass: backup/restore, subusers, and expanded API documentation still require backend endpoints and tests before they should be considered implemented.
