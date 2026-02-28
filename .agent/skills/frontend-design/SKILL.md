---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when building web components, pages, dashboards, or any UI work in the ZenoCasesSystem apps. Generates creative, polished code that avoids generic AI aesthetics while maintaining ZenoCases design tokens.
---

# Frontend Design Skill — ZenoCasesSystem

Create distinctive, production-grade interfaces. Avoid generic "AI slop" aesthetics.

> **Also read**: `/.agent/skills/design/SKILL.md` for ZenoCases tokens, colors, and responsive breakpoints.

## Design Thinking Process

Before coding any UI, understand context and commit to an aesthetic direction:

1. **Purpose**: What problem does this interface solve? Who uses it?
2. **Tone**: This is a professional B2B debt counselling platform — refined, trustworthy, efficient
3. **Constraints**: Tailwind v4, React 19, dark/light mode, WCAG 2.1 AA
4. **Differentiation**: What makes this page memorable? What's the one thing someone will remember?

## Typography Guidelines

### For New Pages/Components
- **Headings**: Use **Inter** or **Outfit** (via Google Fonts) for a modern, professional feel
- **Body**: Use **Inter** for consistency across the platform
- **Import**: Add to root layout if not already present:
  ```typescript
  import { Inter } from 'next/font/google';
  const inter = Inter({ subsets: ['latin'] });
  ```

### For Existing Pages (Consistency)
- Maintain the current system font stack to avoid visual jarring
- Migrate to Google Fonts incrementally as pages are redesigned

### NEVER Use
Generic defaults like Arial, Roboto, or bare system fonts on new pages where you're designing from scratch.

## Visual Design Principles

### Color & Theme
- Commit to the ZenoCases palette (see `design/SKILL.md` for exact values)
- Use CSS custom properties (`--primary`, `--muted`, etc.) for consistency
- Dominant colors with sharp accents > timid, evenly-distributed palettes
- Dark mode must look intentionally designed, not just inverted

### Spatial Composition
- Use asymmetric layouts for visual interest on dashboards
- Generous negative space for data-heavy pages (case lists, reports)
- Card-based layouts with consistent `rounded-lg border shadow-sm` pattern
- Grid-breaking hero elements on landing/overview pages

### Motion & Micro-Interactions
- Use CSS `transition-colors` (150ms) on all interactive elements
- Add `hover:bg-muted/50` on table rows for affordance
- Stagger card animations on dashboard load:
  ```css
  .card:nth-child(1) { animation-delay: 0ms; }
  .card:nth-child(2) { animation-delay: 50ms; }
  .card:nth-child(3) { animation-delay: 100ms; }
  ```
- Respect `prefers-reduced-motion` always

### Backgrounds & Depth
- Dashboard: subtle gradient mesh or soft pattern texture
- Cards: `bg-card` + `shadow-sm` for depth hierarchy
- Modals: `bg-black/50` backdrop with `backdrop-blur-sm`
- Sidebar: contrasting surface from main content

## ZenoCases-Specific Patterns

### Status Badges (Critical)
The platform displays 80+ workflow statuses. Each category has a distinct color:
```typescript
const statusColors: Record<string, string> = {
  INTAKE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  DOCUMENTATION: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  DHS: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  LEGAL: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  INSURANCE: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
  PAYMENT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  INACTIVE: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};
```

### Data Tables
Debt counselling involves dense data. Make tables scannable:
- Sticky headers on scroll
- Zebra striping with `even:bg-muted/30`
- Inline status badges (not text)
- Action buttons right-aligned, grouped
- Mobile: horizontal scroll with fixed first column

### Dashboard Cards
Key metrics should pop:
```typescript
<div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-6">
  <p className="text-sm text-muted-foreground">Active Cases</p>
  <p className="text-3xl font-bold tracking-tight mt-1">{count}</p>
  <p className="text-xs text-emerald-600 mt-2">↑ 12% from last month</p>
</div>
```

## Implementation Checklist

Before finalizing any UI work:
```
[ ] Uses ZenoCases design tokens (not hardcoded colors)
[ ] Dark mode tested and intentional
[ ] Responsive at all breakpoints (mobile → desktop)
[ ] Interactive elements have hover/focus states
[ ] Animations respect prefers-reduced-motion
[ ] WCAG 2.1 AA contrast ratios met
[ ] Consistent with existing app patterns
[ ] Status badges use correct category colors
```
