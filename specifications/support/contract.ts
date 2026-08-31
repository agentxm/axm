/**
 * Specification metadata contract.
 *
 * Every `*.spec.ts` file under `specifications/` exports one `specification`
 * constant built with `defineSpecification`. The metadata is data: a literal
 * object carrying only the cross-method information that discovery and
 * reporting need. It never wraps or replaces native test framework
 * constructs, and the catalog generator reads it statically without
 * executing the specification.
 *
 * Metadata fields must be literal expressions (strings, arrays, and object
 * literals). The catalog generator rejects computed metadata so that a
 * specification change is always visible as an explicit requirement-contract
 * diff.
 */

/** The kind of accepted requirement a specification states. */
export type RequirementClass =
  | "functional"
  | "installability"
  | "compatibility"
  | "performance"
  | "security"
  | "usability"
  | "architecture"
  | "process"
  | "external-conformance";

/** How a requirement participates in the product contract and its reading paths. */
export type RequirementRole = "experience" | "interface" | "supporting";

/**
 * Where the specification's default execution observes the system. Additional
 * boundary-specific executions (for example end-to-end) bind their own
 * evidence to the same requirement identity.
 */
export type ExecutionBoundary =
  | "memory"
  | "process"
  | "binary"
  | "packed-artifact"
  | "installed"
  | "platform"
  | "published-artifact"
  | "deployed"
  | "repository";

/** When this specification's evidence is selected by default. */
export type ExecutionSelection =
  "per-change" | "platform-matrix" | "scheduled" | "release-candidate" | "post-deployment";

export interface SpecificationMetadata {
  /**
   * Stable requirement identity: lowercase kebab path segments joined by `/`,
   * for example `cli/install/realizes-direct-intent`. Declared here, not
   * derived from the filesystem; repository policy keeps it equal to the
   * file's path under `specifications/`, so moving or renaming a file is an
   * identity change — a requirements decision, like retiring or replacing
   * the identity.
   */
  readonly requirement: string;
  /** Product-language requirement title, readable without the source. */
  readonly title: string;
  /** The requirement class this specification states. */
  readonly class: RequirementClass;
  /**
   * The requirement's primary role in the product contract. Experience
   * requirements describe tasks in product language, interface requirements
   * state public machine-consumable contracts, and supporting requirements
   * state subordinate system or engineering obligations.
   */
  readonly role: RequirementRole;
  /**
   * Registered product-goal identities this requirement supports. Every entry
   * must exist in `specifications/product-goals.ts` and be active.
   */
  readonly goals: readonly [string, ...string[]];
  /** Observation boundary of the default execution. Defaults to `memory`. */
  readonly boundary?: ExecutionBoundary;
  /**
   * Testing methods the specification actually uses — an extensible
   * vocabulary, for example `example`, `decision-table`, `property`,
   * `model`, `contract`, `golden-output`, `measurement`, or `smoke`.
   */
  readonly methods?: readonly [string, ...string[]];
  /** Default evidence-selection policy. Defaults to `per-change`. */
  readonly selection?: ExecutionSelection;
}

/** Segments of a requirement identity or product-goal identity. */
export const IDENTITY_SEGMENT_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const REQUIREMENT_CLASSES: readonly RequirementClass[] = [
  "functional",
  "installability",
  "compatibility",
  "performance",
  "security",
  "usability",
  "architecture",
  "process",
  "external-conformance",
];

export const REQUIREMENT_ROLES: readonly RequirementRole[] = [
  "experience",
  "interface",
  "supporting",
];

export const EXECUTION_BOUNDARIES: readonly ExecutionBoundary[] = [
  "memory",
  "process",
  "binary",
  "packed-artifact",
  "installed",
  "platform",
  "published-artifact",
  "deployed",
  "repository",
];

export const EXECUTION_SELECTIONS: readonly ExecutionSelection[] = [
  "per-change",
  "platform-matrix",
  "scheduled",
  "release-candidate",
  "post-deployment",
];

/**
 * Declares one specification's metadata. Identity function: it exists to type
 * the literal and to give discovery a stable syntactic anchor.
 */
export const defineSpecification = <const M extends SpecificationMetadata>(metadata: M): M =>
  metadata;

/** One registered product goal. */
export interface ProductGoalDefinition {
  /** One-sentence statement of the desired outcome this goal names. */
  readonly outcome: string;
  /**
   * Retired goals stay registered so specifications referencing them are
   * flagged as retirement candidates instead of silently orphaned.
   */
  readonly status?: "active" | "retired";
}

/**
 * Declares the product-goal registry. Identity function with the same
 * literal-only discipline as `defineSpecification`.
 */
export const defineProductGoals = <const R extends Readonly<Record<string, ProductGoalDefinition>>>(
  registry: R,
): R => registry;

/**
 * Binds a boundary-specific execution (for example an end-to-end test file)
 * to the requirement identities it provides evidence for. The execution is
 * evidence, never a second authority: it must not state new requirements.
 */
export interface ExecutionBinding {
  /** Requirement identities this execution binds evidence to. */
  readonly requirements: readonly [string, ...string[]];
  /** Observation boundary of this execution. */
  readonly boundary: ExecutionBoundary;
  /**
   * The boundary-specific reason this execution exists beyond the in-memory
   * evidence — required so end-to-end scenarios never silently duplicate
   * in-memory scenarios.
   */
  readonly rationale: string;
}

/** Declares a boundary-specific execution binding. Identity function. */
export const defineExecutionBinding = <const B extends ExecutionBinding>(binding: B): B => binding;

/**
 * One static verification gate whose result is bound to the owning
 * specification's requirement identity. Bound evidence supports the owning
 * specification; it never replaces it and never states a new requirement.
 * The catalog reads the declaration statically beside the specification
 * metadata under the same literal-only discipline.
 */
export interface BoundEvidenceGate {
  /** The static gate, named by the verification surface that runs it. */
  readonly gate: string;
  /** What the gate verifies for this requirement, in product language. */
  readonly verifies: string;
}

/**
 * Declares the static gates bound to a specification as evidence. Exported
 * as `boundEvidence` beside the `specification` constant. Identity function.
 */
export const defineBoundEvidence = <
  const E extends readonly [BoundEvidenceGate, ...BoundEvidenceGate[]],
>(
  evidence: E,
): E => evidence;
