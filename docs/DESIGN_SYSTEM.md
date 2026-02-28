# ZenoCasesSystem — Design System

## 1. Technology

- **CSS Framework**: Tailwind CSS v4
- **Icons**: Lucide React
- **Theme**: Dark/Light mode via `ThemeProvider` (React Context)
- **Approach**: Utility-first with component patterns

## 2. Color System

### Semantic Colors (CSS Custom Properties)

```css
:root {
  /* Primary actions */
  --primary: 221 83% 53%;        /* #2563eb — Blue */
  --primary-foreground: 0 0% 100%;

  /* Surfaces */
  --background: 0 0% 100%;       /* White (light) / Dark gray (dark) */
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;

  /* Borders & muted */
  --border: 214 32% 91%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;

  /* Status colors */
  --success: 160 84% 39%;        /* #10b981 — Emerald */
  --warning: 38 92% 50%;         /* #f59e0b — Amber */
  --danger: 0 84% 60%;           /* #ef4444 — Red */
  --info: 217 91% 60%;           /* #3b82f6 — Blue */
}

.dark {
  --background: 222 47% 11%;
  --foreground: 210 40% 98%;
  --card: 217 33% 17%;
  --border: 217 33% 25%;
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 65%;
}
```

### Status Badge Colors

| Category | Light Mode | Dark Mode |
|----------|-----------|-----------|
| INTAKE | `bg-blue-100 text-blue-800` | `bg-blue-900 text-blue-300` |
| DOCUMENTATION | `bg-purple-100 text-purple-800` | `bg-purple-900 text-purple-300` |
| DHS | `bg-orange-100 text-orange-800` | `bg-orange-900 text-orange-300` |
| PROCESSING | `bg-cyan-100 text-cyan-800` | `bg-cyan-900 text-cyan-300` |
| LEGAL | `bg-indigo-100 text-indigo-800` | `bg-indigo-900 text-indigo-300` |
| INSURANCE | `bg-teal-100 text-teal-800` | `bg-teal-900 text-teal-300` |
| PAYMENT | `bg-green-100 text-green-800` | `bg-green-900 text-green-300` |
| FOLLOW_UP | `bg-yellow-100 text-yellow-800` | `bg-yellow-900 text-yellow-300` |
| INACTIVE | `bg-gray-100 text-gray-800` | `bg-gray-900 text-gray-300` |
| COMPLETE | `bg-emerald-100 text-emerald-800` | `bg-emerald-900 text-emerald-300` |

## 3. Typography

### Font Stack
System font stack — no custom fonts required:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

### Scale
| Level | Class | Size | Weight | Usage |
|-------|-------|------|--------|-------|
| H1 | `text-2xl font-bold` | 24px | 700 | Page titles |
| H2 | `text-xl font-semibold` | 20px | 600 | Section headings |
| H3 | `text-lg font-medium` | 18px | 500 | Card/panel titles |
| Body | `text-sm` | 14px | 400 | Standard text |
| Caption | `text-xs text-muted-foreground` | 12px | 400 | Metadata, timestamps |
| Label | `text-sm font-medium` | 14px | 500 | Form labels |

## 4. Spacing & Layout

### Grid System
```typescript
// Page layout: sidebar + main content
<div className="flex h-screen">
  <Sidebar className="w-64 shrink-0" />
  <main className="flex-1 overflow-auto p-6">
    {children}
  </main>
</div>

// Content grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

### Spacing Scale (Tailwind defaults)
- `p-2` (8px) — Compact elements
- `p-4` (16px) — Card padding
- `p-6` (24px) — Page padding
- `gap-4` (16px) — Between cards
- `space-y-4` — Stacked form fields

## 5. Component Patterns

### Card
```typescript
<div className="rounded-lg border bg-card p-4 shadow-sm">
  <h3 className="text-lg font-medium">{title}</h3>
  <p className="text-sm text-muted-foreground mt-1">{description}</p>
</div>
```

### Button Variants
```typescript
// Primary action
<button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors">

// Secondary
<button className="border border-border bg-background px-4 py-2 rounded-md hover:bg-muted transition-colors">

// Destructive
<button className="bg-danger text-white px-4 py-2 rounded-md hover:bg-danger/90 transition-colors">

// Ghost
<button className="hover:bg-muted px-4 py-2 rounded-md transition-colors">
```

### Modal
```typescript
// Overlay + centered content
<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
  <div className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
    {/* Modal content */}
  </div>
</div>
```

### Data Table
```typescript
<div className="rounded-lg border overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-muted">
      <tr>
        <th className="px-4 py-3 text-left font-medium">Column</th>
      </tr>
    </thead>
    <tbody className="divide-y">
      <tr className="hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3">{value}</td>
      </tr>
    </tbody>
  </table>
</div>
```

## 6. Responsive Breakpoints

| Breakpoint | Min Width | Usage |
|-----------|----------|-------|
| Default | 0px | Mobile (phone portrait) |
| `sm:` | 640px | Mobile landscape |
| `md:` | 768px | Tablet |
| `lg:` | 1024px | Desktop |
| `xl:` | 1280px | Large desktop |

### Key Responsive Behaviors
- **Sidebar**: Full on `lg:`, collapsed to hamburger on mobile
- **Tables**: Horizontal scroll wrapper on mobile
- **Cards**: 1 col → 2 col (md:) → 3 col (lg:)
- **Modals**: Full-screen on mobile, centered on desktop

## 7. Accessibility

### Requirements (WCAG 2.1 AA)
- Color contrast: 4.5:1 minimum for text
- Focus rings: Visible on all interactive elements (`ring-2 ring-primary ring-offset-2`)
- Alt text: All images and icons
- Keyboard navigation: Tab order, Enter/Space activation
- ARIA labels: Icon-only buttons, dynamic content
- Form labels: Every input has an associated `<label>`
- Error states: Announced to screen readers

## 8. Animations

### Transition Defaults
```css
/* Micro-interactions */
transition-colors  → 150ms ease
transition-opacity → 150ms ease

/* Layout changes */
transition-all     → 300ms ease

/* Page transitions */
animate-in         → 200ms ease fade-in + slide-in
```

### Motion Sensitivity
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
