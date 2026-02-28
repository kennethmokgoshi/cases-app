# ZenoCasesSystem — Security Specification

## 1. Authentication

### Architecture
- **Provider**: NextAuth.js v5 (beta.30) with CredentialsProvider
- **Strategy**: JWT tokens stored in HTTP-only cookies
- **SSO**: Cookies scoped to `.zenowethu.co.za` domain for cross-app auth
- **Password hashing**: bcryptjs with 10 salt rounds minimum

### Session Token Claims
```typescript
{
  id: string;          // User CUID
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'MEMBER';
  isAdmin: boolean;
  isManager: boolean;
  userType: 'STAFF' | 'B2B_PARTNER';
  b2bPartnerId: string | null;
  avatarUrl: string | null;
}
```

### Security Controls
- Account locking after failed attempts (`isLocked` field)
- Active/inactive user status (`isActive` field)
- Session expiry configured in NextAuth config
- CSRF token validation on form submissions

---

## 2. Authorization (RBAC)

### Role Hierarchy
```
ADMIN > MANAGER > MEMBER
```

### Resource Access Matrix

| Resource | ADMIN | MANAGER | MEMBER | B2B_PARTNER |
|----------|-------|---------|--------|-------------|
| View all cases | ✅ | ✅ | ❌ (own only) | ❌ (partner's only) |
| Create case | ✅ | ✅ | ✅ | ✅ |
| Delete case | ✅ | ❌ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ |
| System settings | ✅ | ❌ | ❌ | ❌ |
| API keys | ✅ | ✅ | ❌ | ❌ |
| Reports | ✅ | ✅ | Limited | Partner's only |
| DHS operations | ✅ | ✅ | ✅ | ❌ |
| Project management | ✅ | ✅ | View | ❌ |
| Bulk operations | ✅ | ✅ | ❌ | ❌ |

### B2B Data Isolation
B2B partners MUST only see cases linked to their `projectId`. Every query for B2B users must include:
```typescript
if (session.user.userType === 'B2B_PARTNER') {
  where.projectId = session.user.b2bPartnerId;
}
```

---

## 3. Input Validation

### Mandatory Zod Validation
Every API route MUST validate inputs with Zod schemas. See `/.agent/skills/security/SKILL.md` for patterns.

### Common Attack Vectors to Prevent

| Attack | Prevention |
|--------|-----------|
| SQL Injection | Prisma parameterized queries (automatic) |
| XSS | React auto-escaping + CSP headers |
| CSRF | NextAuth CSRF tokens |
| Path Traversal | Validate file paths, use `path.basename()` |
| File Upload | Whitelist MIME types, enforce size limits |
| Mass Assignment | Zod schema → only validated fields pass through |
| Broken Auth | Session validation on every API route |
| IDOR | Always filter by user's permissions, not just by ID |

---

## 4. Secrets Management

### Environment Variables (Required)
```
DATABASE_URL          — PostgreSQL connection string
NEXTAUTH_SECRET       — JWT signing secret (MUST be identical across all 5 apps)
AUTH_SECRET           — Same as NEXTAUTH_SECRET
OPENAI_API_KEY        — OpenAI API key
SMTP_HOST/PORT/USER/PASS — Email server credentials
```

### Rules
1. **Never commit secrets** — All `.env` files must be in `.gitignore`
2. **No hardcoded credentials** — DEPLOYMENT.md currently contains DB password (MUST be removed)
3. **Database-stored secrets** — GHL API key and DHS credentials stored in `SystemSettings` table with `isEncrypted: true`
4. **Rotate regularly** — NextAuth secret and API keys should be rotated quarterly
5. **Production secrets** — Managed via Docker environment variables or hosting platform

---

## 5. POPIA Compliance

The Protection of Personal Information Act (POPIA) applies because the system processes SA consumer personal data.

### Data Categories Processed
| Category | Examples | Sensitivity |
|----------|---------|-------------|
| Identity | ID number, name, DOB | High |
| Contact | Phone, email, address | Medium |
| Financial | Salary, bank details, debt amounts | High |
| Legal | Court orders, judgments | High |
| Insurance | Policy numbers, premiums | Medium |

### Required Controls
- [ ] **Consent recording** — Track `consentGiven`, `consentDate`, `consentMethod` per client
- [ ] **Data access logging** — Audit trail for who accessed what data (via `WorkflowLog`)
- [ ] **Data export** — API endpoint for client data portability (POPIA right)
- [ ] **Data deletion** — Proper cascade delete when client requests removal
- [ ] **Data retention policy** — Define how long case data is kept after closure
- [ ] **Breach notification** — Process for reporting breaches within 72 hours
- [ ] **Data minimization** — Only collect fields necessary for service delivery

---

## 6. API Security

### Headers (Recommended)
```typescript
// next.config.ts
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline';" },
];
```

### Rate Limiting
- API routes: 60 requests/minute per IP
- Auth routes: 10 attempts/minute per IP
- File uploads: 10 uploads/minute per user
- DHS operations: 5 requests/minute (to avoid portal blocking)

### CORS
```typescript
// Only allow requests from Zenowethu subdomains in production
const allowedOrigins = [
  'https://cases.zenowethu.co.za',
  'https://insurance.zenowethu.co.za',
  'https://legal.zenowethu.co.za',
];
```

---

## 7. Known Vulnerabilities (To Fix)

| Issue | Severity | Status | Remediation |
|-------|----------|--------|-------------|
| DB password in DEPLOYMENT.md | 🔴 Critical | Open | Remove from file, rotate password |
| NextAuth v5 beta | 🔴 High | Open | Upgrade to stable release |
| No rate limiting | 🟡 Medium | Open | Add rate limit middleware |
| No CSP headers | 🟡 Medium | Open | Add via next.config.ts |
| No API input validation | 🟡 Medium | Open | Add Zod schemas to all routes |
| console.log with user data | 🟢 Low | Open | Replace with structured logging |
