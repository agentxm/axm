---
type: Architecture
status: stable
description: How native Hook implementations, consumer configuration, declaration-selected activation, and execution evidence remain separate.
depends-on:
  - ./overview.md
  - ./targeting.md
  - ../workspace/overview.md
---

# Hooks

A Hook packages native event handlers and their resources. AXM selects a
compatible implementation and manages its native registration. The configured
host owns event delivery, execution, trust, and interpretation of responses.
Native payloads and decisions retain their host's meaning; selecting an event
with a similar name in another host does not establish equivalent behavior.

## Package, configuration, and activation

One immutable package can contain several identified native implementations
sharing resources. An implementation declares its host protocol and identified
bindings. The same resolver evaluates those bindings for projection and
inspection. A host's generic Hook capability does not establish compatibility
with a particular package version. Missing or ambiguous implementations and
unsupported required behavior block the affected mutation closure.

Consumer configuration belongs to desired workspace state, separate from
package content and accepted resolution. Explicit values override publisher
defaults; secret inputs remain symbolic environment references. A Pack member's
source-less configuration changes its preferences without creating a direct
acquisition route. Package updates are checked against the effective consumer
values before activation.

Native configuration is derived output. Hooks do not contribute instruction
regions: model guidance cannot preserve executable effects or enforcement.
Project and user activation use their respective native locations. Authoring
and native import create inactive packages so that creating or converting
executable content does not also activate it.

## Declaration authority and coexistence

All active Hooks reached through the effective desired graph contribute to a
physical target. Registration selection, update, duplicate handling, retention,
disable and explicit uninstall follow
[native declaration authority](../workspace/managed-file-ownership.md#native-declaration-authority).
Selected direct runtime invocations identify the package's exact canonical
script root. AXM emits no ownership property. Unrelated commands, groups and
settings remain outside the declaration's authority. Several configured readers
share a write only when their complete native renderings and grammars agree.

Preview uses the same selection and validation without executing package code
or writing state. Removing intent alone retains registrations and may leave
execution active. Canonical package deletion refuses retained executable
references rather than leaving broken commands.

## Evidence and inspection

Registration currency, fixture execution, and native invocation answer
different questions. A current registration establishes what AXM wrote, not
whether the host loaded or invoked it. Unknown runtime, host-version, profile,
or trust prerequisites remain qualifications rather than verified support.

Fixture execution requires an explicit command. It uses bounded input, output,
and duration and records package and configuration identity, selected fixtures,
scope, execution platform, observed results, and limitations. Raw process output
is excluded from receipts. This execution is not sandboxed and does not prove
host enforcement or event coverage.

Inspection retains missing, invalid, historical, and stale evidence as distinct
facts. Content, effective configuration, scope, and known execution-platform
changes invalidate matching receipts. Even a matching receipt is historical:
runtime environment values and native host prerequisites have not been
reverified. Plans, inventory, and installed-state inspection carry the same
structured implementation, binding, configuration-provenance, and evidence
facts; human rendering does not infer them from a prose reason.

## Native interchange

Native import preserves original registrations and creates an inactive package
with source provenance. Enabling that copy can cause duplicate execution.
Export uses the projection serializer for an explicitly selected implementation
and creates a new destination containing its scripts, declared resources, native
definitions, and package provenance. Exported registrations carry no AXM
ownership and assume execution from the bundle root.

The interchange subset requires self-contained command resources. It refuses
unsupported native fields, shell expressions, escaping dependencies, private
consumer configuration, and occupied export destinations. It does not infer
dependencies by executing scripts or convert arbitrary plugin environments.
The [Hook command reference](../../../apps/cli/help/topics/hooks.md) owns the
supported inputs and commands.

## Verification boundaries

The [specification catalog](../../../specifications/catalog.md) identifies the
owning contract, lifecycle, configuration, authoring, fixture-execution, and
interchange obligations. Filesystem evidence covers pure preview, ownership,
coexistence, source preservation, and convergent reconciliation. Explicit
process tests cover fixture execution and receipts. Native-host exercises are
separate evidence: serializer or fixture tests cannot establish host invocation.
