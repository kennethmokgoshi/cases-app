# ZenoCasesSystem - Production Ready

ZenoCasesSystem is a comprehensive monorepo management system for legal, insurance, and forensic audit workflows.

## 🚀 Deployment Status
The system is **Production Ready** as of February 27, 2026.

- **Primary Documentation**: See [STATUS.md](STATUS.md) for the current feature set and recent hardening accomplishments.
- **Deployment Guide**: See [DEPLOYMENT.md](DEPLOYMENT.md) for instructions on setting up the VPS, Traefik, and Prisma Migrations.

## 🛠 Project Structure
- `apps/cases`: Main case management and intake.
- `apps/insurance`: Automated underwriting and insurance assessment.
- `apps/legal`: Legal filings and dispute management.
- `apps/finance`: Invoicing, payment allocation, and revenue reporting.
- `apps/forensic-audit`: Compliance and recklessness lending investigations.
- `packages/database`: Shared Prisma schema and migration history.
- `packages/shared-lib`: Common business logic, AI engines, and utilities.

## 🛡 Security & Reliability
- **Migrations**: Uses Prisma Migrations (`npx prisma migrate deploy`).
- **Monitoring**: Sentry integrated in `apps/cases` (pilot).
- **Hardening**: Standardized CSP headers, rate-limiting middleware, and robust DB backups.

## 🏃 Running Locally
```bash
pnpm install
pnpm dev
```
Explore the apps at:
- Cases: `http://localhost:3000`
- Insurance: `http://localhost:3001`
- Legal: `http://localhost:3002`
- Forensic: `http://localhost:3003`
- Finance: `http://localhost:3004`
