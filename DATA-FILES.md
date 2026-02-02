# Where your data lives and how to get it back

All your saved data (todos, finance, projects, goals, etc.) is stored in **one SQLite file**. Nothing in the app deletes it; this doc shows where it is and how to restore from backups.

---

## Original data files

| File | Location | What it is |
|------|----------|------------|
| **lifeos.db** | Project root (`/Users/cat/code/LifeOS_ClaudeCowork/lifeos.db`) | Main database. Todos, finance entries, projects, goals, wishlist, health, social metrics, etc. |
| **.env** | Project root (optional) | Config: `DATABASE_PATH`, `ANTHROPIC_API_KEY`, etc. Not in git (`.gitignore`). |

If you set `DATABASE_PATH` in `.env` or in the environment, the app uses that path instead of `lifeos.db` in the project root. The server logs `Using database: <path>` on startup so you can confirm which file is in use.

---

## Backups (copies kept so nothing is blown away)

| Copy | Where | When it’s updated |
|------|--------|-------------------|
| **lifeos.db.backup** | Project root | Every server start (if `lifeos.db` exists and size > 1KB). |
| **db/backups/lifeos.db.latest.backup** | `db/backups/` | Same as above: every server start. |
| **db/backups/lifeos.db.YYYYMMDD-HHMMSS.backup** | `db/backups/` | Manual or script: timestamped copies you create. |

`db/backups/` is in `.gitignore` so backup files are not committed.

---

## Restore your data

If your main DB is missing or wrong:

1. **Stop the server** (Ctrl+C).
2. **Restore from a backup** (pick one):
   - From project root:  
     `cp lifeos.db.backup lifeos.db`
   - From latest in backups:  
     `cp db/backups/lifeos.db.latest.backup lifeos.db`
   - From a timestamped backup:  
     `cp db/backups/lifeos.db.20260201-033339.backup lifeos.db`  
     (use the filename you have.)
3. **Start the server again:**  
   `npm start`

Your existing data is in whichever backup you copied over; the app will use that as the main DB.

---

## Make another backup by hand

```bash
cp lifeos.db "db/backups/lifeos.db.$(date +%Y%m%d-%H%M%S).backup"
```

Or keep a single “safe” copy:

```bash
cp lifeos.db db/backups/lifeos.db.safe-copy
```

---

## Current backup created for you

A timestamped copy of your current DB was created at:

- **db/backups/lifeos.db.20260201-033339.backup**

That file is a full copy of `lifeos.db` at that time. Your existing saved data is in that file; you can restore it using the steps above if you ever need to.
