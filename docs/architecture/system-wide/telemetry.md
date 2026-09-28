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
Telemetry remains off unless `AXM_TELEMETRY` explicitly selects full or
errors-only collection;
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
  secrets, or resolved secret values;
- collect error messages, stack traces or stack frames, command arguments,
  file paths, or environment values; or
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

## Failure reports

Errors-only and full collection both send failure reports: bounded,
allowlisted descriptions of the failure that ended an invocation, which the
telemetry service may use to diagnose AXM defects and for anonymous failure
analytics. An invocation reports at most one terminal failure, whether it ends
during startup, configuration, the command, or output. Success, cancellation,
and a failure the command recovered from report nothing.

A failure report carries only:

- a diagnostic kind drawn from a closed set AXM enumerates, with the failure's
  AXM error category and class and whether AXM handled it;
- the time the failure occurred;
- the lifecycle phase in which the invocation ended;
- the canonical command identity when it is known, never its arguments;
- client facts: the AXM client name and version, runtime and runtime version,
  platform, architecture, and whether it runs in CI; and
- correlation identities: the invocation and event identities, plus the
  installation and product activity identities when they exist.

A failure AXM cannot map to an enumerated kind is reported as unknown rather
than described. Because no stack frames are collected, a report identifies what
kind of failure ended an invocation, not where in the code it arose.

## Identity

Enabled telemetry uses a random installation identity persisted beneath the
selected AXM user home. It is not derived from a hostname, workspace, or
extension content, and usage events remain anonymous. Producer-assigned event
identities make retries deduplicable without turning best-effort delivery into
an authoritative audit record. The usage events and failure report of one
invocation share a random invocation identity, so they correlate without any
person identity.

AXM loads or creates the installation identity off the command's critical
path. When identity storage is unavailable or holds something other than an
identity, AXM sends the failure report without an installation identity, skips
the usage events that require one, never substitutes a shared fallback
identity, and leaves the stored file unrepaired.

## Delivery and shutdown

Telemetry delivery is background work owned by the invocation. When the
invocation ends, AXM stops accepting telemetry, waits for pending delivery for
at most 250 ms in total, and interrupts whatever remains. The budget is one
shared allowance per invocation, not one per payload. An interrupted invocation,
such as one stopped by a signal, does not wait for telemetry at all.

## Preview

`AXM_TELEMETRY_PREVIEW` lets the person running the CLI inspect telemetry
before trusting it. With preview on, AXM writes each payload it would otherwise
send to the diagnostic channel as one line, and transmits nothing. The line
carries the exact sanitized wire payload: preview and delivery build it the same
way and encode it with the published contract. Preview obeys consent. It never
enables collection, and it writes nothing while telemetry is off. It loads or
creates the installation identity as delivery would, so the previewed payload
matches the one that would be sent.

## Invariants

- Workspace configuration cannot opt a user into telemetry (the executable
  specification `system/security/telemetry-consent-and-precedence` owns the
  obligation).
- Errors-only mode emits no usage events.
- Disabled mode emits neither usage events nor failure reports.
- Telemetry failure never alters command output, state changes, or exit status
  (the executable specification
  `system/reliability/telemetry-failure-never-alters-outcomes` owns the
  obligation).
- An opted-in invocation reports at most one terminal failure, and none for
  success, cancellation, or a recovered failure (the executable specification
  `system/reliability/telemetry-reports-terminal-failures-once` owns the
  obligation).
- Telemetry payloads remain within the documented data boundary, and failure
  reports carry no messages, stack traces, arguments, paths, or environment
  values (the executable specification
  `system/security/telemetry-payloads-respect-data-boundary` owns the
  obligation).
- Enabled telemetry uses an anonymous random installation identity and stable
  event identities rather than machine-derived identity, and never a shared
  fallback identity when identity storage fails (the executable specification
  `system/security/telemetry-uses-anonymous-installation-identity` owns the
  obligation).
- Preview writes the exact sanitized payload to the diagnostic channel,
  transmits nothing, and writes nothing while telemetry is off (the executable
  specification `system/security/telemetry-preview-never-transmits` owns the
  obligation).
- An invocation waits at most 250 ms in total for pending telemetry when it
  ends, and never when it is interrupted.
- Registry request logging and CLI telemetry remain independently disclosed and
  controlled.

## Specifications

Six executable specifications own telemetry's binding obligations:

- `system/security/telemetry-consent-and-precedence` for consent and
  precedence;
- `system/security/telemetry-payloads-respect-data-boundary` for the data
  boundary;
- `system/security/telemetry-uses-anonymous-installation-identity` for
  anonymous installation and event identity and the identity-storage fallback;
- `system/security/telemetry-preview-never-transmits` for preview;
- `system/reliability/telemetry-failure-never-alters-outcomes` for failure
  isolation; and
- `system/reliability/telemetry-reports-terminal-failures-once` for reporting
  at most one terminal failure per invocation.

Each lives beside the code it specifies in `apps/cli`; the
[specification catalog](../../../specifications/catalog.md) resolves each
identity to its owning project and file. The exact event and failure report
schemas remain executable contracts owned by code and its internal tests.
