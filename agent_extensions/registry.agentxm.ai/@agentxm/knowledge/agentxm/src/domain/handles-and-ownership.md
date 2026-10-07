---
type: Domain Concept
description:
  How AgentXM handles work as the identity extensions are published under — one
  handle per account, recyclable names with cooldowns, permanent version
  tombstones, administrative freezes, extension holds, name-reuse holds, and
  publisher-epoch safety.
tags: [handle, ownership, publisher, identity, supply-chain, security, hold]
status: stable
generated:
  by: openai/codex
  at: 2026-10-05T00:00:00Z
---

# Handles and ownership

A **handle** is the canonical owner identity on the AgentXM registry, always
written in full `@<slug>` form and used in APIs, routes, settings, and FQNs. The
slug is either plain (no dots, no verification required) or domain-like (dots,
requires DNS verification) — see [Identifier grammar](identifier-grammar.md).

## Ownership model

- One account owns exactly one handle at a time. Publishing under multiple
  handles requires multiple organizations (the GitHub-style escape hatch).
- The handle's `@<slug>` form is the publishing scope: every extension the
  account publishes lives under it.
- Terminology is deliberate: **handle** names the identity itself; **owner**
  names ownership fields on extension records, manifests, and lockfile entries;
  **profile** names both the public page of a handle and the active identity
  context in CLI settings; **slug** is the unprefixed value behind a handle.
  "Namespace" is a deprecated legacy alias.
- The handle is the identity a version is published under, not the actor that
  publishes it. A person signed in to AXM, a personal access token, or a
  [trusted publisher](extension-model.md#core-terms) running in CI all publish
  under the owner's handle, and none of them changes who owns the extension.

## Recyclable names, permanent versions

Publisher names are recyclable, but published coordinates are not:

- A released (emptied) handle enters a cooldown before it can be re-registered
  by someone else.
- Deleting a whole extension permits reuse of that extension name after a
  24-hour hold. An extension can be deleted only before anything depends on it;
  see
  [Whole-extension lifecycle](visibility-and-discovery.md#whole-extension-lifecycle).
- Libraries use immutable IDs and mutable, non-unique titles. Deleting a Library
  removes its membership and access grants and permanently consumes its ID. A
  new Library may immediately use the same title with a fresh ID; it inherits no
  membership or grants. There is no Library title reuse hold.
- Every published exact version coordinate `(handle, type, name, version)` is
  **permanently retired** — no one, including the original publisher, can ever
  republish it.

## Extension holds and Handle freezes

An extension hold and a Handle freeze are different controls. A platform hold is
reversible containment of one extension. It keeps the publisher binding and
published history intact while temporarily refusing discovery and new fetches;
releasing it restores the publisher's underlying lifecycle state. See
[Visibility and discovery](visibility-and-discovery.md).

An administrative Handle freeze is permanent and applies to the publisher
identity: a frozen handle is ownerless and read-only, its published extensions
remain accessible, and the frozen name is not released except in narrow,
registry-reviewed cases. This is a supply-chain safety posture: it prevents
revival-hijack attacks where an abandoned publisher name is re-registered to
serve malicious updates.

## Publisher-epoch safety

AXM workspaces preserve the accepted **publisher epoch** for installed
extensions. A recycled handle cannot silently substitute a new publisher for an
old one: interactive flows require explicit confirmation when an install would
cross a publisher epoch, and unattended flows fail instead. The AXM workspace
design owns how that acceptance is recorded.
