---
name: database
description: Database management with Prisma including migration workflow, schema design patterns, indexing strategy, seed data, query optimization, and transaction handling
---

# Database Skill — ZenoCasesSystem

## Database Overview

- **Engine**: PostgreSQL (hosted on Contabo VPS, containerized with Docker)
- **ORM**: Prisma 5 (with Prisma Client for type-safe queries)
- **Schema**: 25+ models, 752 lines (currently duplicated across 5 apps — see Architecture skill)
- **Connection**: Shared single database across all 5 Next.js apps

## Migration Workflow

### Rule: Use `prisma migrate`, NOT `db push`

```bash
# ✅ CORRECT: Create a named migration
npx prisma migrate dev --name add_insurance_policy_status

# This creates:
# prisma/migrations/20260219_add_insurance_policy_status/migration.sql

# ✅ Apply to production
npx prisma migrate deploy

# ❌ WRONG: db push doesn't create migration files
npx prisma db push  # Only for rapid prototyping, NEVER production
```

### Migration Checklist

1. **Before migrating**: 
   - Backup the production database
   - Review the generated SQL in `migrations/` directory
   - Check for destructive changes (dropping columns, tables)

2. **Naming convention**: `add_<feature>`, `update_<model>_<field>`, `remove_<deprecated>`
   - Example: `add_case_priority_field`, `update_client_phone_format`, `remove_legacy_status`

3. **Destructive changes**:
   - ⚠️ Dropping a column → Create migration to add a backup column first
   - ⚠️ Renaming a column → Create in two steps (add new, migrate data, remove old)
   - ⚠️ Changing types → Ensure data compatibility

## Schema Design Patterns

### Model Template
```prisma
model EntityName {
  // === Identity ===
  id           String   @id @default(cuid())
  
  // === Core Fields ===
  name         String
  status       String   @default("ACTIVE")
  
  // === Relationships ===
  parentId     String?
  parent       ParentModel? @relation(fields: [parentId], references: [id])
  children     ChildModel[]
  
  // === Audit Fields (always include) ===
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  createdById  String?
  createdBy    User?    @relation("EntityCreator", fields: [createdById], references: [id])
  
  // === Indexes ===
  @@index([parentId])
  @@index([status])
  @@index([createdAt])
}
```

### Relationship Patterns

```prisma
// One-to-Many (most common)
model Client {
  id    String  @id @default(cuid())
  cases Case[]
}
model Case {
  id       String @id @default(cuid())
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  @@index([clientId])
}

// Many-to-Many (implicit)
model Case {
  tags Tag[]
}
model Tag {
  cases Case[]
}

// Self-referencing
model Comment {
  id       String    @id @default(cuid())
  parentId String?
  parent   Comment?  @relation("CommentReplies", fields: [parentId], references: [id])
  replies  Comment[] @relation("CommentReplies")
}
```

### Cascade Delete Strategy

```prisma
// Use onDelete: Cascade for child records that can't exist without parent
model Case {
  documents Document[]   // cascade delete documents when case deleted
  comments  CaseComment[] // cascade delete comments when case deleted
}

model Document {
  caseId String
  case   Case @relation(fields: [caseId], references: [id], onDelete: Cascade)
}

// Use onDelete: SetNull for optional relationships
model Case {
  assignedToId String?
  assignedTo   User? @relation(fields: [assignedToId], references: [id], onDelete: SetNull)
}
```

## Indexing Strategy

### When to Add Indexes

| Scenario | Index Type | Example |
|----------|-----------|---------|
| Frequently filtered field | Single | `@@index([status])` |
| Foreign key (always) | Single | `@@index([clientId])` |
| Combined filter + sort | Composite | `@@index([status, createdAt])` |
| Unique lookup | Unique | `@unique` on field |
| Full-text search | — | Consider PostgreSQL `tsvector` |

### Current Required Indexes

```prisma
model Case {
  @@index([status])
  @@index([clientId])
  @@index([assignedToId])
  @@index([projectId])
  @@index([createdAt])
  @@index([status, assignedToId])  // Dashboard: "my open cases"
  @@index([status, projectId])     // B2B: partner's cases by status
}

model Document {
  @@index([caseId])
  @@index([type])
}

model Payment {
  @@index([caseId])
  @@index([clientId])
  @@index([createdAt])
}
```

## Prisma Client Best Practices

### Singleton Pattern
```typescript
// lib/prisma.ts — ALWAYS use this pattern
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

### Transaction Patterns
```typescript
// Simple transaction: Multiple operations that must all succeed
const result = await prisma.$transaction(async (tx) => {
  const newCase = await tx.case.create({ data: caseData });
  
  await tx.workflowLog.create({
    data: {
      caseId: newCase.id,
      action: 'CASE_CREATED',
      performedById: userId,
    },
  });
  
  await tx.notification.create({
    data: {
      userId: assignedToId,
      type: 'CASE_ASSIGNED',
      message: `New case ${newCase.fileNumber} assigned to you`,
    },
  });
  
  return newCase;
});

// Batch transaction: Multiple independent queries (parallel execution)
const [cases, clients, payments] = await prisma.$transaction([
  prisma.case.findMany({ where: { status: 'ACTIVE' } }),
  prisma.client.count(),
  prisma.payment.aggregate({ _sum: { amount: true } }),
]);
```

### Raw Queries (use sparingly)
```typescript
// Only when Prisma's query builder is insufficient
// Always use parameterized queries to prevent SQL injection
const results = await prisma.$queryRaw`
  SELECT c.id, c."fileNumber", COUNT(d.id) as "documentCount"
  FROM "Case" c
  LEFT JOIN "Document" d ON d."caseId" = c.id
  WHERE c.status = ${status}
  GROUP BY c.id, c."fileNumber"
  HAVING COUNT(d.id) > ${minDocs}
`;
```

## Seed Data

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@zenowethu.co.za' },
    update: {},
    create: {
      email: 'admin@zenowethu.co.za',
      firstName: 'Admin',
      lastName: 'User',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  // Create default project
  await prisma.project.upsert({
    where: { name: 'Default' },
    update: {},
    create: {
      name: 'Default',
      description: 'Default project for walk-in clients',
    },
  });
  
  console.log('Seed completed');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Run seed:
```bash
npx prisma db seed
# Configured in package.json: "prisma": { "seed": "ts-node prisma/seed.ts" }
```

## Debugging Queries

Enable Prisma query logging in development:
```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'stdout', level: 'query' },   // Log all SQL
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' },
  ],
});
```

Use Prisma Studio for visual inspection:
```bash
npx prisma studio  # Opens browser GUI on http://localhost:5555
```
