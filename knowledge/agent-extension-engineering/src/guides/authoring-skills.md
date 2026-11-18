---
type: Guide
title: "Authoring and revising skills"
description: "Resolve overlapping skill triggers and decide how much procedure belongs in the skill."
tags: ["skills", "skill.md", "author", "revise", "routing", "progressive-disclosure"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T22:24:31Z" }
---

# Authoring and revising skills

Start with a request and the result the user should get. Put the cues that
distinguish that job in the description. In the body, spell out decisions
where a plausible choice would produce the wrong result. Give exact steps
where order matters. If only one task needs a reference, link it at the step
where the reader needs it.

Suppose a code reviewer and a release-note editor both activate on “review this
change.” Look at what the user supplied and what each skill would return.

- A diff and a request for defects belong with the code reviewer. A draft and
  a request to clarify user-visible changes belong with the editor. Narrow each
  description around its input and outcome.
- A request to find defects **and** revise the release note has two deliverables.
  Keep both skills available. An exclusion on the word “review” would hide a
  useful skill.
- If both skills take the same draft and return the same edit under the same
  constraints, merge them unless a caller needs the distinction.

Try a fresh wording of the ambiguous request with each kind of input. Inspect
which skill was selected and whether its answer delivered the intended result.
