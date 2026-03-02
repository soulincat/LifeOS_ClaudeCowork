# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Life OS Dashboard — a personal command center built with Express.js + vanilla HTML/JS/CSS frontend, SQLite (via `better-sqlite3`), no build step. Single product, not a monorepo.

### Running the app

```bash
npm start          # or: npm run dev (both run node core/server.js)
# Dashboard at http://localhost:3001
```

The server auto-initializes the SQLite database (`lifeos.db`) and runs migrations on startup. No separate DB process needed.

### First-run onboarding

On a fresh database, the root `/` route redirects to an onboarding wizard. To bypass it programmatically:

```bash
curl -X POST http://localhost:3001/api/onboarding/user -H 'Content-Type: application/json' -d '{"name":"Dev","timezone":"UTC"}'
curl -X POST http://localhost:3001/api/onboarding/complete -H 'Content-Type: application/json'
```

### Config

- `config/` directory is gitignored; run `bash setup.sh` to copy from `config.example/`.
- `.env` at project root (or `config/.env`) for API keys — all integrations are optional.

### Lint / Test

No lint or test scripts exist in this codebase. There is no ESLint config, no test framework, and no `test` or `lint` npm scripts.

### Sub-packages

- `mcp-server/` has its own `package.json` and needs a separate `npm install`.

### Key ports

| Service | Port |
|---------|------|
| Express server | 3001 (default, via `PORT` env var) |

### Native addon

`better-sqlite3` is a native Node.js addon. It requires `python3`, `make`, and `g++` to compile during `npm install`. These are pre-installed in the Cloud VM.
