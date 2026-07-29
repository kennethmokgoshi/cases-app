# Reporting App — Deployment Guide

## Pre-Deployment Checklist

### 1. Install Dependencies
```bash
cd apps/reporting
pnpm install
```

### 2. Run Tests
```bash
cd apps/reporting
pnpm test
```

### 3. Build the App
```bash
pnpm build
```

## Database Setup

### 1. Apply Migration
```bash
cd packages/database
npx prisma migrate deploy
```

This creates the `EmployeePresence` table.

### 2. Verify Migration
```bash
npx prisma db inspect
```

## Deployment Steps

The app runs on port 3008 and includes:
- Employee dashboard with check-in/out and activity logging
- Manager dashboard for team oversight
- 8 REST API routes with Zod validation
- Vitest unit tests

## Next Steps

1. Run `pnpm test` in apps/reporting
2. Run `pnpm build` to verify production build
3. Apply migration with `prisma migrate deploy`
4. Deploy container

## Features

- ✅ Employee Dashboard: check-in/out, manual logging, activity tracking
- ✅ Manager Dashboard: team roster, activity details, verification
- ✅ Executive Dashboard: placeholder for KPIs
- ✅ API Routes: 8 endpoints for activity management
- ✅ Unit Tests: Vitest coverage for all routes