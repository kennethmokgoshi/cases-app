---
name: claude-reflect
description: Self-learning system that captures corrections and applies them to CLAUDE.md. Use when: (1) User corrects an approach, (2) User says "remember this", (3) Completing meaningful work, (4) User makes corrections that should be remembered for future sessions.
---

# Claude Reflect — Self-Learning System

A two-stage self-learning system that improves through user corrections:

**Stage 1 (Automatic):** Detect correction patterns like "no, use X" or "actually..." and queue them to `~/.claude/learnings-queue.json`.

**Stage 2 (Manual):** Users run `/reflect` to review and apply queued learnings.

## Key Commands

| Command | Action |
|---------|--------|
| `/reflect` | Process learnings with human review |
| `/reflect --dry-run` | Preview changes without writing |
| `/reflect --scan-history` | Analyze past sessions for corrections |
| `/reflect --dedupe` | Consolidate similar entries in CLAUDE.md |
| `/reflect-skills` | Discover workflow patterns and propose reusable skills |
| `/skip-reflect` | Discard queued items |
| `/view-queue` | Show pending learnings |

## When to Remind

Remind the user about `/reflect` when:
- Meaningful work is completed
- They make corrections that should be remembered
- They use phrases like "remember this"
- Context is about to compact with pending items

## Learning Storage

Corrections get applied based on scope:
- **Global learnings** → `~/.claude/CLAUDE.md`
- **ZenoCases-specific** → `./CLAUDE.md` (project root)
- **Skill improvements** → relevant `.agent/skills/*/SKILL.md`

## Pattern Types Detected

1. **Explicit markers** (highest confidence): `remember:` prefixed messages
2. **Guardrail patterns**: "don't do X unless", "only change what I asked"
3. **Correction patterns**: "no, use", "actually", "that's wrong"
4. **Positive feedback**: "perfect!", "exactly right", "great approach"

## Confidence & Decay

- Confidence scores (0.0-1.0) help prioritize learnings during review
- Decay applies to queue items only — if unprocessed too long, flagged as stale
- Once applied to CLAUDE.md, entries are permanent (edit manually to remove)
