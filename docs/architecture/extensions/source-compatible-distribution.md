---
type: Architecture
status: draft
description: Existing-format acquisition, unchanged payloads, creator publication, and transfer of installation ownership into AXM.
depends-on:
  - overview.md
  - skills.md
  - ../workspace/sources.md
---

# Source-compatible distribution

AXM accepts the source and layout a publisher already distributes. Creators can
advertise an AXM install command without creating an account, adding an AXM
manifest, or restructuring a repository. Consumers retain upstream source
tracking while AXM owns acquisition, accepted resolution, and native placement.

This document explains the design and delivery boundaries. Executable
specifications beside each owning feature are the functional authority; the
[specification catalog](../../../specifications/catalog.md) is their discovery
route. A successful fetch is evidence of acquisition, not certification that a
skill's instructions execute correctly on every agent.

## Authority and validation

Acquisition, management, and authoring answer different questions. Acquisition
recognizes a source and obtains its selected package. Management checks accepted
resolution, integrity, ownership, and placement. Authoring checks conformance to
the creator's chosen format. Installing an external package does not transfer
authorship or submit its prose to AXM's authoring policy.

Metadata extraction is permissive and does not change the input. Unknown keys,
host-specific fields, display names, and support-file naming conventions remain
upstream data. Routine acquired-content health does not warn about cosmetic
conformance. The [Skills principles](skills.md) govern validation across
acquisition, authorship, and publication: a change in authorship does not itself
change compatibility. Explicit conformance checks evaluate the selected format
contract separately from routine management health.

Operational failures remain meaningful: unresolved sources, digest mismatch,
paths outside the selected package, conflicting native ownership, and requested
activation that the selected host cannot realize. A failure describes the
affected selection rather than silently hiding it from discovery.

## Source and package model

The existing source lifecycle remains responsible for Git, local directories,
and Registry artifacts. HTTP artifacts add acquisition of direct skill files,
ZIP and tar archives; well-known indexes resolve into those artifact sources.
Source resolution keeps the user's locator, accepted immutable revision or
digest, and selected relative path distinct.

Concrete format readers describe existing content. They do not constitute a
runtime plugin framework. Their result separates:

| Fact           | Meaning                                                      |
| -------------- | ------------------------------------------------------------ |
| Source         | Where the publisher distributes the content.                 |
| Package root   | The filesystem boundary whose relative layout is retained.   |
| Component path | The member selected for activation within that root.         |
| Declared name  | Upstream display or host identity, preserved verbatim.       |
| AXM key        | A safe management identifier, separate from upstream bytes.  |
| Format         | The discovery semantics selected by the package declaration. |

A standalone skill has coincident package and component roots. Native manifests
for any of the seven extension kinds may share a package root. A plugin can
have several components sharing one package root. Its manifest, support files,
and component paths stay together even when only selected components become
active. AXM metadata and receipts belong outside the upstream payload.

The package boundary, selected component, accepted snapshot, and native output
are separate identities. A retained package uses its actual source address,
independently of the selected kinds or local aliases. Adding another selection
reuses the accepted snapshot. Update stages one replacement and validates all
retained selections, including disabled and Pack-reached consumers, before
committing canonical content, bindings, and native outputs together. Missing
components or a failed write roll back that package transition. Removing one
selection preserves the package until its final consumer is removed. See
[Lockfile](../workspace/lockfile.md) for the authority and recovery contract.

Two candidates declaring the same name remain distinct by source-relative path.
Ambiguity is resolved when selecting a member or native destination, not by
discarding a candidate or refusing the entire repository. A temporary download
directory's name is never an upstream identity.

## Discovery semantics

Ordinary repository discovery recognizes root skills, `skills/`,
`.agents/skills/`, established native skill folders, and nested collections.
It stops below an identified skill so bundled examples and evaluation fixtures
do not become unintended installable members. Explicit paths remain addressable.

An explicitly selected package uses its declared format:

- Agent Plugins 1.0 discovers immediate `skills/` children and root `mcp.json`.
- Claude manifests and marketplace entries retain their distinct default and
  additional-path semantics.
- Codex portable packages and compatibility manifests retain their package
  boundary and OpenAI extension data.
- Cursor manifests identify package roots and declared components; recognizing
  those paths does not emulate Cursor runtime behavior.

Conventions identify input locations independently of native activation support.
An already-installed dependency directory can be inspected without implementing
another package manager's dependency solver.

The [Agent Skills format](https://agentskills.io/specification),
[Agent Plugins format](https://agent-plugins.org/specification), and
[Claude manifest reference](https://code.claude.com/docs/en/plugins-reference)
own their external semantics. The
[well-known discovery proposal](https://github.com/cloudflare/agent-skills-discovery-rfc)
is an ecosystem proposal; its current artifact representation and deployed
legacy indexes are separate supported input contracts.

## Payload fidelity and activation

The accepted snapshot retains file bytes, relative paths, executable modes,
supporting files, and contained source links. Standalone skills support linked
and copied placements. A selected plugin skill whose package context extends
outside its component directory requires a directory link: a filesystem that
cannot provide one is rejected before a context-losing copy can commit. Acquisition neither drops `metadata.json`,
`README.md`, or underscore-prefixed assets nor rewrites frontmatter for a host.

Source links are evaluated within the package root. A link that escapes that
root cannot be materialized as part of the selected package. Projection links
have a separate ownership purpose and remain governed by native placement rules.

Native activation uses existing supported component projections and bounded
major-host integration. Preserved unknown extensions are not advertised as
active capabilities. Repository-maintenance instruction files are fetched only
as content; their presence does not promote them into consumer instructions.

Portable Agent Plugins MCP activation supports explicitly declared HTTP and
SSE connections from local and Git packages. The selected configuration name is
stored separately from the local alias and accepted package identity. Several
connections can share one immutable package snapshot without inventing a
publisher or semantic version. Update advances that shared source; restore and
reinstall retain the accepted content; removal releases it after its last route.

The adapter preserves explicit transport and literal URL/header semantics, and
checks native output through the [declaration authority](../workspace/managed-file-ownership.md#native-declaration-authority)
and readback boundary.
Portable stdio working-directory and plugin-variable semantics, vendor MCP
manifest loaders, and unknown plugin runtime components remain unsupported.
Their files can be retained without activation. CLI evidence for Claude Code,
Codex, and Cursor establishes configuration lifecycle behavior, not execution of
every remote server or conformance to an entire plugin specification.

AXM does not infer dependency installation by reading prose. Package selection
retains explicit grouping and context; the user selects the offered activation
set. A skill referring to another installer also retains that text. AXM-owned
procurement guidance supplies AXM routing without editing the upstream skill.

## First install and management handoff

First install composes minimal scope and agent configuration with acquisition in
the same plan. Preview and failed preflight leave no setup footprint. This path
does not implicitly enroll instruction files, bundled extras, or Registry
authentication. Existing malformed settings and unsupported lock state remain
errors rather than reasons to overwrite configuration.

Agent selection during first install establishes the workspace's destinations.
It does not create an ephemeral per-command subset that a later sync would undo.
Existing workspaces retain their declared activation policy.

Management handoff is distinct from import, fork, and adopt. It reads supported
project and user Skills lock records plus observed native entries, recovers
known source intent, compares actual payloads, and transfers selected ownership
through one transaction. Clean entries can transfer without uninstalling first;
modified, unknown, and unrelated entries remain preserved.

Content hashes and Git folder hashes do not prove an original commit. Handoff
records the evidence supplied by the former manager and a fresh immutable
resolution where needed. It never fabricates historical provenance. Only the
transferred manager records are retired, so unrelated installations retain their
existing updater. Ordinary installation retains its foreign-content protection.

## Creator distribution

Sharing is a read operation over an existing repository or package path. It
derives a usable source locator and exact selection and prints the corresponding
install command. No AXM setup or authored manifest is required.

Optional Registry publication accepts an explicitly supplied existing skill
directory and publisher identity/version. An archive envelope carries that
identity outside the untouched skill payload. The existing publication flow
continues to own admission, authorization, immutable versions, source freshness,
upload settlement, and exact-version verification. The source directory is not
converted into an AXM authoring workspace.

The shared distribution validator checks the envelope and required payload
structure for both existing-directory and authored skill publication.
[Skills](skills.md) explains content preservation and explicit conformance
checks. Consumers do not implicitly republish acquired packages.

## Verification and delivery

The functional specification spans four journeys: acquiring unchanged external
content, using its complete lifecycle, transferring existing installations, and
offering optional AXM distribution from an existing creator layout. Each journey
needs observable evidence at its owning boundary, not just parser examples.

Verification includes a pinned corpus derived from common distributions and
the skills.sh top-ten discovery baseline, plus controlled transport and layout
fixtures. The corpus checks discover, select, install, lint, sync, update,
reinstall, and removal. Separate cases cover ambiguous names, malformed display
metadata, package boundaries, copy/link equivalence, contained links, digest
failure, partial transfer, local edits, and failed operations leaving source and
ownership state unchanged.

The implementation order keeps shared contracts ahead of their consumers:

1. Separate metadata extraction and management health from explicit conformance
   checks; establish exact payload fidelity specifications.
2. Add source and package descriptors, format readers, artifact transports, and
   durable resolution/materialization support.
3. Compose minimal first install, source-aware sharing, and explicit manager
   handoff with existing planning and transaction services.
4. Add existing-layout publication through the normal admission and settlement
   flow; reconcile shared validation and user-facing command contracts.
5. Execute the corpus and affected verification, reconcile the specification
   catalog and architecture, and land the integrated change through required
   pull-request checks.

The repository change does not itself publish a CLI release or deploy a Registry.
Registries consume the shared distribution validator through their normal
versioned dependency adoption. Compatibility claims identify the CLI and
Registry contract versions actually exercised.
