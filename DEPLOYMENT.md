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

| App Title | `APP` Build-Arg | Port | Domain | Folder | Dokploy Service |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cases App** | `cases` | 3000 | `cases.zenowethu.co.za` | `apps/cases` | **cases-app-vtwo** (Override) |
| **Insurance App** | `insurance` | 3001 | `insurance.zenowethu.co.za` | `apps/insurance` | new |
| **Legal App** | `legal` | 3002 | `legal.zenowethu.co.za` | `apps/legal` | new |
| **Forensic Audit**| `forensic-audit`| 3003 | `forensic.zenowethu.co.za` | `apps/forensic-audit` | new |
### Dokploy UI Configuration (Cases-App-vTwo Override)

Based on your current settings, make these specific changes:

1.  **Build Type Screen**:
    *   **Build Type**: `Dockerfile` (Selected)
    *   **Docker File**: `./Dockerfile`
    *   **Docker Context Path**: `.`
    *   **Docker Build Stage**: `runner`
    *   **Build Arguments**: Add `APP` with value `cases`.

2.  **Provider Screen (Git)**:
    *   **Repository URL**: `https://github.com/kennethmokgoshi/cases-app.git`
    *   **Branch**: `main`
    *   **Build Path**: `/` (Keep as is)

3.  **Advanced/Run Command Screen**:
    *   **Command**: Clear the `/bin/sh` or set it to `node server.js`. (The Dockerfile's internal CMD will handle this if the field is empty).

4.  **Domains Screen**:
    *   **Domain**: `cases.zenowethu.co.za`
    *   **Port**: `3000` (Keep as is)

### Required Environment Variables (all apps)
```
# Find this in Dokploy: Go to your Database -> "Internal Credentials" tab
DATABASE_URL=postgresql://postgres:<PASSWORD>@<INTERNAL_HOST>:5432/postgres
```

> [!IMPORTANT]
> **Build Arguments vs Run Arguments**: 
> The `APP=cases` parameter must be added as a **Build Argument** in the "Build Type" or "Deployment" settings, NOT just as a Run Argument. This ensures Docker builds the correct app from the monorepo.

> [!WARNING]
> Never put real passwords or secrets in this file. Use a secure `.env.local` file or environment variables in your deployment platform.

**IMPORTANT**: All apps MUST use the same `NEXTAUTH_SECRET` / `AUTH_SECRET` for SSO to work.

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
