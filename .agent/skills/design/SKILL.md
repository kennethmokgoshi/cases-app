---
name: design
description: Design system standards, Tailwind v4 patterns, component structure, responsive design, dark/light theme, and accessibility for ZenoCasesSystem
---

# Design Skill — ZenoCasesSystem

## Design System Overview

Zenowethu uses **Tailwind CSS v4** with a custom design token system. The UI should feel professional, modern, and appropriate for a financial services platform.

## Color Palette

### Brand Colors
```css
/* Defined in globals.css via CSS custom properties */
:root {
  --primary: #2563eb;         /* Blue — primary actions */
  --primary-hover: #1d4ed8;
  --secondary: #64748b;       /* Slate — secondary elements */
  --accent: #f59e0b;          /* Amber — highlights, warnings */
  --success: #10b981;         /* Emerald — success states */
  --danger: #ef4444;          /* Red — errors, destructive */
  --warning: #f59e0b;         /* Amber — warnings */
  --info: #3b82f6;            /* Blue — informational */
}
```

### Dark Mode
The app supports dark mode via `ThemeProvider`. Always use CSS variables, never hardcode colors:

```typescript
// ✅ CORRECT
<div className="bg-background text-foreground">
<div className="border-border">

// ❌ WRONG
<div className="bg-white text-black">  // Won't adapt to dark mode
```

## Typography

> **Also read**: `/.agent/skills/frontend-design/SKILL.md` for creative design guidelines.

### Font Strategy
- **New pages/components**: Use **Inter** via `next/font/google` for a modern, professional feel
- **Existing pages**: Maintain current system font stack for consistency; migrate incrementally

### Heading Hierarchy

| Element | Class | Usage |
|---------|-------|-------|
| Page title | `text-2xl font-bold` | Main page heading (h1) |
| Section title | `text-xl font-semibold` | Section headings (h2) |
| Card title | `text-lg font-medium` | Card/panel headings (h3) |
| Body text | `text-sm` | Standard body text |
| Caption | `text-xs text-muted-foreground` | Metadata, timestamps |

## Component Structure

### Standard Component Pattern

```typescript
// components/cases/CaseCard.tsx
interface CaseCardProps {
  caseData: Case;
  onStatusChange?: (newStatus: string) => void;
  className?: string;
}

export function CaseCard({ caseData, onStatusChange, className }: CaseCardProps) {
  return (
    <div className={`rounded-lg border bg-card p-4 shadow-sm ${className || ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{caseData.fileNumber}</h3>
        <StatusBadge status={caseData.status} />
      </div>
      {/* ... */}
    </div>
  );
}
```

### Component Rules

1. **Always type props** with an explicit interface (no inline types)
2. **Accept `className` prop** for composition flexibility
3. **Use semantic HTML** — `<button>` for actions, `<a>` for links, `<nav>` for navigation
4. **No inline styles** — Use Tailwind classes exclusively
5. **Keep components focused** — Max ~100 lines; extract sub-components if larger

## Responsive Design

### Breakpoints (Tailwind v4 defaults)
```
sm:  640px   — Mobile landscape
md:  768px   — Tablet
lg:  1024px  — Desktop
xl:  1280px  — Large desktop
2xl: 1536px  — Wide screen
```

### Mobile-First Pattern
```typescript
// ✅ CORRECT: Mobile-first, progressive enhancement
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// ❌ WRONG: Desktop-first, responsive override
<div className="grid grid-cols-3 sm:grid-cols-1">
```

### Required Responsive Behaviors
- **Sidebar** must collapse to a hamburger menu on mobile
- **Tables** must scroll horizontally on mobile or convert to card layout
- **Forms** must stack vertically on mobile
- **Modals** must be full-screen on mobile, centered on desktop
- **Navigation** must be accessible via bottom bar or hamburger on mobile

## Status Badge Colors

The app has 80+ statuses. Use consistent color coding:

| Category | Badge Color | Tailwind Class |
|----------|------------|---------------|
| INTAKE | Blue | `bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300` |
| DOCUMENTATION | Purple | `bg-purple-100 text-purple-800` |
| DHS | Orange | `bg-orange-100 text-orange-800` |
| PROCESSING | Cyan | `bg-cyan-100 text-cyan-800` |
| LEGAL | Indigo | `bg-indigo-100 text-indigo-800` |
| INSURANCE | Teal | `bg-teal-100 text-teal-800` |
| PAYMENT | Green | `bg-green-100 text-green-800` |
| FOLLOW_UP | Yellow | `bg-yellow-100 text-yellow-800` |
| INACTIVE | Gray | `bg-gray-100 text-gray-800` |
| COMPLETE | Emerald | `bg-emerald-100 text-emerald-800` |

## Accessibility (WCAG 2.1 AA)

1. **Color contrast**: Minimum 4.5:1 for text, 3:1 for large text
2. **Focus indicators**: All interactive elements must have visible focus rings
3. **Alt text**: All images must have descriptive alt text
4. **Keyboard navigation**: All features must be accessible via keyboard
5. **ARIA labels**: All icon-only buttons must have `aria-label`
6. **Form labels**: Every form input must have an associated `<label>`

```typescript
// ✅ CORRECT: Icon button with aria-label
<button aria-label="Delete case" onClick={handleDelete}>
  <TrashIcon className="h-4 w-4" />
</button>

// ❌ WRONG: No accessibility
<button onClick={handleDelete}>
  <TrashIcon className="h-4 w-4" />
</button>
```

## Loading & Empty States

Every data-fetching component must handle these states:

```typescript
// Standard loading skeleton
<div className="animate-pulse space-y-3">
  <div className="h-4 bg-muted rounded w-3/4" />
  <div className="h-4 bg-muted rounded w-1/2" />
</div>

// Empty state with call-to-action
<div className="flex flex-col items-center justify-center py-12 text-center">
  <EmptyIcon className="h-12 w-12 text-muted-foreground mb-4" />
  <h3 className="text-lg font-medium">No cases found</h3>
  <p className="text-sm text-muted-foreground mt-1">Create a new case to get started</p>
  <Button className="mt-4">Create Case</Button>
</div>
```

## Animation Guidelines

- Use CSS transitions for state changes (hover, focus, active)
- Keep durations short: 150ms for micro-interactions, 300ms for layout changes
- Use `transform` and `opacity` for smooth animations (GPU-accelerated)
- Respect `prefers-reduced-motion` for accessibility
