---
type: Domain Concept
description: What an AgentXM extension is, how the registry, workspace, and ownership fit together, and the four kinds of workspace state AXM reconciles.
tags: [extension, registry, workspace, domain-model, axm]
status: stable
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
sources:
  - id: axm-readme
    resource: https://github.com/agentxm/axm/blob/main/README.md
    title: AXM repository README
  - id: workspace-state
    resource: https://github.com/agentxm/axm/blob/main/contributing/guides/workspace-state.md
    title: AXM workspace-state guide
---

# The AgentXM extension model

AgentXM is an extension manager for AI coding assistants. Developers publish
**extensions** to a central **registry**; agents and users discover, install,
and compose them locally in an AXM-managed **workspace**.[^axm-readme]

## Core terms

| Term | Meaning |
| --- | --- |
| Extension | A handle-scoped published artifact of exactly one extension type. Extensions have versions; a version is immutable after publish. |
| Registry | The central AgentXM service (registry API plus the agentxm.ai web app) where extensions are published, discovered, and installed from. |
| Workspace | The local AXM management boundary rooted at `.axm/`, in project or user scope. |
| Owner | The answer to "whose extension is this" — ownership fields on manifests, lockfile entries, and refs carry the owner handle. |
| Handle | The `@<slug>` registry identity that scopes every published extension. See [Handles and ownership](handles-and-ownership.md). |
| Library | A live, unordered registry collection of extension identities. A Library is *not* an extension type: it has no manifest, archive, version, or publish step, and it is never an install target. |

An extension's identity is the tuple `(handle, type, name)`; adding a version
gives the immutable version tuple `(handle, type, name, version)`. The
user-facing spelling of an identity is the FQN — see
[Identifier grammar](identifier-grammar.md).

## Workspace state model

AXM manages a workspace by reconciling four kinds of state:[^workspace-state]

| State | Where it lives | Role |
| --- | --- | --- |
| Desired | `.axm/settings.json` plus configured pack manifests | What the workspace should contain |
| Observed | Canonical packages under `.axm/extensions/`, native agent config, managed projections | What actually exists |
| Trust | `.axm/trust.json` | Source identity, resolved revisions, publisher epochs |
| Receipt | `.axm/axm-lock.yaml` | Resolution and materialization history; never authoritative |

`axm sync` computes one plan from desired plus observed state and applies it;
when they already agree, sync is a no-op. The `.axm/` directory, including the
lockfile, is committed to version control rather than gitignored.

A configured entry's lifecycle classification is distinct from whether it is
installed: an entry is *configured* (explicit settings entry), *implicit*
(desired only as a pack member), or *unmanaged* (present and usable but
outside the desired graph).

[^axm-readme]: AXM repository README.
[^workspace-state]: AXM workspace-state guide.
