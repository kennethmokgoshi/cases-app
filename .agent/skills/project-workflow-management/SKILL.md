---
name: project-workflow-management
description: Guide for Git workflows, Agile practices, CI/CD, release management, and tech debt tracking. Use when: (1) Setting up CI/CD or branching strategies, (2) Planning sprints or estimating work, (3) Establishing code review practices, (4) Prioritizing backlogs, (5) Managing releases, (6) Tracking or paying down technical debt. Complements constraint-driven-development (CDD focuses on code quality, this focuses on delivery).
---

# Project Workflow Management — ZenoCasesSystem

## Recommended Stack (Pre-Selected for This Project)

| Practice | ZenoCases Config |
|----------|-----------------|
| **Git workflow** | GitHub Flow (feature branches → main) |
| **Commits** | Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`) |
| **Estimation** | Story points (Fibonacci: 1, 2, 3, 5, 8, 13) |
| **Sprint allocation** | 70% features, 20% bugs + tech debt, 10% buffer |
| **PR size** | Target < 400 lines per PR |
| **Review turnaround** | < 24 hours |
| **Tech debt budget** | 20% of sprint capacity |
| **Versioning** | Semantic Versioning (`MAJOR.MINOR.PATCH`) |

## Git Workflow: GitHub Flow

```
main (always deployable)
  │
  ├── feat/case-bulk-actions     → PR → merge to main
  ├── fix/dhs-login-timeout      → PR → merge to main
  └── chore/extract-shared-auth  → PR → merge to main
```

### Branch Naming
```
feat/<short-description>     # New features
fix/<short-description>      # Bug fixes
chore/<short-description>    # Tech debt, refactoring
docs/<short-description>     # Documentation changes
```

### Commit Messages (Conventional Commits)
```
feat: add bulk case status update endpoint
fix: handle DHS portal timeout during transfer check
chore: extract shared auth config to packages/shared-lib
docs: update ARCHITECTURE.md with new data flow
refactor: decompose dhs.ts into separate service files

BREAKING CHANGE: rename /api/cases POST body field
```

### Commit → Version Mapping
- `feat:` → bumps MINOR
- `fix:` → bumps PATCH
- `BREAKING CHANGE:` → bumps MAJOR

## Code Review Workflow

### Author Prepares PR
1. Self-review first (use CDD 4-persona checklist from `constraint-driven-development/SKILL.md`)
2. Keep under 400 lines
3. Write description with **what** and **why**
4. Link related issues
5. Ensure tests pass locally

### Reviewer Checks
- **Functionality**: Correct implementation, edge cases handled
- **Quality**: Clear naming, no unnecessary complexity (see `coding-standards/SKILL.md`)
- **Security**: Input validation, no secrets (see `security/SKILL.md`)
- **Tests**: Coverage for changes (see `testing/SKILL.md`)
- **Cross-app impact**: Does this touch shared code that affects all 5 apps?

### Comment Prefixes
```
[blocker]    - Must fix before merge
[suggestion] - Recommended improvement
[nit]        - Optional/cosmetic
[question]   - Seeking clarity
```

## CI/CD Pipeline (Target State)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: zenowethu_test
          POSTGRES_PASSWORD: testpass
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx prisma migrate deploy
      - name: Lint
        run: npx tsc --noEmit
      - name: Unit Tests
        run: npx vitest run --coverage
      - name: E2E Tests
        run: |
          npx playwright install --with-deps
          npx playwright test
```

## Sprint Planning

### Capacity Calculation
```
Available hours = team_size × hours_per_day × sprint_days × 0.8
```

### Backlog Prioritization (RICE)
```
RICE Score = (Reach × Impact × Confidence) / Effort

Reach:      How many users affected (1-10)
Impact:     How significant (1-5)
Confidence: How certain are estimates (0.5-1.0)
Effort:     Person-days required
```

### ZenoCases Tech Debt Priorities

| Priority | Item | Effort |
|----------|------|--------|
| 🔴 Immediate | Remove DB password from DEPLOYMENT.md | XS |
| 🔴 Immediate | Add Zod validation to all API routes | L |
| 🟡 Next sprint | Extract shared schema to `packages/database` | XL |
| 🟡 Next sprint | Extract shared auth to `packages/shared-lib` | L |
| 🟢 Quarterly | Decompose `dhs.ts` (2357 lines) | L |
| 🟢 Quarterly | Decompose `openai.ts` (832 lines) | M |
| 🟢 Quarterly | Add Vitest unit tests to all `lib/` files | XL |
| 🟢 Quarterly | Add Playwright E2E for critical paths | L |

## Release Management

### Docker Deploy Flow (Current)
```bash
ssh root@213.199.57.111
cd /opt/docker/zenowethu
git pull origin main
docker-compose build --no-cache
docker-compose up -d
docker system prune -f
```

### Future: Automated Deploy
```
main branch push → CI passes → Build Docker images → Deploy to Contabo
```

## Documentation Triggers

| Situation | Action |
|-----------|--------|
| Choosing between technologies | Write ADR (Architecture Decision Record) |
| Proposing major change | Write RFC for team discussion |
| Explaining setup/usage | Update README or relevant `docs/*.md` |
| Recording a decision | Write ADR |
