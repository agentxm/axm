---
type: Explanation
title: Instruction files as harness elements
description: The boundary between persistent instruction surfaces and the surrounding agent harness.
tags: [harness, instructions, context, boundary]
status: stable
generated:
  by: codex/gpt-5.6
  at: 2026-08-14T20:51:01Z
---

# Instruction files as harness elements

An instruction file is a persistent context surface a harness loads for some
scope. It can establish invariants, operating facts, collaboration agreements,
and routes to deeper material.

Harness engineering owns the mechanism: discovery, composition, precedence,
scope enforcement, observability, and integration with executable controls.
Context engineering owns what information belongs there, how it competes for
attention, and how it stays current. Prompt engineering may inform the wording
and structure when the file is rendered directly into a model-facing prompt.

Do not treat an instruction file as the harness itself. It cannot enforce
permissions, provision dependencies, preserve execution state, or establish
that an action succeeded.
