---
trigger: always_on
---

# Coding Standards

Scope: how code in this repo must be written. Anchored to `AGENTS.md` §5.
`README.md` is the source of truth for _what_ to build.

## Hard rules — breaking any of these fails the task even if it runs

- **TypeScript `strict` mode is on. Never disable it** for a file, module, or the project.
- **Never use `any` to escape a type.** Model the type, or use `unknown` and narrow.
- **Never write a silent catch.** No empty `catch {}`. Handle the failure, or fail loud and log.
- **Define `OrderStatus` once** (from the Prisma enum) and import it. Never re-declare it as inline
  string literals.
- **A comment is never an enforcement mechanism.** If a guarantee matters (unique phone, kobo
  integers, valid status), it lives in the schema, a type, or code.
- **No secrets or credentials in source.** They come from the environment.
- **Keep decision logic free of framework and I/O.** Order totals and status transitions must be
  unit-testable without a server, database, or network.
- **Lint and type-check must pass with zero errors** before a task is done (`AGENTS.md` §6).

## Guidance — followed by default, does NOT by itself fail a task

- Prefer small, single-purpose functions.
- Names match schema field names exactly (`restaurantId`, `deliveryFee`, `unitPrice`).
- Comments explain _why_, not _what_.
- Use the repo's formatter and linter; don't hand-format to personal taste.

## When unsure

Do not invent structure to make something compile. Follow `AGENTS.md` §7.
