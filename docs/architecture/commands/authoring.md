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

AXM authoring commands create or deliberately change workspace-authored
canonical extension content. Creating a package, making it desired in the
workspace, and making it eligible for publication are separate decisions.

## Responsibilities

The authoring family includes:

- `new`, which creates a minimal type-correct package from author intent;
- `fork`, which creates a new authored identity from an existing managed AXM
  package while leaving the source unchanged;
- `import`, including type-specific import or copy commands, which losslessly
  converts supported native content into an authored AXM package;
- `adopt`, which explicitly changes retained canonical content to workspace
  authorship;
- `demote`, which explicitly replaces workspace authorship with a supported
  external source;
- `version`, which changes the version of an existing workspace-authored
  package; and
- type-specific commands that edit canonical authored content, such as Pack
  membership operations.

These commands establish package identity and authorship, validate the
representation they create, and report every durable change. Exact commands,
flags, filenames, supported conversions, and manifest fields remain executable
contracts owned by CLI help, schemas, and behavior tests.

## Non-responsibilities

Authoring does not authenticate Registry ownership, publish content, infer
legal or external identity, make every native format losslessly convertible,
or activate a new package without explicit user intent. It does not use
scaffolding as a shortcut around normal lifecycle, projection, ownership, or
publication rules.

## Authoring inventory is not desired state

```text
authoring intent -> workspace-authored canonical content
                                      |
                                      | explicit activation
                                      v
workspace configuration -> desired workspace state -> managed outputs
```

A newly created, forked, copied, or imported package enters
[authoring inventory](../glossary.md#authoring-inventory). It does not become a
desired extension and produces no managed output unless the invocation
explicitly requests activation. Activation records a workspace source entry in
settings and realizes it through the normal lifecycle model; it is not a
manifest field.

AXM discovers authoring inventory from canonical package directories and valid
manifests, independently of desired settings. Inspection, version, and publish
commands can therefore select an authored package before it is activated.

An operation that changes the authority of an already desired extension, such
as adoption or demotion, preserves its durable activation unless the user
expresses a different lifecycle choice separately. Version changes and edits
to authored content likewise do not change desired membership or activation.

Any authoring option that promises durable placement or behavior must write an
authoritative value that later reconciliation consumes. A command must not
offer a persistent agent target, activation, or similar option if the
workspace model cannot represent it. Agent targets belong in workspace
configuration, never in portable extension manifests.

## Scaffold defaults and explicit intent

Scaffolds begin at version `0.1.0` across every extension type. They populate
only values that are required and safely determined from the command and
extension standard, such as schema reference, owner, type, name, version, and
fixed type-format metadata. A type may generate minimal content required for a
locally valid package.

Values that assert human, legal, Registry, runtime, or external-package intent
are never invented. These include:

- license, including the deliberate `UNLICENSED` choice;
- author or contributor attribution;
- publisher identity and Registry ownership;
- external software-package identity; and
- MCP transport, command, endpoint, inputs, and runtime requirements.

When a value is not required for local validity and the user has not expressed
it, AXM omits it. When a required value has no safe default, the command fails
with enough context to supply it. Plausible example identities and guessed
licenses are not safe defaults.

Defaults resolve in this order:

1. an explicit command input;
2. a project authoring default;
3. a user authoring default;
4. a safe built-in value; then
5. omission for an optional value or failure for a required value.

Authentication may verify a Registry operation or help present an owner
choice, but it is not an invisible authoring default. A selected owner becomes
durable author intent only when supplied by the command or configured in
settings. Frequently repeated author intent belongs in settings; one-off
choices belong on the authoring command. CLI help owns the exact inputs.

## Local validity and publication eligibility

A scaffold must be structurally valid for local editing and inspection. It
does not need to pretend unfinished content is ready to distribute. Publish
applies the stronger [publication eligibility](publish.md) gate for legal,
Registry, external-identity, archive, and discovery-quality obligations.

This separation allows an empty Pack, an unfinished body, or an MCP package
awaiting a real external package identity to remain honest authoring inventory.
Publish reports what is still required; it does not fill or rewrite the
manifest.

## Creation, preview, and recovery

Creation and conversion are create-only at the target identity and canonical
path. Existing authored content, configured entries, and colliding targets are
reported rather than overwritten. Editing commands change only the selected
authored package and preserve unrelated content.

Preview describes the same package, settings, and projection changes that
application would make. Before application, AXM verifies the target and source
facts used by the plan. A stale source, newly occupied target, invalid
conversion, or failed projection produces no partial authored package or
activation. The authored package, optional settings change, and any immediate
owned outputs form one semantic mutation closure.

After an abrupt process exit, complete canonical directories and authoritative
settings remain the recovery baseline. AXM never resumes a half-authorized
authoring intent or reconstructs it from temporary files.

## Rationale

Package ecosystems commonly separate initialization from publication: an init
command generates deterministic identity and structural metadata, configured
defaults reduce repeated input, and publish enforces the stronger Registry and
legal contract. AXM follows that shape while keeping activation separate
because activating an extension also changes durable workspace intent and may
write outputs for several coding agents.

## Testing strategy

A catalog-driven authoring conformance suite proves the same initial version,
create-only behavior, inventory-only creation by default, explicit activation,
default precedence, preview parity, transaction boundaries, and no fabricated
legal or external identity across every extension type. Focused tests cover
type-required files and metadata, lossless fork and import rules, authority
transitions, version changes, unsupported conversions, and the distinction
between local validity and publication eligibility.
