# GitHub Secrets Configuration

This document lists all GitHub secrets used by the CI/CD pipeline.

## Required Secrets for Deployment

These secrets are **required** for the deployment job to work:

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `DOKPLOY_URL` | URL to your Dokploy instance | `http://213.199.57.111:3000` |
| `DOKPLOY_TOKEN` | API token for Dokploy | `your-dokploy-api-token` |
| `DOKPLOY_CASES_ID` | Application ID for cases app | `abc123def456` |
| `DOKPLOY_INSURANCE_ID` | Application ID for insurance app | `ghi789jkl012` |
| `DOKPLOY_LEGAL_ID` | Application ID for legal app | `mno345pqr678` |
| `DOKPLOY_FORENSIC_ID` | Application ID for forensic-audit app | `stu901vwx234` |
| `DOKPLOY_FINANCE_ID` | Application ID for finance app | `yza567bcd890` |
| `DATABASE_URL` | Production PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` |

## Optional Secrets

These secrets have fallback values and are **optional**:

| Secret Name | Description | Default/Fallback Value |
|------------|-------------|----------------------|
| `OPENAI_API_KEY` | OpenAI API key for AI features | `sk-test-key-placeholder` (tests will skip AI features) |

## E2E Test Configuration

E2E tests run automatically in CI with a PostgreSQL service. The following values are **hardcoded** in the workflow:

- **Database**: `postgresql://postgres:postgres@localhost:5432/zenowethu_test`
- **Test User**: `kenneth@zenowethu.co.za` (seeded from database)
- **Test Password**: `TestPassword123!`
- **Auth Secret**: `test-secret-min-32-chars-long-for-ci-testing-purposes-zenowethu`

## How to Configure Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each required secret with its value

## Security Notes

- Never commit secrets to the repository
- Secrets are encrypted and only accessible to GitHub Actions
- Use strong, unique values for production secrets
- Rotate secrets regularly (especially `DOKPLOY_TOKEN` and `DATABASE_URL`)
