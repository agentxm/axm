---
type: Guide
title: Bounded regeneration
description: How to make replaceable implementation layers earn regeneration through conservation boundaries, operational memory, and rollback.
tags: [regeneration, replacement, deletion-test, data, contracts, rollback, operational-memory]
---

# Bounded regeneration

Treat regeneration as an earned property of a bounded layer, not as a synonym
for generating more code.

Before replacing or regenerating a layer:

1. Identify the accepted Requirements, public contracts, persistent data,
   security and compliance boundaries, and operational envelope that must be
   conserved.
2. Extract knowledge that exists only in implementation behavior, incidents,
   runbooks, or experienced maintainers. Classify observations separately from
   accepted intent.
3. Establish diverse evaluations for the conserved behavior and failure modes.
4. Bound the writable scope and dependencies of the replacement mechanism.
5. Make the change observable, containable, and reversible; define rollback
   against durable state rather than only source files.
6. Compare the new realization with its Requirements and evaluation evidence.
7. Compact the superseded layer only after the replacement and recovery path
   are established.

Use a deletion test as a diagnostic: if an implementation layer disappeared,
could the system be rebuilt from retained intent, data, contracts, decisions,
operational memory, and evaluations without rediscovering critical behavior in
production? A failed deletion test identifies missing conservation knowledge;
it does not authorize reconstructing that knowledge as accepted intent without
review.
