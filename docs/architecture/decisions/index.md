# AXM architecture decisions

Accepted decision records with durable consequences. Each record owns one
choice, its context, rationale, alternatives, consequences, and
reconsideration conditions. Enforceable consequences live as executable
specifications, never in these records.

- [Executable specifications own AXM requirements](executable-specifications-authority.md) —
  executable specifications are the sole local authority for accepted AXM
  requirements; documentation retains explanation without owning obligations
- [Colocated specifications](colocated-specifications.md) — specifications
  live beside the source they govern, are discovered per owner project from
  the project graph, keep a stable identity independent of path, are labelled
  by purpose at execution, and are compared by metadata, decisive examples,
  and body
- [Specification infrastructure decisions](specification-infrastructure.md) —
  deprecated; the pilot-era identity, ownership, adapter, and governance
  decisions superseded by colocated specifications, kept for links and history
- [Shared specification contract](shared-specification-contract.md) — the
  metadata contract, classification lens, vocabularies, and shared product-goal
  identities live once in `@agentxm/specification-metadata` and are consumed by
  every AgentXM specification corpus
- [Package classification and dependency policy](package-classification-and-dependency-policy.md) —
  strategic domain comes from placement under `packages/{core,supporting,generic}/`
  and technical role from an authored tag; the two matrices are enforced
  independently, with named contract seams and tooling barred from runtime
- [Dual TypeScript alias toolchain](typescript-dual-alias.md) — type check on
  the native TypeScript 7 compiler while `typescript` resolves to the
  TypeScript 6 compatibility package, exiting at TypeScript 7.1
- [Project workspace settings validity prerequisite](project-workspace-settings-validity-prerequisite.md) —
  project workspace construction fails before operation execution when either
  present settings source is invalid
- [Official AXM skill is opt-in](official-axm-skill-is-opt-in.md) — workspaces
  declare the official skill directly or through a Pack before compatibility
  applies; undeclared absence remains informational
- [CLI output view model and terminal ownership](cli-output-view-model-and-terminal-ownership.md) —
  human output crosses the application boundary as a typed document painted by
  one terminal owner while machine output remains schema-backed
- [CLI vocabulary and machine contracts](cli-vocabulary-and-machine-contracts.md) —
  shared language follows input roles and state ownership, with common parameter
  metadata, published schema families, and explicit exceptions
- [CLI live-event contract](cli-live-event-contract.md) — long-running
  operations publish one schema-backed lifecycle event stream that the live
  frame, the machine event writer, and telemetry consume independently
- [CLI ledger grammar and application-owned prompts](cli-ledger-grammar-and-application-owned-prompts.md) —
  shared document grammar and application-owned interactions accumulate a
  stable transcript while one active region owns terminal updates
- [MCP local names are connection identity, not source identity](mcp-local-connection-identity.md) —
  MCP local names identify connections and native projections, while source
  authority and published package identity define shared resolution.
- [Agent targeting is workspace membership](agent-targeting-is-workspace-membership.md) —
  agent selection chooses the workspace's configured agents or filters a
  listing; an extension applies to every configured agent that can represent
  it, never to a per-entry subset
- [Closure atomicity and recovery](closure-atomicity-and-recovery.md) — a
  workspace change is atomic per semantic closure: a failed closure is restored,
  independently settled closures stay committed, an interruption leaves
  authoritative files whole and names a recovery route, and remote Registry
  effects are never rolled back
- [Pack retirement when the package cannot be read](pack-retirement-when-the-package-cannot-be-read.md) —
  retirement uses accepted dependency authority for reachability while
  preserving and reporting unverified physical content
- [Shared desired-state reconciliation](shared-desired-state-reconciliation.md) — shared realization policy belongs below peer command features and above canonical and projection mechanics
- [Node runtime floor is Node 24](node-runtime-floor.md) — the development
  pin, the published `engines.node` range, and the `@types/node` ceiling are
  one Node 24 floor that CI exercises where it is declared
- [Workspace split into kernel, kinds, and features](workspace-split-into-kernel-kinds-and-features.md) —
  The workspace compiler is three packages — a kernel capability, an
  extension-kind capability, and a feature package — each built from flat
  folder slices, with direction between packages enforced by Nx and direction,
  isolation, and acyclicity between slices enforced by lint and the
  source-graph check.

- [Skill compatibility is independent of authorship](skill-compatibility-is-independent-of-authorship.md) —
  managing or publishing a skill does not impose universal portability or
  change its native behavior
