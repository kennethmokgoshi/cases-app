---
name: constraint-driven-development
description: A rigorous methodology for building software without incurring technical debt. Use this skill when: (1) Starting any new feature, (2) Writing or generating code, (3) Making architectural decisions, (4) Reviewing or refactoring code, (5) The user asks for "clean code", "maintainable code", or "production-ready code". Enforces quality through four constraint personas (Architect, Reviewer, Designer, Security Engineer) that must all approve before code is finalized.
---

# Constraint-Driven Development (CDD) — ZenoCasesSystem

Quality emerges from constraints, not willpower. Before writing ANY code, validate through four personas.

## The Four Constraint Personas

### 1. The Architect
**Enforces**: Elegance, simplicity, reusability.
**ZenoCases reference**: Read `/.agent/skills/architecture/SKILL.md` for monorepo rules.

Validates:
- Single Responsibility: Does each unit do exactly one thing?
- DRY: Is there duplication? → Move to `packages/` (never copy across apps)
- KISS: Is this the simplest solution that works?
- YAGNI: Are we building only what's needed now?

**Blocks when**: Solution creates cross-app duplication, over-engineers, or violates SOLID.

### 2. The Reviewer
**Enforces**: Legibility and maintainability.
**ZenoCases reference**: Read `/.agent/skills/coding-standards/SKILL.md` for naming conventions and type rules.

Validates:
- Can a developer understand this in 10 seconds?
- Are names self-documenting?
- Is the control flow obvious?
- Would this pass a code review without comments?

**Blocks when**: Code requires mental gymnastics, uses obscure patterns, or has functions > 50 lines.

### 3. The Designer
**Enforces**: Interface consistency and UX.
**ZenoCases reference**: Read `/.agent/skills/design/SKILL.md` for component patterns and color system.

Validates:
- Does this follow established patterns in the codebase?
- Is the API/interface intuitive?
- Are error messages helpful to end users?
- Does this maintain Tailwind v4 design tokens?

**Blocks when**: Interface inconsistent, UX degraded, or uses non-standard components.

### 4. The Security Engineer
**Enforces**: Paranoia on all inputs and operations.
**ZenoCases reference**: Read `/.agent/skills/security/SKILL.md` for auth patterns and POPIA checklist.

Validates:
- All inputs validated with Zod at system boundaries?
- No injection vectors (SQL, XSS)?
- Secrets properly managed (not hardcoded)?
- B2B data isolation enforced (projectId filtering)?
- Error messages don't leak internal details?

**Blocks when**: Unvalidated input, exposed secrets, missing RBAC check, or POPIA violation.

## The CDD Workflow

### Phase 1: Intent Declaration
```
INTENT: [What problem are we solving?]
SCOPE: [What is in/out of scope?]
CONSTRAINTS: [Technical/business constraints?]
```

### Phase 2: Design Validation
Run through all four personas:
```
ARCHITECT CHECK:
- Simplest solution? [Yes/No + reasoning]
- No cross-app duplication? [Yes/No]

REVIEWER CHECK:
- Understandable in 10 seconds? [Yes/No]
- Follows naming conventions? [Yes/No]

DESIGNER CHECK:
- Follows existing component patterns? [Yes/No]
- Uses Tailwind design tokens? [Yes/No]

SECURITY CHECK:
- All inputs Zod-validated? [Yes/No]
- B2B isolation maintained? [Yes/No]
```

### Phase 3: Implementation
Only proceed when ALL checks pass. Write code that:
- Solves exactly the stated problem
- Adds nothing beyond requirements
- Follows existing codebase conventions
- Includes Vitest tests for new logic

### Phase 4: Post-Implementation Verification
Re-run all four persona checks on actual implementation, then:

**Auto-Test (mandatory):**
- Write Vitest unit tests for every new function/route (`foo.ts` → `foo.test.ts`)
- Minimum: happy path + one error case
- Run tests and confirm they pass

**Auto-Document (mandatory):**
- Update `/STATUS.md` — move completed items, add dated entry, update module %
- If you discovered new issues, add them to "What's Next"

## Quality Gates (Non-Negotiable)

### Gate 1: No Speculative Code
- Never add "might need later" features
- No commented-out code
- No unused imports, variables, or functions

### Gate 2: No Premature Abstraction
- Three similar occurrences before abstracting
- Direct code > indirection for one-time operations
- Concrete implementations before interfaces

### Gate 3: Defensive Only at Boundaries
- Validate at API route entry points (Zod)
- Trust Prisma types internally
- Don't defensively check impossible states

### Gate 4: Minimal Surface Area
- Private by default, public with justification
- Fewer parameters > more parameters
- Smaller interfaces > larger interfaces

### Gate 5: Error Handling That Helps
- Errors must be actionable
- Include what went wrong AND how to fix
- Don't swallow exceptions silently
- Log with structured context, not just stack traces

## Anti-Patterns to Block

| Category | Anti-Patterns |
|----------|--------------|
| **Architectural** | God classes/functions, circular deps, hardcoded config, tight coupling |
| **Code** | Magic numbers, copy-paste duplication, deep nesting (>3 levels) |
| **Process** | Skipping tests, TODO without tickets, inconsistent naming |
| **Security** | String-concatenated queries, unsanitized input, hardcoded credentials |

## Quick Reference Checklist

Before committing ANY code:
```
[ ] Intent clearly stated and scoped
[ ] Simplest solution that works
[ ] Each unit does one thing
[ ] Understandable in 10 seconds
[ ] Follows codebase conventions
[ ] All inputs validated at boundaries (Zod)
[ ] No speculative/unused code
[ ] No premature abstractions
[ ] Error handling is helpful
[ ] Tests cover the requirements
[ ] No cross-app code duplication
```
