---
trigger: always_on
---

# Security Rules

Scope: protecting customer data and order integrity.

## Identifiers

- **Never expose a sequential ID.** Every public identifier is a cuid (`README.md`, Identifiers).
- **Never accept an ID as proof of access.** Knowing an order's ID doesn't entitle a caller to
  read it; check that the caller is allowed to.

## Customer data

- **Never return one customer's phone number or order history to another caller.**
- **Never log a full phone number.** Mask it (`+234******789`) in logs.

## Input

- **Validate every request body into a typed shape before use** (zod schema in
  `packages/contracts`). Reject anything that doesn't match.
- **Never trust client-sent money** — totals and unit prices are computed on the server
  (`money.md`).
- **Never leak a raw error or stack trace** in a response. Log it internally, return a generic
  failure.

## Transport and secrets

- **All transport uses TLS** outside local development.
- **Secrets come from the environment only.** Never commit `.env` or a credential.

## When unsure

Never weaken a control to make a feature work. Stop and ask (`AGENTS.md` §7).
