---
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

Settings and workspace-authored manifests provide the configuration from which
AXM derives desired state. Receipt history, canonical extension content, trust
records, and managed outputs must never be used to invent missing settings.

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
trusted Pack metadata or workspace-authored Pack manifests; AXM does not
flatten them into settings.

An extension entry and capability configuration have different
jobs. An entry expresses whether one extension is desired and active. Feature
configuration governs how a capability as a whole participates in the
workspace. Enabling a Rule, for example, is distinct from enabling
instruction-file management.

Instruction-file management is a first-class workspace capability represented
by the top-level `instructionFiles` object, not Rule configuration. Absence
means the capability has not been configured; the object is enabled unless it
contains `enabled: false`, allowing filename and alias preferences to survive
disablement.

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

| Settings does not own                                | Owner                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Expanding Pack members                               | Desired-state derivation from configuration and trusted metadata |
| Selecting and accepting an exact version or revision | Resolution and trust/provenance                                  |
| Establishing accepted external source identity       | Trust state                                                      |
| Proving extension content or managed outputs exist   | Observed filesystem and agent state                              |
| Materializing, updating, or removing managed content | Lifecycle commands and sync                                      |
| Establishing ownership of existing paths             | Authorship, trust, and AXM ownership evidence                    |
| Recording successful resolution or materialization   | Receipt history in the lockfile                                  |
| Storing credentials or resolved secrets              | The user's environment or external secret store                  |
| Choosing CLI telemetry behavior                      | Process or user environment policy                               |

The configured workspace owner is an authoring and resolution default. It does
not authenticate the current user, confer registry ownership, establish source
trust, or grant AXM authority over existing content.

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
keys, while writes retain them so an older AXM or a focused command does not
destroy data it does not understand. Known nested objects remain strict so a
misspelled option cannot be mistaken for an accepted choice.

Settings should be committed with the workspace. Because the file is shared,
it contains no credentials or resolved secret values. Configuration that needs
a secret stores a reference to an external value instead.

## Missing and invalid settings

A missing settings file contains no expressed workspace choices. Setup or a
lifecycle command may create it when that command clearly expresses new
configuration; read-only commands and sync do not reconstruct it from installed
files or receipt history.

Malformed or schema-invalid settings are still user-owned configuration. AXM
reports the invalid facts and does not treat the file as empty, rewrite it from
observed state, or apply a lifecycle change that depends on guessing its
meaning. The user or agent corrects the configuration directly. `lint --fix`
may change it only when the correction is unambiguous and meaning-preserving.

## Testing strategy

Behavior tests prove direct-edit equivalence, scope-local desired intent,
documented fallback precedence for defaults and policy, preservation of
unrelated and unknown data during semantic edits, refusal to guess malformed
intent, and transactional settings changes with the managed state that depends
on them.
