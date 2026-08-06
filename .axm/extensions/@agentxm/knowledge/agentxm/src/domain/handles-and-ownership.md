---
type: Domain Concept
description: How AgentXM handles work as publisher identity — one handle per account, recyclable names with cooldowns, permanent version tombstones, administrative freezes, and publisher-epoch safety.
tags: [handle, ownership, publisher, identity, supply-chain, security]
status: stable
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
---

# Handles and ownership

A **handle** is the canonical owner identity on the AgentXM registry, always
written in full `@<slug>` form and used in APIs, routes, settings, and FQNs.
The slug is either plain (no dots, no verification required) or domain-like
(dots, requires DNS verification) — see
[Identifier grammar](identifier-grammar.md).

## Ownership model

- One account owns exactly one handle at a time. Publishing under multiple
  handles requires multiple organizations (the GitHub-style escape hatch).
- The handle's `@<slug>` form is the publishing scope: every extension the
  account publishes lives under it.
- Terminology is deliberate: **handle** names the identity itself; **owner**
  names ownership fields on extension records, manifests, and lockfile
  entries; **profile** names both the public page of a handle and the active
  identity context in CLI settings; **slug** is the unprefixed value behind a
  handle. "Namespace" is a deprecated legacy alias.

## Recyclable names, permanent versions

Publisher names are recyclable, but published coordinates are not:

- A released (emptied) handle enters a cooldown before it can be
  re-registered by someone else.
- Deleting a whole extension permits reuse of that extension name after a
  24-hour hold.
- Every published exact version coordinate `(handle, type, name, version)` is
  **permanently retired** — no one, including the original publisher, can ever
  republish it.

## Freezes and publisher-epoch safety

Administrative freezes are permanent: a frozen handle is ownerless and
read-only, its published extensions remain accessible, and the frozen name is
not released except in narrow, registry-reviewed cases. This is a
supply-chain safety
posture: it prevents revival-hijack attacks where an abandoned publisher name
is re-registered to serve malicious updates.

Workspaces additionally record the **publisher epoch** they installed from in
the lockfile. A recycled handle cannot silently substitute a new publisher for
an old one: interactive flows require explicit confirmation when an install
would cross a publisher epoch, and unattended flows fail instead.
