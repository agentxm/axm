---
type: Guide
title: "Authoring and revising skills"
description: "Use when creating or changing a skill; define its routing and workflow contracts and check representative requests."
tags: ["skills", "skill.md", "author", "revise", "routing", "progressive-disclosure"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-10-30T20:56:27Z" }
---

# Authoring and revising skills

Bind the requested capability and canonical package before writing. Use the
extension manager's scaffold when available. Creation of a skill does not by
itself authorize performing the external actions that skill describes.

## Author the contract

1. Define the coherent job, trigger, inputs, output, failure conditions, and
   observable completion. Preserve the user's chosen tools and deliverable.
2. Write a description with realistic request vocabulary. Include an adjacent
   exclusion only where it resolves a plausible routing collision. Keep the
   registry summary separate from model-facing activation metadata.
3. Put activation and essential constraints in `SKILL.md`. Route detailed
   guidance to knowledge or references only when needed. A routing skill should
   not repeat the procedures it selects.
4. Prefer outcome and decision criteria when several approaches are valid.
   Specify exact steps for fragile mechanics or required ordering. Distinguish
   requirements from recommendations and examples.
5. Resolve what can be discovered locally before asking questions. Ask only for
   missing decisions that affect the result, and continue independent work.
6. Define the smallest authority envelope: filesystem, network, credentials,
   data, external writes, and executable dependencies. State what evidence
   distinguishes a completed, partial, failed, or blocked operation.
7. Declare required composition. Resolve required siblings by extension identity
   through the host or manager, never by another extension's filesystem path.
8. Add host-specific metadata only for supported hosts. Do not infer runtime
   support from a valid manifest or a generated projection.

## Resources and changes

Add scripts for repeated, fragile mechanics with a defined input/output and
side-effect boundary. Add references for conditional depth and assets for
material copied into outputs. Inspect executable resources before running them;
authorship is not blanket execution authority. Keep generated residue outside
the package when practical and use specific ignore rules where necessary.

For revision, name the motivating failure or changed requirement and preserve
unrelated supported behavior. Delete superseded guidance after its replacement
and discovery routes work. Follow [lifecycle](lifecycle.md) for contract changes.

## Validate and hand off

Check required metadata, packaged resources, links, host constraints, and
archive selection with the trusted manager. Exercise clear and paraphrased
positive requests and a plausible adjacent negative. Include the happy path,
missing input, denied authority, and relevant failure recovery. Use
[verification](verification.md) to label the evidence accurately.

Report the exact candidate, changes, checks, authority deltas, and remaining
unknowns. Same-agent authoring smoke is not independent assessment or approval.
