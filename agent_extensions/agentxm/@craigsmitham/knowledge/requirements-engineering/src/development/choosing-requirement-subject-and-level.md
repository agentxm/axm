---
type: Guide
title: Choosing requirement subject and level
description: Chooses an obligated subject and abstraction level appropriate to the decision without requiring a particular architecture taxonomy.
tags: [subject, abstraction, allocation, system-boundary, architecture]
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Choosing requirement subject and level

The **obligated subject** is the thing that must satisfy a requirement. Name it
explicitly enough that responsibility and assessment scope are clear.

Possible subjects include a product, service, system, component, interface,
workflow, organization, supplier, person in a role, or delivery process. Use the
project's own architecture and domain language; no universal list is mandatory.

Choose the level that matches the current decision:

- state stakeholder or outcome needs without prematurely selecting a solution;
- state system obligations at the externally meaningful boundary;
- allocate obligations to lower-level subjects only when the allocation is an
  accepted decision or a necessary constraint;
- link refinements so lower-level detail does not erase the parent intent.

A warning sign is a requirement that names an implementation element the team
has not decided to use. Another is a high-level requirement so broad that no
bounded subject or assessment can be identified.
