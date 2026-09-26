---
trigger: always_on
---

# Git Conventions

Scope: how work enters version control.

## Hard rules — breaking any of these fails the task even if the code works

- **Never commit secrets.** No `.env`, keys, or credentials in history. If one is committed, treat
  it as leaked: rotate it, don't just delete the line.
- **Never commit generated artifacts:** the generated Prisma client, build output, `node_modules`.
- **Destructive migrations get their own commit and a written note.** Never fold a dropped column
  or table into an unrelated change.
- **Never rewrite published history.** No force-push to shared branches.
- **One logical change per commit.**

## Guidance — followed by default, does NOT by itself fail a task

- Commit messages: imperative mood, present tense (e.g. `Add order total calculation`).
- Branch names describe the work: `feat/menu-items`, `fix/order-total`.
- Every PR ends with the `AGENTS.md` §6 checklist.
