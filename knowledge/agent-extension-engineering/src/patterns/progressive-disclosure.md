---
type: Pattern
title: "Progressive disclosure"
description: "When only some tasks need detailed guidance, put it where each reader can discover and use it."
tags: ["skills", "knowledge", "routing", "references", "progressive disclosure", "packs"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:13:12Z" }
sources:
  - id: engineering
    resource: https://github.com/agentxm/axm/blob/03a82fdd2a0aebeb8fb3f38c99afe303bfad77a0/skills/agent-extension-engineering/src/SKILL.md
    title: Agent extension engineering skill
  - id: docs
    resource: https://github.com/agentxm/axm/blob/03a82fdd2a0aebeb8fb3f38c99afe303bfad77a0/agent_extensions/registry.agentxm.ai/@craigsmitham/skills/docs/src/SKILL.md
    title: Docs skill
  - id: jupyter
    resource: https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/jupyter-notebook/SKILL.md
    title: OpenAI Jupyter notebook skill
  - id: playbook
    resource: https://github.com/pbakaus/impeccable/blob/b49177d32788f2dc585c42831d845dacf1ebed2c/skill/SKILL.src.md
    title: Impeccable main skill
---

# Progressive disclosure

A reader choosing a workflow needs enough information to recognize the right
one. Once there, they need enough detail to do the work. Decide who owns that
detail, then put the cue to retrieve it where the reader makes the choice.

| Who needs the material?                                     | Where to put it                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everyone running a short procedure                          | Keep the procedure in the skill. An extra lookup buys little.                                                                                                                                                                    |
| One branch of one skill                                     | Ship a reference with that skill and link it at the decision. OpenAI’s Jupyter skill selects different guidance for an experiment and a tutorial. The notebook template itself is an asset used to produce the output.[^jupyter] |
| Several workflows or people looking up the subject directly | Give the material a searchable knowledge concept. A small routing skill selects the concept by intent.                                                                                                                           |

The Docs skill routes pattern mining and collection organization to different
concepts.[^docs] The extension engineering pack pairs its routing skill with a
knowledge bundle so a reader can also look up the glossary directly.[^engineering]
When a workflow depends on a separately installed bundle, [compose and check
the pair](../guides/composing-packs.md) at compatible versions.

Timing can matter even after the workflow has selected a reference. Impeccable
opens the playbook for the requested operation and reads its shared design rules
immediately before a UI edit.[^playbook] A planning request can finish at the
brief. Try a plan-only request and an editing request against the same target.
Check which step first needs the detailed rules and place the retrieval cue there.

Try an ordinary request from the reader's starting point. Which cue would tell
them to retrieve the material? If they can finish using a familiar but obsolete
convention, consider a short [scoped pointer](scoped-instructions.md) to the
version that applies. Adding another layer of navigation costs a lookup every
time the reader takes it.

[^jupyter]: OpenAI Jupyter notebook skill, templates and references.

[^docs]: Docs skill, need-to-concept table.

[^engineering]: Agent extension engineering skill, use-case table.

[^playbook]: Impeccable, playbook selection and guidance before editing.
