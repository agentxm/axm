# Workspace settings

`.axm/settings.json` is the human-editable source of truth for the explicit,
durable choices in one AXM workspace scope. It records configuration, not the
complete dependency graph or what happens to be installed.

Settings and workspace-authored manifests provide the configuration from which
AXM derives desired state. The lockfile, canonical packages, trust records, and
agent outputs must never be used to invent missing settings.

## Responsibilities

Settings records choices that a user may reasonably make and review:

- directly desired extensions and their source or version constraints;
- whether a directly configured extension is active;
- coding agents that should receive managed outputs;
- named source hosts and resolution policy;
- workspace identity and product preferences; and
- feature configuration such as lint policy or instruction behavior.

Extension entries are roots of desired state. Pack members and transitive
dependencies remain derived from trusted extension metadata or
workspace-authored manifests; AXM does not flatten them into settings.

Project and user scopes have separate settings. A command reads and changes
only its selected scope. One scope does not silently contribute extension
configuration to another.

## Non-responsibilities

Settings is not the complete desired-state model and does not describe current
workspace state.

| Settings does not own                                | Owner                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Expanding pack members and transitive dependencies   | Desired-state derivation from configuration and trusted metadata |
| Selecting an exact version or immutable revision     | Resolution, recorded in the lockfile                             |
| Establishing accepted external source identity       | Trust state                                                      |
| Proving package content or agent outputs exist       | Observed filesystem and agent state                              |
| Materializing, updating, or removing managed content | Lifecycle commands and sync                                      |
| Establishing ownership of existing paths             | Authorship, trust, and AXM ownership evidence                    |
| Recording command results or installation history    | No workspace configuration artifact                              |
| Storing credentials or resolved secrets              | The user's environment or external secret store                  |

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
files or the lockfile.

Malformed or schema-invalid settings are still user-owned configuration. AXM
reports the invalid facts and does not treat the file as empty, rewrite it from
observed state, or apply a lifecycle change that depends on guessing its
meaning. The user or agent corrects the configuration directly. `lint --fix`
may change it only when the correction is unambiguous and meaning-preserving.
---

status: stable
description: Authority and recovery semantics of AXM workspace settings.
---
