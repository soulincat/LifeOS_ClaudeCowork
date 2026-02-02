# Hosting LifeOS on Another Server

Run the dashboard on a different machine (VPS, cloud, or home server).

## Why did everything reset when I pushed to main?

If you **push to main** and a host (Vercel, Netlify, Railway, Render, etc.) **auto-deploys** your app, each deploy usually gets a **new, empty filesystem**. So:

- `lifeos.db` doesn’t exist (or is empty) on that deploy.
- The server starts, sees 0 todos, runs the seed.
- You see default todos and no finance data.

**Commit/push itself doesn’t delete your data.** Your local `lifeos.db` is unchanged. The **deployed** instance is a new environment with no copy of your DB.

**So that your data doesn’t reset on deploy:**

- Use **persistent storage** for the DB in production (see Option 1 below: Docker with a volume), or
- Use a **hosted database** (e.g. Turso, PlanetScale) and set `DATABASE_PATH` or a DB URL in the deploy config.

**Local use:** Your data lives in `lifeos.db` in the project root. It’s in `.gitignore`, so git never commits it. Back it up yourself if you need it elsewhere.

## Option 1: Docker (recommended)

On the server, clone the repo and run:

```bash
# Build
docker build -t lifeos .

# Run (port 3000; data in named volume)
docker run -d --name lifeos -p 3000:3000 -v lifeos-data:/data lifeos
```

- App: **http://&lt;server-ip&gt;:3000**
- DB is stored in the `lifeos-data` volume. To backup:  
  `docker run --rm -v lifeos-data:/data -v $(pwd):/backup alpine cp /data/lifeos.db /backup/`

To use a different port (e.g. 8080):

```bash
docker run -d --name lifeos -p 8080:3000 -v lifeos-data:/data lifeos
```

## Option 2: Node.js directly

On the server (with Node 18+):

```bash
git clone <your-repo-url> lifeos && cd lifeos
npm ci
PORT=3000 node server.js
```

Or with a process manager (e.g. systemd or PM2):

```bash
# PM2
npm install -g pm2
PORT=3000 pm2 start server.js --name lifeos
pm2 save && pm2 startup
```

- By default the app listens on `0.0.0.0`, so it’s reachable from other machines.
- DB file: `lifeos.db` in the project root. Back it up regularly.
- Optional: set `DATABASE_PATH=/path/to/lifeos.db` to put the DB elsewhere.
- Optional: set `HOST=127.0.0.1` if you only want local access and use a reverse proxy (e.g. nginx) for HTTPS.

## Environment variables

| Variable          | Default     | Description                    |
|-------------------|-------------|--------------------------------|
| `PORT`            | `3000`      | Server port                    |
| `HOST`            | `0.0.0.0`   | Bind address                   |
| `DATABASE_PATH`   | `lifeos.db` | Path to SQLite database file  |
