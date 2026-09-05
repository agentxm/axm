---
type: Guide
title: Mapping work items to native hosts
description: Use when representing work-item meaning in tracker fields, labels, relationships, and body content without duplicate authority.
tags: [work-item, tracker, fields, labels, metadata, github, jira, linear, readback, batch]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Mapping work items to native hosts

This guide adapts the earlier tracker metadata and label guidance to the
portable work-item contract.

## Establish meaning before mapping

Determine the portable role, classification, evidence, decisions,
relationships, lifecycle dimensions, and next action before choosing fields or
labels. Inspect the host schema and current project conventions. Match exact
semantics, not similar names.

## Use each native affordance once

Prefer native identity, issue type, status, priority, assignment, relationship,
milestone, attachment, and timestamp fields when they carry the fact exactly.
Put only residual meaning in the body. Do not maintain a second editable
metadata block for facts already owned by structured fields.

Keep type, classification, status, severity, priority, assignment, resolution,
verification, and closure distinct. A label may help filtering but does not
prove diagnosis, authority, or lifecycle state.

## Bound mutations

Read-only analysis or drafting does not authorize an external write. Before a
mutation, verify the host, project, repository, or workspace; exact item or new
record target; intended field changes; and requested authority. Assignment,
priority, labels, status, closure, comments, and relationships are separate
mutations unless the request or established in-scope workflow includes them.

After writing, retrieve the persisted item and compare identity, fields,
relationships, and body with the intended result. In a batch, retain successful
item-local writes, report each failure or unverified identity, and do not claim
atomic success unless the host provides it.
