---
type: Pattern
title: "Invocation policy"
description: "Choose who can start a skill based on who owns the timing and whether a named command is useful."
tags: ["skills", "invocation", "explicit", "implicit", "user-invoked", "model-invoked"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:42:23Z" }
sources:
  - id: claude
    resource: https://code.claude.com/docs/en/skills#control-who-invokes-a-skill
    title: Claude Code invocation controls
  - id: vscode
    resource: https://code.visualstudio.com/docs/agent-customization/agent-skills#use-skills-as-slash-commands
    title: VS Code Copilot skill selection
  - id: codex
    resource: https://learn.chatgpt.com/docs/build-skills#optional-metadata
    title: Codex invocation policy
  - id: standard
    resource: https://agentskills.io/specification
    title: Agent Skills specification
---

# Invocation policy

Consider what should happen when a user mentions an upcoming deployment.
A planning conversation can benefit from release guidance while the release
operator still owns the decision to start deployment. Choose the entry point
for each job deliberately.

| Who can start it? | When it fits                                                                              | Example                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| User              | Timing is a decision the operator makes explicitly.                                       | Start the deployment workflow for a named environment.   |
| Model             | Background guidance is useful during another task and has little value as a user command. | Interpret legacy billing terms while reading an invoice. |
| Either            | Ordinary requests describe the job well and repeat users benefit from a shortcut.         | Review a skill archive on request or by name.            |

Claude Code and VS Code Copilot document both entry points by default.
Their `disable-model-invocation: true` setting reserves invocation for the user.
Their `user-invocable: false` setting hides the slash command while leaving the
skill available to the model.[^claude][^vscode] Codex documents explicit
`$skill` selection and implicit matching by default. For explicit use only,
set `policy.allow_implicit_invocation: false` in `agents/openai.yaml`.[^codex]

The portable skill description states the capability and when it applies.[^standard]
Use the documented control on each target host and try both entry points there.
If the host lacks a control your design depends on, qualify support for that
mode. A user's selection starts the workflow. The target environment, credentials,
and [authority for its effects](../guides/trust-and-authority.md) still matter.

[^claude]: Claude Code, controlling who invokes a skill.

[^vscode]: VS Code, slash-command and automatic selection controls.

[^codex]: OpenAI, optional skill metadata and explicit selection.

[^standard]: Agent Skills specification, description field.
