---
type: Architecture
status: stable
description: How AXM creates, converts, and changes workspace-authored extension packages.
depends-on:
  - ./overview.md
  - ../extensions/overview.md
  - ../workspace/settings.md
  - ../workspace/execution.md
---

# Authoring

Authoring commands create or change extension packages that a workspace owns.
Package content, workspace configuration, activation, and publication are
related parts of that workflow. Their command-specific outcomes are owned by
the [executable specifications](../../../specifications/catalog.md).

## Responsibilities

The authoring family spans three kinds of work:

- Create a package: type-specific `new` commands start from author input;
  `fork` starts a distinct identity from an AXM package; Skill and Subagent
  import convert supported native content.
- Change ownership of existing content: `adopt` establishes workspace
  authorship; `demote` replaces it with a selected external source.
- Edit an authored package: `version` changes its version, while Pack editing
  changes its declared membership.

MCP import has a separate responsibility: discover native server configuration
and bring the selected configuration under management. Its package-conversion
path is described by the MCP specifications.

Authoring orchestrates package edits through the lifecycle feature. That keeps
content, declarations, and immediate agent outputs in the same execution
model as installation and reconciliation. Registry authentication and
publication remain with their respective features.

## Content, declaration, and activation

Canonical package files hold the portable content and manifest. Workspace
settings record which source supplies the named extension and whether it is
enabled. Activation controls the managed outputs produced for configured
agents; disabling an extension does not turn it into an unconfigured package.

The commands intentionally compose these states differently. Creation can
establish a package, a workspace declaration, and enabled outputs together.
Fork and native import also create workspace declarations while allowing the
target to remain disabled. Adoption and demotion change the source authority
of an existing declaration while preserving its activation choice. The
per-command specifications define those transitions. Workspace configuration
remains the authority for membership and activation across authoring commands.

Workspace authorship is established by the exact `workspace` source, the
workspace owner, the settings key and extension type, and the matching
manifest at the authored location. A package directory alone does not
establish that authority for version editing or publication. This distinction
lets inspection describe content it finds without silently making that
content eligible for an authoring or Registry mutation.

## Local editing and publication

Local creation prepares content for editing. Publication applies its own
stronger checks to the selected authored packages. This separation lets an
empty Pack or an unfinished MCP package remain editable without inventing
external runtime configuration or pretending the package is ready to publish.

Portable manifests describe packages. Workspace declarations describe local
membership and activation. Agent projection details belong to workspace
configuration and the relevant adapter, so changing an authoring workflow
does not add local agent state to the published manifest.

Schemas retain authority over their declared data shapes. CLI help explains
invocation and supplies examples. Internal tests provide implementation
evidence. Observable obligations, including defaults, refusal conditions,
preservation, and output, have one authority under `specifications/`.

## Navigation

Use the [specification catalog](../../../specifications/catalog.md) to enter
`cli/fork`, `cli/adopt`, `cli/demote`, `cli/version`, or a type's `new` command.
The shared creation and native-import requirements live at `cli/`, their
nearest common command ancestor. Pack member editing lives under its actual
`add`, `remove`, and `unpack` commands.

[Workspace execution](../workspace/execution.md) explains lifecycle coordination
and recovery. [Publish](publish.md) explains the publication boundary.
