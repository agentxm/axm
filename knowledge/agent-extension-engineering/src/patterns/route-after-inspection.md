---
type: Pattern
title: "Route after inspection"
description: "When one use case has several procedures, inspect the cheapest fact that changes the work."
tags: ["skills", "routing", "inspection", "state", "branch", "workflow"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:42:23Z" }
sources:
  - id: web
    resource: https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/webapp-testing/SKILL.md
    title: Anthropic web-app testing skill
---

# Route after inspection

A user asking for help testing a web application may have a static page, a
running server, or a project that still needs to start. Anthropic’s web-app
testing skill uses those facts to choose how to obtain selectors and whether
to run a server helper.[^web] One entry point covers the user's job. Only the
procedure varies.

For “review this skill,” follow an explicitly named target first. A draft calls
for an authoring review, a native path with a missing update calls for
inspecting the projection, and a transcript with an unexpected answer calls
for examining the run. Carry a modifier such as “just the description” into
the chosen procedure.

If the user asks about a packaged reference, an archive listing can settle
whether the path exists. An excerpt containing the link leaves that question
open. Ask for the archive or listing when it would settle the verdict. A
broader scan of the author's workspace can find a file that consumers never
received. If the deciding fact depends on the user’s preference, use an [agent-mediated decision](agent-mediated-decisions.md).

[^web]: Web-app testing, decision tree for static pages and server state.
