---
name: api-development
description: API route development patterns for Next.js App Router including validation, authentication, pagination, file uploads, and error response format
---

# API Development Skill — ZenoCasesSystem

## API Route Structure

All API routes use the Next.js App Router convention:

```
app/api/
├── auth/
│   └── [...nextauth]/route.ts    # NextAuth handler
├── cases/
│   ├── route.ts                  # GET (list), POST (create)
│   └── [id]/
│       ├── route.ts              # GET (detail), PUT (update), DELETE
│       ├── status/route.ts       # PATCH (status change)
│       └── documents/route.ts    # GET/POST (case documents)
├── clients/
│   ├── route.ts
│   └── [id]/route.ts
├── users/
│   ├── route.ts
│   └── [id]/route.ts
└── upload/route.ts               # File uploads
```

## Standard API Route Template

Every API route must follow this structure:

```typescript
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// 1. Define Zod schemas
const QuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  status: z.string().optional(),
  search: z.string().optional(),
});

const CreateSchema = z.object({
  clientId: z.string().cuid(),
  status: z.string().default('INTAKE_NEW'),
  notes: z.string().max(5000).optional(),
});

// 2. GET handler — List with pagination & filtering
export async function GET(req: Request) {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse & validate query params
    const { searchParams } = new URL(req.url);
    const query = QuerySchema.parse(Object.fromEntries(searchParams));

    // Build Prisma where clause
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { fileNumber: { contains: query.search, mode: 'insensitive' } },
        { client: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { client: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    // B2B filtering
    if (session.user.userType === 'B2B_PARTNER') {
      where.projectId = session.user.b2bPartnerId;
    }

    // Execute paginated query
    const [items, total] = await prisma.$transaction([
      prisma.case.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fileNumber: true,
          status: true,
          createdAt: true,
          client: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.case.count({ where }),
    ]);

    return Response.json({
      data: items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Validation failed', details: error.flatten() },
        { status: 400 }
      );
    }
    console.error('GET /api/cases error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 3. POST handler — Create
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validated = CreateSchema.safeParse(body);

    if (!validated.success) {
      return Response.json(
        { error: 'Validation failed', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const newItem = await prisma.case.create({
      data: {
        ...validated.data,
        createdById: session.user.id,
      },
    });

    return Response.json(newItem, { status: 201 });
  } catch (error) {
    console.error('POST /api/cases error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Standard Response Formats

### Success (Single Item)
```json
{
  "id": "clx...",
  "fileNumber": "ZEN-001",
  "status": "INTAKE_NEW"
}
```

### Success (List with Pagination)
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Error
```json
{
  "error": "Validation failed",
  "details": {
    "fieldErrors": {
      "clientId": ["Invalid cuid"]
    },
    "formErrors": []
  }
}
```

### HTTP Status Codes

| Code | When |
|------|------|
| `200` | Successful GET/PUT/PATCH |
| `201` | Successful POST (created) |
| `204` | Successful DELETE (no content) |
| `400` | Validation error, malformed request |
| `401` | Not authenticated |
| `403` | Authenticated but not authorized |
| `404` | Resource not found |
| `409` | Conflict (e.g., duplicate) |
| `429` | Rate limited |
| `500` | Internal server error |

## Dynamic Route Params

```typescript
// app/api/cases/[id]/route.ts
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const caseRecord = await prisma.case.findUnique({
    where: { id },
    include: { client: true, documents: true },
  });
  
  if (!caseRecord) {
    return Response.json({ error: 'Case not found' }, { status: 404 });
  }
  
  return Response.json(caseRecord);
}
```

## File Upload Pattern

```typescript
// app/api/upload/route.ts
import { writeFile } from 'fs/promises';
import path from 'path';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const caseId = formData.get('caseId') as string;

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: 'Invalid file type' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  // Save file
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const fileName = `${Date.now()}-${file.name}`;
  const filePath = path.join(process.cwd(), 'uploads', fileName);
  await writeFile(filePath, buffer);

  // Create DB record
  const doc = await prisma.document.create({
    data: {
      caseId,
      fileName: file.name,
      fileUrl: `/uploads/${fileName}`,
      fileSize: file.size,
      mimeType: file.type,
      uploadedById: session.user.id,
    },
  });

  return Response.json(doc, { status: 201 });
}
```

## Rate Limiting Pattern

```typescript
// lib/rate-limit.ts
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(ip: string, limit: number = 60, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false; // Rate limited
  }
  
  record.count++;
  return true;
}

// Usage in API route:
const ip = req.headers.get('x-forwarded-for') || 'unknown';
if (!rateLimit(ip, 30)) {
  return Response.json({ error: 'Too many requests' }, { status: 429 });
}
```
