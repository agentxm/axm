---
type: Workflow
description:
  The extension lifecycle from an author's and consumer's point of view —
  scaffold, author, lint, publish, archive or restore, then discover, install,
  reconcile, update, switch sources, and retire.
tags:
  [
    publishing,
    authoring,
    install,
    update,
    source-switch,
    archive,
    lifecycle,
    workflow,
    lint,
  ]
status: stable
generated:
  by: openai/codex
  at: 2026-09-19T15:59:01Z
sources:
  - id: axm-readme
    resource: https://github.com/agentxm/axm/blob/main/README.md
    title: AXM repository README (publishing and lint sections)
---

# The extension lifecycle

## Authoring and publishing

1. **Scaffold** — `axm <type> new <name>` creates a workspace-authored extension
   in its project type root, such as `skills/<name>/`; `axm.json` records the
   exact source `workspace`.
2. **Author** — complete the manifest (description, keywords, license) and the
   type's content (for example `SKILL.md`, concept documents, hook bodies).
3. **Lint** — `axm lint` evaluates the same shared rule catalog that drives the
   registry's publish gate, so local lint findings predict publish verdicts; the
   registry gate remains authoritative.[^axm-readme]
4. **Publish** — `axm publish` releases authored extensions to the registry.
   Versions follow SemVer, must be bumped before publishing, and are immutable
   once published. Visibility is chosen explicitly at first publish and managed
   afterward on the extension — see
   [Visibility and discovery](../domain/visibility-and-discovery.md).
5. **Archive or restore** — `axm archive <ref> [--reason <text>]` marks a
   published extension finished and freezes publisher changes without breaking
   consumers. `axm unarchive <ref>` restores active publishing. Both commands
   condition their write on the lifecycle revision they observed.

Publishing requires signing in; day-to-day consumption of public extensions does
not.

### Publishing from CI

A GitHub Actions workflow can publish new versions without storing a token:

1. Publish the extension's first version yourself with `axm publish`, so the
   extension exists under your handle.
2. In AgentXM user settings, create a **trusted publisher** for the public
   repository and the workflow file that publishes, optionally a deployment
   environment, and optionally the extensions it may publish. Creating one asks
   for a second factor.
3. Give the publishing job `permissions: id-token: write` and run `axm publish`.
   AXM detects GitHub Actions, asks GitHub for an identity token whose audience
   is the registry, and exchanges it for a workload token that lives at most an
   hour.

A trusted publisher publishes versions of existing extensions under its owner's
handle only; creating an extension, yanking, and changing settings stay with a
person. `axm whoami` in the job names the trusted publisher. Disabling or
deleting it in settings revokes its live tokens at once.

Where trusted publishing does not fit yet — a private repository, a CI other
than GitHub Actions, or an organization's handle — use a `publish` personal
access token that names the owner. It defaults to seven days and lives at most
90, or less when an organization it names sets a lower limit.

## Consuming

1. **Discover** — find extensions in the registry or discover manifests in a Git
   repository or filesystem path. Ecosystem recommendations may name any
   supported source explicitly.
2. **Install** — `axm install <source>` resolves selected manifests from a
   registry name, Git repository, or path, then materializes each complete
   acquired package under `agent_extensions/`. AXM records desired state in
   `axm.json` and each exact external
   [accepted resolution](../domain/sources.md#accepted-resolution) with tree
   integrity in `axm-lock.yaml`.
3. **Reconcile** — `axm sync` brings AXM-managed local content in line with the
   workspace configuration and exact accepted resolutions; a clean workspace
   syncs as a no-op rather than selecting a newer target.
4. **Update** — `axm update` evaluates each source's selection intent. Registry
   entries may advance to a compatible published version; Git branch selectors
   may advance to a new commit while tag and commit selectors hold; path entries
   accept the current package tree at their declared path. Successful updates
   record a new accepted resolution. Archived registry extensions remain
   eligible and carry a notice that no further versions are expected.
5. **Switch source** — installing an already installed fully qualified name from
   a different authority previews an atomic
   [source switch](../domain/sources.md#source-switching). The switch preserves
   local intent while replacing the source and accepted resolution.
6. **Retire** — `axm uninstall` removes an entry; pack-driven removal is
   orphan-aware per [Pack semantics](../domain/pack-semantics.md).

A platform hold is different from publisher archival. It temporarily removes an
extension from discovery and refuses new resolution and archive fetches, while
leaving already installed copies and the publisher's underlying lifecycle state
unchanged. See
[Visibility and discovery](../domain/visibility-and-discovery.md).

What the lifecycle is _not_: installing an extension never edits agent
instructions unless the type's contract says so (Rules inject into instruction
files; Knowledge is never injected), and a registry Library is not an install
target at any point in this lifecycle.

[^axm-readme]: AXM repository README (publishing and lint sections).
