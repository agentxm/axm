/**
 * Shared executable-specification contract.
 *
 * One metadata contract, one classification lens, one set of controlled
 * vocabularies, and one shared product-goal registry for every AgentXM
 * specification corpus. Each repository keeps its own specification files,
 * local product goals, and local placement rules; only this contract and the
 * shared goal identities cross the repository boundary.
 *
 * Metadata is data. Every specification file exports one `specification`
 * constant built with `defineSpecification`: a literal object carrying only
 * the cross-method information that discovery, conformance, and reporting
 * need. It never wraps or replaces native test-framework constructs, and
 * catalog tooling reads it statically without executing the specification.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * The review lens a specification is classified by. Classification selects
 * the review expertise and quality criteria the obligation most needs; it
 * does not determine priority, acceptance, subject, or verification method.
 *
 * - `functional`: responses, transformations, rules, and observable
 *   capabilities;
 * - `quality`: a measurable degree such as performance, reliability,
 *   security, or installability, named by `characteristic`;
 * - `constraint`: a genuine restriction on solution, environment,
 *   technology, or operation;
 * - `external-conformance`: an obligation adopted from a named law,
 *   standard, contract, or interface;
 * - `human-factors`: capabilities and qualities arising from people, tasks,
 *   accessibility, ergonomics, or context of use; and
 * - `process`: an obligation on development, delivery, operation, support,
 *   migration, or retirement.
 */
export type SpecificationClass =
  "functional" | "quality" | "constraint" | "external-conformance" | "human-factors" | "process";

export const SPECIFICATION_CLASSES: readonly SpecificationClass[] = [
  "functional",
  "quality",
  "constraint",
  "external-conformance",
  "human-factors",
  "process",
];

/**
 * How a specification participates in the product contract and its reading
 * paths. Experience specifications describe tasks in product language,
 * interface specifications state public machine-consumable contracts, and
 * supporting specifications state subordinate system or engineering
 * obligations.
 */
export type SpecificationRole = "experience" | "interface" | "supporting";

export const SPECIFICATION_ROLES: readonly SpecificationRole[] = [
  "experience",
  "interface",
  "supporting",
];

/**
 * Whether the obligation is normative. A `candidate` records a proposed
 * obligation with its sources and is never authority; `accepted` records an
 * obligation the declared acceptance authority has explicitly accepted.
 * Execution evidence never changes status.
 */
export type SpecificationStatus = "candidate" | "accepted";

export const SPECIFICATION_STATUSES: readonly SpecificationStatus[] = ["candidate", "accepted"];

/**
 * Where the specification's default execution observes the system.
 * Additional boundary-specific executions bind their own evidence to the
 * same requirement identity.
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

/** When this specification's evidence is selected by default. */
export type ExecutionSelection =
  "per-change" | "platform-matrix" | "scheduled" | "release-candidate" | "post-deployment";

export const EXECUTION_SELECTIONS: readonly ExecutionSelection[] = [
  "per-change",
  "platform-matrix",
  "scheduled",
  "release-candidate",
  "post-deployment",
];

/**
 * Known testing methods. The vocabulary is extensible: a method not listed
 * here is accepted when it is a lowercase kebab identifier, so a new or
 * combined method never needs a contract change before use.
 */
export const KNOWN_SPECIFICATION_METHODS = [
  "example",
  "decision-table",
  "property",
  "model",
  "contract",
  "conformance-matrix",
  "golden-output",
  "measurement",
  "static",
  "smoke",
  "manual",
  "review",
] as const;

export type KnownSpecificationMethod = (typeof KNOWN_SPECIFICATION_METHODS)[number];

/**
 * Methods whose evidence is produced by a person rather than a runner. A
 * specification whose methods are all unverifiable is reported as unverified
 * by the harness; it is never reported as passing.
 */
export const UNVERIFIABLE_SPECIFICATION_METHODS: readonly KnownSpecificationMethod[] = [
  "manual",
  "review",
];

/**
 * Known quality characteristics. Required for `quality`-class specifications
 * and permitted elsewhere; extensible under the same identifier rule as
 * methods.
 */
export const KNOWN_QUALITY_CHARACTERISTICS = [
  "installability",
  "compatibility",
  "performance",
  "security",
  "privacy",
  "reliability",
  "availability",
  "maintainability",
  "observability",
  "accessibility",
  "usability",
] as const;

export type KnownQualityCharacteristic = (typeof KNOWN_QUALITY_CHARACTERISTICS)[number];

/** Segments of a requirement identity or product-goal identity. */
export const IDENTITY_SEGMENT_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A declared blind spot of one specification and the condition that retires it. */
export interface SpecificationLimitation {
  /** What the specification's evidence cannot establish, in product language. */
  readonly limitation: string;
  /** The observable condition under which this limitation is removed. */
  readonly retirementCondition: string;
}

export interface SpecificationMetadata {
  /**
   * Stable requirement identity: lowercase kebab path segments joined by `/`,
   * for example `cli/install/realizes-direct-intent`. Declared here, not
   * derived from the filesystem; repository policy keeps it equal to the
   * file's path under `specifications/`, so moving or renaming a file is an
   * identity change — a requirements decision.
   */
  readonly requirement: string;
  /** Product-language title, readable without the source. */
  readonly title: string;
  /**
   * The normative statement: obligated subject, condition or trigger, and
   * the required or prohibited outcome, in product language. This sentence
   * is the obligation; native tests are its reportable scenarios.
   */
  readonly statement: string;
  /** The review lens this specification is classified by. */
  readonly class: SpecificationClass;
  /**
   * The quality characteristic a `quality` specification measures, or the
   * human-factors quality a `human-factors` specification names. Required
   * for `quality`; optional otherwise.
   */
  readonly characteristic?: string;
  /** The specification's primary role in the product contract. */
  readonly role: SpecificationRole;
  /**
   * Registered product-goal identities this specification supports. Every
   * entry must exist, active, in the shared registry or the repository's
   * local registry.
   */
  readonly goals: readonly [string, ...string[]];
  /** Whether the obligation is a candidate or accepted authority. */
  readonly status: SpecificationStatus;
  /** Observation boundary of the default execution. Defaults to `memory`. */
  readonly boundary?: ExecutionBoundary;
  /**
   * Why this specification observes a boundary other than memory: the
   * evidence that boundary supplies which an in-memory run cannot. Required
   * whenever `boundary` is not `memory`.
   */
  readonly boundaryRationale?: string;
  /** Testing methods the specification actually uses. */
  readonly methods: readonly [string, ...string[]];
  /** Default evidence-selection policy. Defaults to `per-change`. */
  readonly selection?: ExecutionSelection;
  /**
   * Sources this obligation was derived from: predecessor requirement
   * identities, prior specification identities, tests that witnessed the
   * behavior, or surfaces that supplied its conditions. Empty when the
   * specification is an original source.
   */
  readonly derivedFrom: readonly string[];
  /**
   * Identities this specification replaces as authority. A superseded
   * identity is retired in the same change that accepts its successor and
   * must not remain present in the corpus.
   */
  readonly supersedes: readonly string[];
  /**
   * Conditions the obligation presumes and its evidence does not establish.
   * An empty list records that none were found after review; `"unknown"`
   * records that assumptions have not been assessed.
   */
  readonly assumptions: readonly string[] | "unknown";
  /**
   * Unresolved questions about the obligation's meaning, scope, or subject.
   * An empty list records that none remain; `"unknown"` records that the
   * specification has not been reviewed for open questions.
   */
  readonly openQuestions: readonly string[] | "unknown";
  /** Declared blind spots of this specification's evidence. */
  readonly limitations?: readonly [SpecificationLimitation, ...SpecificationLimitation[]];
}

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

export type ProductGoalRegistry = Readonly<Record<string, ProductGoalDefinition>>;

/**
 * Declares a product-goal registry. Identity function with the same
 * literal-only discipline as `defineSpecification`.
 */
export const defineProductGoals = <const R extends ProductGoalRegistry>(registry: R): R => registry;

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
   * evidence — required so boundary scenarios never silently duplicate
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
