---
type: Guide
title: "Writing an extension README"
description: "Choose an example and the details a reader needs to decide whether to install an extension and try it."
tags: ["readme", "authoring", "installation", "usage", "examples"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T22:42:56Z" }
sources:
  - id: skills
    resource: https://github.com/anthropics/skills#claude-code
    title: Anthropic Skills README
  - id: actions
    resource: https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions#creating-a-readme-file-for-your-action
    title: GitHub Actions README guidance
---

# Writing an extension README

Write for someone deciding whether to install the extension. Open with the task
it helps them accomplish. Give the install command, then show one realistic
first use and the result to expect.

For a skill, show a request and its result.[^skills] For a hook, show the event
and its observable effect. For a pack, show a task its members accomplish
together. If someone lands on a member README and needs the pack, point them
there.

Mention a prerequisite, permission, side effect, or limitation when it changes
the install decision or the example.[^actions] Link deeper instructions and
release history. Stop when the reader can choose, install, and try it.

[^skills]: Anthropic Skills README, Claude Code example.

[^actions]: GitHub, Creating a README file for your action.
