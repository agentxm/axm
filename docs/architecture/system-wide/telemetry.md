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

No lower-precedence control may override `DO_NOT_TRACK` (the executable
specification `system/security/telemetry-consent-and-precedence` in the
[specification catalog](../../../specifications/catalog.md) owns consent and
precedence). Invalid telemetry configuration fails closed for collection
without failing the requested command.

## Invariants

- Workspace configuration cannot opt a user into telemetry (the executable
  specification `system/security/telemetry-consent-and-precedence` owns the
  obligation).
- Errors-only mode emits no usage events.
- Disabled mode emits neither usage nor error events.
- Telemetry failure never alters command output, state changes, or exit status
  (the executable specification
  `system/security/telemetry-failure-never-alters-outcomes` owns the
  obligation).
- Telemetry payloads remain within the documented data boundary (the
  executable specification
  `system/security/telemetry-payloads-respect-data-boundary` owns the
  obligation).
- Registry request logging and CLI telemetry remain independently disclosed and
  controlled.

## Specifications

The telemetry specifications under `specifications/system/security/` own the
binding consent, precedence, failure-isolation, and data-boundary obligations;
the [specification catalog](../../../specifications/catalog.md) indexes them.
The exact event schema remains an executable contract owned by code and its
internal tests.
