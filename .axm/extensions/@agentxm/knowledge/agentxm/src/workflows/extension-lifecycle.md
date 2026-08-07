---
type: Workflow
description: The extension lifecycle from an author's and consumer's point of view — scaffold, author, lint, publish, then discover, install, reconcile, update, and retire.
tags: [publishing, authoring, install, lifecycle, workflow, lint]
status: stable
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
sources:
  - id: axm-readme
    resource: https://github.com/agentxm/axm/blob/main/README.md
    title: AXM repository README (publishing and lint sections)
---

# The extension lifecycle

## Authoring and publishing

1. **Scaffold** — `axm <type> new <name>` creates a workspace-authored
   package under `.axm/extensions/`; the workspace settings record it with a
   `workspace:@owner/<plural-type>/<name>` source, which is what marks
   authorship.
2. **Author** — complete the manifest (description, keywords, license) and
   the type's content (for example `SKILL.md`, concept documents, hook
   bodies).
3. **Lint** — `axm lint` evaluates the same shared rule catalog that drives
   the registry's publish gate, so local lint findings predict publish
   verdicts; the registry gate remains authoritative.[^axm-readme]
4. **Publish** — `axm publish` releases authored extensions to the registry.
   Versions follow SemVer, must be bumped before publishing, and are
   immutable once published. Visibility is chosen explicitly at first publish
   and managed afterward on the extension — see
   [Visibility and discovery](../domain/visibility-and-discovery.md).

Publishing requires signing in; day-to-day consumption of public extensions
does not.

## Consuming

1. **Discover** — search the registry (web app, `axm discover`, CLI search,
   or the public MCP server's catalog tools).
2. **Install** — `axm install @owner/<plural-type>/<name>` materializes the
   package into the workspace, records desired state in settings, trust
   identity in the trust file, and the resolution receipt in the lockfile.
3. **Reconcile** — `axm sync` continuously re-derives one plan from desired
   plus observed state; a clean workspace syncs as a no-op.
4. **Update** — `axm update` (or `axm outdated` to preview) moves configured
   entries forward within their version constraints.
5. **Retire** — `axm uninstall` removes an entry; pack-driven removal is
   orphan-aware per [Pack semantics](../domain/pack-semantics.md).

What the lifecycle is *not*: installing an extension never edits agent
instructions unless the type's contract says so (Rules inject into
instruction files; Knowledge is never injected), and a registry Library is
not an install target at any point in this lifecycle.

[^axm-readme]: AXM repository README (publishing and lint sections).
