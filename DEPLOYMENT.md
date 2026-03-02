# Zenowethu Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Traefik                           │
│              (Reverse Proxy + SSL)                   │
│                                                     │
│  cases.zenowethu.co.za → Cases (Port 3000)         │
│  insurance.zenowethu.co.za → Insurance (Port 3001) │
│  legal.zenowethu.co.za → Legal (Port 3002)         │
│  forensic.zenowethu.co.za → Forensic-Audit (3003)  │
│  accounts.zenowethu.co.za → Finance (Port 3004)    │
└─────────────────────────────────────────────────────┘
│                                                     │
│  PostgreSQL (Port 5432) - Shared Database           │
│  SSO via .zenowethu.co.za cookie domain             │
└─────────────────────────────────────────────────────┘
```

## SSO (Single Sign-On) Flow

1. User visits any app (Cases, Insurance, Legal, Forensic, Accounts)
2. If not logged in → Redirected to `cases.zenowethu.co.za/login`
3. User logs in on Cases app
4. JWT session cookie set with domain `.zenowethu.co.za`
5. Cookie is shared across all subdomains automatically
6. User can navigate between apps without re-logging in

Add **A records** for these subdomains pointing to the Contabo VPS IP (`213.199.57.111`):

```
cases.zenowethu.co.za     → 213.199.57.111
insurance.zenowethu.co.za → 213.199.57.111
legal.zenowethu.co.za     → 213.199.57.111
forensic.zenowethu.co.za  → 213.199.57.111
accounts.zenowethu.co.za  → 213.199.57.111
```

## Deployment Steps

### 1. SSH into Contabo VPS
```bash
ssh root@YOUR_VPS_IP
```

### 2. Clone/Pull the latest code
```bash
cd /opt/zenowethu
git pull origin main
```

### 3. Create `.env` file for Docker
```bash
cat > .env << EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YOUR_DB_PASSWORD
POSTGRES_DB=postgres
NEXTAUTH_SECRET=YOUR_PRODUCTION_SECRET
CASES_URL=https://cases.zenowethu.co.za
INSURANCE_URL=https://insurance.zenowethu.co.za
LEGAL_URL=https://legal.zenowethu.co.za
FORENSIC_URL=https://forensic.zenowethu.co.za
ACCOUNTS_URL=https://accounts.zenowethu.co.za
ACME_EMAIL=admin@zenowethu.co.za
EOF
```

### 4. Database Setup
The system uses a shared PostgreSQL database.

**IMPORTANT**: We have transitioned to **Prisma Migrations**. Do NOT use `db push` in production.

To initialize or update the database:
```bash
cd packages/database
npx prisma migrate deploy
```

The CI/CD pipeline handles this automatically on push to `main`, but manual deployment may be needed for initial setup.

### 5. Build and start all services
```bash
docker compose up -d --build
```

### 6. Verify services are running
```bash
docker compose ps
docker compose logs -f --tail=50
```

## Monorepo Deployment (via Dokploy)

The system uses a single root `Dockerfile` with a build argument `APP` to determine which application to build.

### Dokploy Configuration for All Apps

- **Source**: Root `Dockerfile` (at repository root)
- **Build Context**: `.` (root of the repository)
- **Build Argument**: `APP` (must be set to the app name below)
- **Container Port**: `3000` for ALL apps (Traefik routes by domain, not port)

| App Title | `APP` Build-Arg | Container Port | Domain | Dokploy Service Name |
| :--- | :--- | :--- | :--- | :--- |
| **Cases App** | `cases` | 3000 | `cases.zenowethu.co.za` | `cases-app-vtwo` |
| **Insurance App** | `insurance` | 3000 | `insurance.zenowethu.co.za` | `insurance-app` |
| **Legal App** | `legal` | 3000 | `legal.zenowethu.co.za` | `legal-app` |
| **Forensic Audit** | `forensic-audit` | 3000 | `forensic.zenowethu.co.za` | `forensic-app` |
| **Finance App** | `finance` | 3000 | `accounts.zenowethu.co.za` | `finance-app` |

> [!NOTE]
> All containers expose port 3000 internally. Dokploy + Traefik route traffic by domain name, so each app needs its own domain, not a unique port.

### Dokploy UI Configuration — All 5 Apps

Apply these settings identically to each service. Only the `APP` build arg, `NEXTAUTH_URL`, and domain change per app.

**Build Type Tab:**
- Build Type: `Dockerfile`
- Dockerfile Path: `./Dockerfile`
- Docker Context Path: `.`
- Docker Build Stage: `runner`
- Build Arguments:
  - `APP` = `cases` (or `insurance`, `legal`, `forensic-audit`, `finance`)
  - `DATABASE_URL` = _(copy from env vars below)_
  - `NEXTAUTH_SECRET` = _(copy from env vars below)_

**Provider Tab (Git):**
- Repository URL: `https://github.com/kennethmokgoshi/cases-app.git`
- Branch: `main`
- Build Path: `/`

**Domains Tab:**
- Domain: _(app-specific, see table above)_
- Port: `3000`
- HTTPS: enabled (Traefik auto-provisions Let's Encrypt)

### Required Environment Variables (all apps)

Set these in Dokploy → Service → Environment tab for each app:

```bash
# ── Database ──────────────────────────────────────────────────────────────
# Get internal host from: Dokploy > cases-db > Internal Credentials tab
DATABASE_URL=postgresql://postgres:<PASSWORD>@<INTERNAL_HOST>:5432/postgres

# ── Authentication (MUST be identical across all 5 apps for SSO) ──────────
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
AUTH_SECRET=<same value as NEXTAUTH_SECRET>
# Set per-app — use the app's own domain:
NEXTAUTH_URL=https://cases.zenowethu.co.za      # cases-app-vtwo
# NEXTAUTH_URL=https://insurance.zenowethu.co.za  # insurance-app
# NEXTAUTH_URL=https://legal.zenowethu.co.za       # legal-app
# NEXTAUTH_URL=https://forensic.zenowethu.co.za    # forensic-app
# NEXTAUTH_URL=https://accounts.zenowethu.co.za    # finance-app

# ── AI ────────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# ── CRM (GoHighLevel) ────────────────────────────────────────────────────
GHL_API_KEY=...
GHL_CLIENT_ID=...

# ── Email (SMTP) ──────────────────────────────────────────────────────────
SMTP_HOST=smtp.yourmailprovider.com
SMTP_PORT=587
SMTP_USER=noreply@zenowethu.co.za
SMTP_PASSWORD=...
SMTP_FROM=noreply@zenowethu.co.za

# ── DHS (NCR Debt Help System) ───────────────────────────────────────────
DHS_USERNAME=...
DHS_PASSWORD=...

# ── Runtime ───────────────────────────────────────────────────────────────
NODE_ENV=production
```

**Cases app only — add Sentry:**
```bash
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...
SENTRY_ORG=zenowethu
SENTRY_PROJECT=cases
```

> [!IMPORTANT]
> **`APP` must be a Build Argument, not just an Environment Variable.** Add it under the "Build Arguments" section of the Build Type tab, not the Environment tab. Dokploy passes it to `docker build --build-arg APP=...` — without it the container defaults to `cases` regardless of which service you're building.

> [!IMPORTANT]
> **All 5 apps must share the same `NEXTAUTH_SECRET` / `AUTH_SECRET`** for Single Sign-On to work across subdomains. If they differ, logging into one app will not authenticate the user on the others.

> [!WARNING]
> Never commit real credentials to this file. All secrets live only in Dokploy's Environment tab or `.env.local` (gitignored).

### GitHub Secrets Required for CI/CD

Add these in GitHub → Repository → Settings → Secrets and Variables → Actions:

| Secret Name | Value |
|-------------|-------|
| `DATABASE_URL` | Full PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Same secret used in all Dokploy services |
| `OPENAI_API_KEY` | OpenAI API key |
| `E2E_EMAIL` | Staff email for Playwright login tests |
| `E2E_PASSWORD` | Staff password for Playwright login tests |
| `DOKPLOY_URL` | Your Dokploy instance URL (e.g. `https://dokploy.yourdomain.com`) |
| `DOKPLOY_TOKEN` | Dokploy API token (Profile → API Keys) |
| `DOKPLOY_CASES_ID` | Application ID for cases-app-vtwo (from Dokploy) |
| `DOKPLOY_INSURANCE_ID` | Application ID for insurance-app |
| `DOKPLOY_LEGAL_ID` | Application ID for legal-app |
| `DOKPLOY_FORENSIC_ID` | Application ID for forensic-app |
| `DOKPLOY_FINANCE_ID` | Application ID for finance-app |

## Troubleshooting

### SSO Not Working
- Ensure all apps use the same `NEXTAUTH_SECRET`
- Verify DNS A records point to the same IP
- Check cookie domain is `.zenowethu.co.za` (with leading dot)
- Verify SSL certificates are valid (Traefik handles this automatically)

### Database Connection Issues
- Check if PostgreSQL is accessible on port 5432
- Verify firewall allows connections
- Test: `psql -h YOUR_DB_HOST -U postgres -d postgres`

### Container Won't Start
```bash
docker compose logs <service-name>  # Check logs
docker compose build <service-name> # Rebuild
docker compose restart <service-name> # Restart
```
