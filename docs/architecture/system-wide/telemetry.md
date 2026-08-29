---
type: Architecture
status: stable
description: Telemetry ownership, control, privacy, and failure boundaries across the AXM CLI.
depends-on:
  - ../principles.md
---

# Telemetry

Telemetry is optional, best-effort observation of AXM CLI usage and failures for
product improvement. It is separate from the command outcome, workspace state,
and request data necessarily observed by a Registry service.

## Responsibilities

AXM discloses that telemetry exists, keeps collection within its documented
purpose, and gives the person running the CLI deterministic local control.
`AXM_TELEMETRY` selects full, errors-only, or disabled collection;
`DO_NOT_TRACK` disables it regardless of the AXM-specific selection.

Telemetry delivery never changes command behavior or success. Collection and
transport failures remain invisible to the requested operation. Exact events
and fields are executable contracts owned by code and tests rather than an
inventory in this document.

## Non-responsibilities

Telemetry does not:

- express workspace desired state or belong in project or user-scope
  `axm.json`;
- let a committed workspace enable collection for its contributors;
- participate in command planning, lifecycle, reconciliation, diagnostics, or
  recovery;
- provide an authoritative audit or operational record;
- collect extension content, authored instructions or Knowledge, credentials,
  secrets, or resolved secret values; or
- control or describe Registry request logging, retention, or service
  analytics.

Registry request data exists at a separate network-service boundary and is
governed by the Registry's privacy and operational policies. Disabling CLI
telemetry does not prevent data required to serve a Registry request from
reaching that Registry.

## Control and ownership

Telemetry policy belongs to the process or user environment. AXM does not add a
workspace setting or command merely to persist it. Environment configuration
may be applied to one invocation, a shell, a user profile, or an automation
environment without changing repository state.

No lower-precedence control may override `DO_NOT_TRACK`
([AXM-REQ-0015](../../../gen-stack/system/requirements/constraint/do-not-track-takes-precedence.md)
is canonical). Invalid telemetry configuration fails closed for collection
without failing the requested command.

## Invariants

- Workspace configuration cannot opt a user into telemetry
  ([AXM-REQ-0014](../../../gen-stack/system/requirements/constraint/workspace-configuration-cannot-enable-telemetry.md)
  is canonical).
- Errors-only mode emits no usage events.
- Disabled mode emits neither usage nor error events.
- Telemetry failure never alters command output, state changes, or exit status
  ([AXM-REQ-0016](../../../gen-stack/system/requirements/functional/telemetry-failure-never-alters-outcome.md)
  is canonical).
- Telemetry payloads remain within the documented data boundary
  ([AXM-REQ-0017](../../../gen-stack/system/requirements/constraint/telemetry-collection-respects-data-boundary.md)
  is canonical).
- Registry request logging and CLI telemetry remain independently disclosed and
  controlled.

## Testing strategy

Behavior tests prove environment precedence, all modes, invalid-value behavior,
payload redaction and exclusion, and telemetry transport failure isolation.
Contract tests own the exact event schema and prevent new fields from bypassing
review.
