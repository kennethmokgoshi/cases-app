---
description: How to run all Zenowethu apps locally
---

# Running Zenowethu Monorepo Apps

## Prerequisites
- Node.js 18+ installed
- npm installed

## Starting Apps Individually

### Cases App (Port 3000)
```bash
cd apps/cases
pnpm run dev
```
// turbo

### Insurance App (Port 3001)
```bash
cd apps/insurance
pnpm run dev
```
// turbo

### Legal App (Port 3002)
```bash
cd apps/legal
pnpm run dev
```
// turbo

## Starting All Apps (Turborepo)

From the root directory:
```bash
pnpm run dev
```

This will start all apps concurrently using Turborepo.

## App URLs

| App | Local URL | Production URL |
|-----|-----------|----------------|
| Cases | http://localhost:3000 | https://cases.zenowethu.co.za |
| Insurance | http://localhost:3001 | https://insurance.zenowethu.co.za |
| Legal | http://localhost:3002 | https://legal.zenowethu.co.za |

## Navigation Between Apps

All apps include a shared navigation header that allows switching between apps.
In local development, it uses localhost ports. In production, it uses subdomains.

## Common Issues

### Port Already in Use
If a port is in use, kill the process:
```bash
# Windows
taskkill /F /IM node.exe /T

# Mac/Linux  
pkill -f node
```

### Module Not Found Errors
Run npm install from the root:
```bash
npm install
```

### Database Connection Errors
Ensure DATABASE_URL is set in .env file.
