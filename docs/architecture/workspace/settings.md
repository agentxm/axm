---
type: Architecture
status: stable
description: Authority and recovery semantics of AXM workspace settings.
depends-on:
  - ./overview.md
  - ../system-wide/telemetry.md
---

# Workspace settings

`.axm/settings.json` is the human-editable source of truth for the explicit,
durable choices in one AXM workspace scope. It records configuration, not the
complete dependency graph or what happens to be installed.

Settings names desired extensions and capabilities. When a settings entry
references a workspace-authored package, its manifest supplies canonical
package meaning. Authored manifests outside settings remain authoring
inventory, not desired roots. Lock rows, canonical extension content, and
managed outputs must never be used to invent missing settings.

## Responsibilities

Settings records several kinds of choices that a user may reasonably make and
review:

| Configuration kind          | Architectural role                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Extension intent            | Names directly desired extensions, source or version constraints, and activation.                          |
| Workspace realization       | Selects coding agents, inline definitions, and workspace capabilities such as instruction-file management. |
| Acquisition policy          | Configures source hosts and policy that constrains new resolution.                                         |
| Authoring defaults          | Supplies workspace identity defaults used for authoring and local resolution.                              |
| Workspace validation policy | Configures lint behavior without declaring extensions desired.                                             |

Extension entries are roots of desired state. Pack members remain derived from
accepted locked Pack metadata or workspace-authored Pack manifests; AXM does not
flatten them into settings.

An extension entry and capability configuration have different
jobs. An entry expresses whether one extension is desired and active. Feature
configuration governs how a capability as a whole participates in the
workspace. Enabling a Rule, for example, is distinct from enabling
instruction-file management.

Instruction-file management is a first-class workspace capability represented
by the top-level `instructionFiles` object, not Rule configuration. Absence
means the capability has not been configured; an object enables it with
filename and alias preferences, and the literal `false` disables it.

Project and user scopes have separate settings files. Extension roots,
activation, configured agents, inline definitions, and workspace capabilities
remain local to the selected scope. A command changes only that scope.

Some defaults and policies are intentionally layered for project operations.
Project source hosts override same-named user hosts, which override built-in
hosts. Project authoring and release policies may fall back to user settings
when the project has not made an explicit choice. An explicit project value,
including an empty exclusion list, wins. This inheritance never imports user
extension roots, agent targets, or activation into project desired state.

## Non-responsibilities

Settings is not the complete desired-state model and does not describe current
workspace state.

| Settings does not own                                | Owner                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Expanding Pack members                               | Desired-state derivation from authored manifests and accepted locked Pack metadata |
| Selecting and accepting an exact external identity   | Resolution and authoritative lock state                                            |
| Proving extension content or managed outputs exist   | Observed filesystem and agent state                                                |
| Materializing, updating, or removing managed content | Lifecycle commands and sync                                                        |
| Establishing ownership of existing native units      | Authorship and unit-local AXM ownership evidence                                   |
| Storing credentials or resolved secrets              | The user's environment or external secret store                                    |
| Choosing CLI telemetry behavior                      | Process or user environment policy                                                 |

## Authoring defaults and identity

Authoring defaults reduce repeated input without turning inference into user
intent. They resolve from an explicit command input, then project settings,
then user settings, then a safe built-in. An optional value with no expressed
default is omitted; a required value with no safe default blocks creation.

The configured workspace owner is an authoring and local-resolution default.
It does not authenticate the current user, confer Registry ownership,
establish an accepted external resolution, or grant AXM authority over
existing content. Authentication may verify a Registry operation or present an
owner choice, but it never silently supplies durable authorship.

Owner, author attribution, publisher authorization, and license are distinct.
A configured license is an expressed legal choice; `UNLICENSED` is likewise a
deliberate choice rather than a fallback. External software-package identity
and runtime connection details are extension declarations, not values AXM can
derive from a workspace owner.

Authoring defaults do not import activation or targeting from user scope.
Activation and configured agents remain project workspace intent, and agent
targets never become portable manifest metadata. The
[authoring model](../commands/authoring.md) owns how commands apply these
defaults.

[Telemetry](../system-wide/telemetry.md) is not workspace desired state.
Project or user-scope `settings.json` does not enable or disable it, and Registry
request logging remains a separate service concern.

A settings entry expresses a durable choice. It does not prove that the choice
has been resolved or realized successfully.

## Editing and ownership

The workspace owns settings. Direct editing is a supported way to express
intent, and routine lifecycle commands make the equivalent narrow semantic
edits. AXM must preserve unrelated settings, unknown top-level data, and the
formatting of content it did not change.

Preservation does not make an unknown field valid. Lint reports unsupported
keys, while narrow writes retain unrelated content. Known objects remain strict
so a misspelled or unsupported option cannot be mistaken for an accepted
choice. Unsupported settings shapes are rejected; AXM provides no dual reader,
automatic migration or cleanup, alias, or downgrade mode.

Settings should be committed with the workspace. Because the file is shared,
it contains no credentials or resolved secret values. Configuration that needs
a secret stores a reference to an external value instead.

## Missing and invalid settings

A missing settings file contains no expressed workspace choices. Setup or a
lifecycle command may create it when that command clearly expresses new
configuration; read-only commands and sync do not reconstruct it from installed
files or lock state.

Malformed or schema-invalid settings are still user-owned configuration. AXM
reports the invalid facts and does not treat the file as empty, rewrite it from
observed state, or apply a lifecycle change that depends on guessing its
meaning. The user or agent corrects the configuration directly.

## Testing strategy

Behavior tests prove direct-edit equivalence, scope-local desired intent,
documented fallback precedence for defaults and policy, preservation of
unrelated and unknown data during semantic edits, refusal to guess malformed
or unsupported intent, schema-level decoded equivalence, and
transactional settings changes with the managed state that depends on them.
