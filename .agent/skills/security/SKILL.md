---
name: security
description: Security standards, authentication patterns, authorization, input validation, POPIA compliance, and secrets management for ZenoCasesSystem
---

# Security Skill — ZenoCasesSystem

## Authentication Architecture

### Current: NextAuth v5 (Beta) with JWT SSO

All 5 apps share a single authentication system using JWT cookies on `.zenowethu.co.za`:

```typescript
// Cookie names in production:
// __Secure-authjs.session-token  (HTTP-only, Secure, SameSite=Lax)
// __Secure-authjs.callback-url
// __Host-authjs.csrf-token

// All apps MUST use the same NEXTAUTH_SECRET / AUTH_SECRET
```

### Session Token Contents
The JWT token includes:
- `id` — User CUID
- `email`, `firstName`, `lastName`
- `role` — ADMIN | MANAGER | MEMBER
- `isAdmin`, `isManager` — Derived booleans
- `userType` — STAFF | B2B_PARTNER
- `b2bPartnerId` — Partner project ID (null for staff)
- `avatarUrl`

### Authentication Rules

1. **All API routes MUST check authentication**:
```typescript
// ✅ CORRECT: Always verify session
import { auth } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... route logic
}
```

2. **Never trust client-side role checks alone** — Always verify server-side
3. **B2B users** must only see their own partner's data (filter by `b2bPartnerId`)

## Authorization Matrix

| Resource | ADMIN | MANAGER | MEMBER | B2B_PARTNER |
|----------|-------|---------|--------|-------------|
| All cases | ✅ | ✅ | Own only | Partner's only |
| Create case | ✅ | ✅ | ✅ | ✅ (own partner) |
| Delete case | ✅ | ❌ | ❌ | ❌ |
| User management | ✅ | ❌ | ❌ | ❌ |
| System settings | ✅ | ❌ | ❌ | ❌ |
| API keys | ✅ | ✅ | ❌ | ❌ |
| Reports | ✅ | ✅ | Limited | Partner's only |
| DHS operations | ✅ | ✅ | ✅ | ❌ |
| Project management | ✅ | ✅ | View only | ❌ |

### RBAC Middleware Pattern

```typescript
// lib/api-auth.ts — Use this for all protected API routes
import { auth } from './auth';

type Role = 'ADMIN' | 'MANAGER' | 'MEMBER';

export async function requireAuth(requiredRole?: Role) {
  const session = await auth();
  
  if (!session?.user) {
    throw new AuthError('Unauthorized', 401);
  }
  
  if (requiredRole) {
    const roleHierarchy: Record<Role, number> = {
      'ADMIN': 3,
      'MANAGER': 2, 
      'MEMBER': 1,
    };
    
    const userLevel = roleHierarchy[session.user.role as Role] || 0;
    const requiredLevel = roleHierarchy[requiredRole];
    
    if (userLevel < requiredLevel) {
      throw new AuthError('Forbidden', 403);
    }
  }
  
  return session;
}
```

## Input Validation — Zod Schemas

**Every API route MUST validate its inputs with Zod.** Never access `req.body` or query params without validation.

```typescript
import { z } from 'zod';

// ✅ CORRECT: Define schema, validate, use typed result
const CreateCaseSchema = z.object({
  clientId: z.string().cuid(),
  status: z.string().min(1).max(50),
  serviceFee: z.number().positive().optional(),
  acquisitionType: z.enum(['B2C', 'B2B']),
});

export async function POST(req: Request) {
  const session = await requireAuth();
  const body = await req.json();
  
  const result = CreateCaseSchema.safeParse(body);
  if (!result.success) {
    return Response.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    );
  }
  
  // result.data is now fully typed
  const newCase = await prisma.case.create({ data: result.data });
}

// ❌ WRONG: No validation
export async function POST(req: Request) {
  const body = await req.json();
  const newCase = await prisma.case.create({ data: body }); // DANGEROUS
}
```

### Common Zod Patterns for This Project

```typescript
// South African ID number (13 digits)
const saIdNumber = z.string().regex(/^\d{13}$/, 'Must be a valid 13-digit SA ID number');

// File number pattern
const fileNumber = z.string().regex(/^ZEN-\d+$/, 'Must match ZEN-XXXXX pattern');

// Phone number (SA format)
const saPhone = z.string().regex(/^(\+27|0)\d{9}$/, 'Must be a valid SA phone number');

// Decimal money
const money = z.number().min(0).multipleOf(0.01);

// Status code (from statuses.ts)
const statusCode = z.string().min(1).max(50);
```

## Secrets Management

### Rules

1. **NEVER commit secrets to the repository** — Use `.env` files only
2. **All `.env` files MUST be in `.gitignore`**
3. **Production secrets** are managed via Docker environment variables or Dokploy
4. **API keys in database** (`ApiKey` model) must be hashed before storage
5. **Password hashing**: Always use `bcryptjs` with minimum 10 salt rounds

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Auth (MUST be identical across all 5 apps for SSO)
NEXTAUTH_SECRET=<random-32-char-string>
AUTH_SECRET=<same-as-NEXTAUTH_SECRET>
AUTH_TRUST_HOST=true

# OpenAI
OPENAI_API_KEY=sk-...

# Email (Nodemailer)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=<password>

# GoHighLevel CRM (stored in SystemSettings DB table)
# GHL_API_KEY and GHL_LOCATION_ID are fetched from database, not .env
```

## POPIA Compliance (SA Privacy Law)

The Protection of Personal Information Act requires:

1. **Data minimization** — Only collect data necessary for debt counselling
2. **Consent** — Record consent for data processing (e.g., `consentGiven`, `consentDate`, `consentMethod` fields)
3. **Right to access** — Clients can request their data (implement export endpoint)
4. **Right to deletion** — Clients can request data deletion (implement with cascading deletes)
5. **Data breach notification** — Report breaches within 72 hours
6. **Cross-border transfers** — Data must stay in SA or have adequate protection

### Implementation Checklist
- [ ] Ensure all client data access is logged (audit trail via `WorkflowLog`)
- [ ] Add data export API endpoint for client data
- [ ] Add data deletion API endpoint (with proper cascade)
- [ ] Encrypt sensitive fields at rest where appropriate (`isEncrypted` in `SystemSettings`)
- [ ] Add consent tracking to all client-facing forms

## API Security Checklist

For every new API route, verify:

- [ ] Authentication checked (`requireAuth()`)
- [ ] Authorization checked (role-based access)
- [ ] Input validated with Zod schema
- [ ] SQL injection prevented (Prisma handles this, but verify raw queries)
- [ ] File uploads validated (type, size, content)
- [ ] Rate limiting applied (use middleware)
- [ ] Error responses don't leak internal details
- [ ] CORS configured properly
- [ ] Response headers include security headers (CSP, X-Frame-Options, etc.)
