# Deploy Project Management on Hetzner (Docker + Cloudflare Tunnel)

Same process as Utilization Dashboard (`https://engineerutilization.allumiax.com`) — from your *register app on Hetzner server* guide. **No Coolify.** Public HTTPS comes from **Cloudflare Tunnel** (`ats-production`).

| App | Host port → container | Public URL |
|-----|----------------------|------------|
| Utilization | `3000:3000` | `https://engineerutilization.allumiax.com` |
| PE License | `3001` | (existing) |
| **Project Management** | **`3002:3000`** | e.g. `https://projects.allumiax.com` |

Pick any free subdomain under `allumiax.com` (e.g. `projects`, `pm`, `projectmanagement`).

---

## Overview

1. Put code on GitHub  
2. Clone onto the server (`~/…`)  
3. Add secrets (`.env`)  
4. Run with Docker Compose  
5. Expose with Cloudflare Tunnel → `https://….allumiax.com`  
6. Add that URL in Azure (Microsoft login) + Basecamp redirect  

---

## 1. Prepare code on your PC

- App works locally (`npm run dev`)
- Repo has `Dockerfile`, `docker-compose.yml`, `.env.example`
- Push to GitHub (example pattern):  
  `https://github.com/sananaveed-spec/Your-App-Name`

---

## 2. Log in to the server

```bash
ssh sana@5.223.81.228
```

(Use your real user/IP if different.)

---

## 3. Create folder and download code

Don’t use `/var/www` if you don’t know the sudo password. Use the home folder (same idea as Utilization’s `~/utilization-dashboard`):

```bash
mkdir -p ~/project-management
cd ~/project-management
git clone https://github.com/YOUR_ORG/YOUR_PM_REPO.git .
```

If the repo is not on GitHub yet, copy the folder with SCP/`rsync`, then `cd` into it.

---

## 4. Create `.env` on the server

```bash
cp .env.example .env
nano .env
```

Paste real values, then save: `Ctrl+O` → Enter → `Ctrl+X`.

Shape (see [`.env.example`](.env.example)):

```env
NEXT_PUBLIC_AZURE_CLIENT_ID=...
NEXT_PUBLIC_AZURE_TENANT_ID=...
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=allumiax.com
DATA_DIR=/app/data
TIMESHEETS_API_TOKEN=...
TIMESHEETS_ORGANIZATION_ID=...
BASECAMP_CLIENT_ID=...
BASECAMP_CLIENT_SECRET=...
BASECAMP_REDIRECT_URI=https://projects.allumiax.com/api/basecamp/callback
BASECAMP_USER_AGENT=ALX Project Management (you@allumiax.com)
```

`NEXT_PUBLIC_*` are baked in at **image build** time. Change them → rebuild.

---

## 5. Build and start with Docker

```bash
docker compose up -d --build
docker ps
curl -I http://127.0.0.1:3002
```

App is ready on the server when `curl` returns **200**.  
Inside the container the app listens on `3000`; host port is **`3002`** (Utilization already uses `3000`).

Data volume: `project-management-data` → `/app/data` (survives rebuilds).

Optional one-time seed from local `data/`:

```bash
docker cp ./data/. <container>:/app/data/
```

---

## 6. Cloudflare Tunnel (public HTTPS)

Azure and browsers need `https://`, not `http://IP:3002`.

1. Open **Cloudflare Zero Trust** → **Tunnels**
2. Open existing tunnel: **`ats-production`**
3. Add route / published application:
   - **Subdomain:** e.g. `projects`
   - **Domain:** `allumiax.com`
   - **Service URL:** `http://127.0.0.1:3002`  
     (If the connector runs in Docker on another network and `127.0.0.1` fails, use the host IP the tunnel can reach — same pattern as Utilization’s `http://…:3000`.)
4. Save

Public URL:

```text
https://projects.allumiax.com
```

---

## 7. Azure login (Microsoft SPA)

Azure → App registration → **Authentication**

- Platform: **Single-page application** (SPA), not Web  
- Redirect URI: `https://projects.allumiax.com` (no trailing `/`)  
- Keep local: `http://localhost:5174`  
- Save  

---

## 8. Basecamp OAuth

Set in server `.env`:

```env
BASECAMP_REDIRECT_URI=https://projects.allumiax.com/api/basecamp/callback
```

Match that URL in the Basecamp OAuth app settings, then rebuild if you changed env after the first build:

```bash
docker compose up -d --build
```

---

## 9. Open and test

1. Open `https://projects.allumiax.com`
2. Sign in with Microsoft
3. Confirm data still there after refresh

---

## Later updates (when you change code)

```bash
ssh sana@5.223.81.228
cd ~/project-management
git pull
docker compose up -d --build
```

If you changed `NEXT_PUBLIC_*` values, you **must** rebuild (same command).

---

## Checklist

- [ ] Repo on GitHub (or files copied to server)
- [ ] `git clone` into `~/project-management`
- [ ] `.env` filled
- [ ] `docker compose up -d --build` — `curl -I http://127.0.0.1:3002` → 200
- [ ] Cloudflare hostname → `http://127.0.0.1:3002` on tunnel `ats-production`
- [ ] Azure SPA redirect = HTTPS URL
- [ ] Basecamp redirect = `https://…/api/basecamp/callback`
- [ ] Site opens and login works

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Port already in use | Something else on `3002`; change host mapping in `docker-compose.yml` |
| Login redirect error | Azure SPA URI must match the public HTTPS origin exactly |
| Tunnel 502 / unreachable | Service URL host/port wrong; confirm `curl` on `3002` on the server |
| Data wiped after rebuild | Volume missing; confirm `project-management-data` → `/app/data` |
| Basecamp connect fails | `BASECAMP_REDIRECT_URI` must match public callback URL |
| ATS / Timesheets errors | Check token + org id in `.env` |
| `permission denied` on Docker | `sudo usermod -aG docker $USER` then re-login |

---

## Quick reference

```bash
docker compose ps
docker compose logs -f --tail 100
docker compose restart
docker compose down          # stops container; volume keeps data
docker compose up -d --build # rebuild after code / NEXT_PUBLIC_* changes
```

**Utilization (already live):**  
`ssh sana@5.223.81.228` → `cd ~/utilization-dashboard` → `git pull` → `docker compose up -d --build`
