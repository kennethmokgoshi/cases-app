---
name: caching
description: Caching strategy covering Next.js data caching, React Server Components, Prisma query optimization, API response caching, and client-side state management
---

# Caching Skill — ZenoCasesSystem

## Caching Layers

```
Browser Cache (HTTP headers)
    ↓
Next.js Route Cache (App Router)
    ↓
React Server Component Cache (RSC payload)
    ↓
Data Cache (fetch/Prisma results)
    ↓
PostgreSQL Query Cache
```

## 1. Next.js App Router Caching

### Route Segment Config

```typescript
// Static page (cached at build time)
export const dynamic = 'force-static';
export const revalidate = 3600; // Revalidate every hour

// Dynamic page (never cached, always fresh)
export const dynamic = 'force-dynamic';

// Hybrid: cached but revalidated on demand
export const revalidate = 60; // Revalidate every 60 seconds
```

### When to Use Each Strategy

| Route Type | Strategy | Revalidation |
|-----------|----------|-------------|
| Login page | `force-static` | Never (static HTML) |
| Dashboard | `force-dynamic` | Always fresh (user-specific) |
| Case detail | `force-dynamic` | Always fresh (real-time data) |
| Reports page | ISR (`revalidate: 300`) | Every 5 minutes |
| Settings page | `force-dynamic` | User-specific |
| Status list/config | ISR (`revalidate: 3600`) | Hourly |
| Public pages | `force-static` | At build time |

### API Route Caching

```typescript
// API routes: Set cache headers explicitly
export async function GET(req: Request) {
  const data = await fetchReportData();
  
  return Response.json(data, {
    headers: {
      // Cache for 5 minutes, stale-while-revalidate for 1 hour
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}

// ❌ NEVER cache user-specific or authenticated data publicly
// Use 'private' for authenticated responses
return Response.json(data, {
  headers: {
    'Cache-Control': 'private, no-store',
  },
});
```

## 2. Prisma Query Optimization

### Use `select` to Limit Fields
```typescript
// ✅ GOOD: Only fetch needed fields
const cases = await prisma.case.findMany({
  select: {
    id: true,
    fileNumber: true,
    status: true,
    client: {
      select: { firstName: true, lastName: true }
    },
  },
  where: { assignedToId: userId },
  orderBy: { updatedAt: 'desc' },
  take: 20,
});

// ❌ BAD: Fetching everything
const cases = await prisma.case.findMany({
  include: { client: true, documents: true, payments: true },
});
```

### Pagination Pattern
```typescript
// Cursor-based pagination (preferred for large datasets)
const cases = await prisma.case.findMany({
  take: 20,
  skip: cursor ? 1 : 0,
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: 'desc' },
  select: { id: true, fileNumber: true, status: true },
});

// Offset-based pagination (simpler, for smaller datasets)
const page = parseInt(searchParams.get('page') || '1');
const pageSize = 20;
const cases = await prisma.case.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: 'desc' },
});
```

### Batch Queries with `$transaction`
```typescript
// ✅ GOOD: Single transaction for related queries
const [cases, totalCount, statusCounts] = await prisma.$transaction([
  prisma.case.findMany({ where: filters, take: 20 }),
  prisma.case.count({ where: filters }),
  prisma.case.groupBy({ by: ['status'], _count: true }),
]);
```

### Database Indexes
Ensure frequently queried fields have indexes in `schema.prisma`:

```prisma
model Case {
  // ... fields
  
  @@index([status])            // Status filtering
  @@index([assignedToId])      // User's cases
  @@index([clientId])          // Client's cases
  @@index([createdAt])         // Date sorting
  @@index([projectId])         // B2B partner filtering
  @@index([status, assignedToId]) // Combined filter
}
```

## 3. Client-Side State Management

### React Context for Global State
```typescript
// Use React Context for UI state that doesn't need server sync:
// - Theme preference (dark/light)
// - Sidebar collapsed state
// - Active filters
// - Toast notifications

// ❌ Do NOT use React Context for:
// - Case data (use server components)
// - User session (use NextAuth)
// - Form state (use local component state)
```

### SWR / Fetch Caching for Client Components
```typescript
// For client components that need real-time data:
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

function CaseDashboard() {
  const { data, error, isLoading, mutate } = useSWR('/api/cases', fetcher, {
    refreshInterval: 30000,    // Refresh every 30s
    revalidateOnFocus: true,   // Refresh when tab regains focus
    dedupingInterval: 5000,    // Dedupe requests within 5s
  });
  
  // After mutation, revalidate:
  const handleStatusChange = async (id: string, status: string) => {
    await fetch(`/api/cases/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    mutate(); // Revalidate the cache
  };
}
```

## 4. Static Asset Caching

### Next.js Static Files
Next.js automatically adds cache headers to files in `public/` and `_next/static/`:
- `_next/static/**` → `Cache-Control: public, max-age=31536000, immutable`
- `public/**` → Needs explicit configuration

### Image Optimization
```typescript
// Use Next.js Image component for automatic optimization
import Image from 'next/image';

<Image 
  src="/logo.png" 
  width={200} 
  height={50} 
  alt="Zenowethu logo"
  priority  // For above-the-fold images
/>
```

## 5. Cache Invalidation Patterns

### On Data Mutation
```typescript
// After creating/updating/deleting data, revalidate related caches:
import { revalidatePath, revalidateTag } from 'next/cache';

export async function POST(req: Request) {
  const newCase = await prisma.case.create({ data });
  
  // Revalidate the cases list page
  revalidatePath('/cases');
  
  // Or revalidate by tag
  revalidateTag('cases');
  
  return Response.json(newCase, { status: 201 });
}
```

### Cache-Busting for Stale Data
If users report seeing stale data:
1. Check `revalidate` settings on the route
2. Ensure mutations call `revalidatePath` or `revalidateTag`
3. For real-time needs, use `force-dynamic`
4. For client-side, ensure SWR/fetch is configured to refresh

## Performance Targets

| Metric | Target | Measured By |
|--------|--------|------------|
| Dashboard load (TTFB) | < 500ms | Server response time |
| Case list API | < 200ms | API response time |
| Search results | < 300ms | API response time |
| Static page load | < 100ms | Cached response |
| Database query (simple) | < 50ms | Prisma query log |
| Database query (complex) | < 200ms | Prisma query log |
