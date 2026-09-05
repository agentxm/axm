/**
 * Corpus conformance for executable specifications.
 *
 * A pure check over already-decoded metadata: it establishes that a
 * specification corpus has the contract's form and linkage — vocabulary,
 * identity, goal references, boundary rationale, lineage, and product
 * language. A clean result never establishes that the accepted obligations
 * are the right ones; that judgment stays with set review and the acceptance
 * decision.
 *
 * Both repositories run this check over their own corpus. Shared goal
 * identities come from the installed contract, so a specification that names
 * a shared goal the installed release cohort does not register is a dangling
 * cross-repository reference and fails here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  IDENTITY_SEGMENT_PATTERN,
  type ExecutionBinding,
  type ProductGoalRegistry,
  type SpecificationMetadata,
  UNVERIFIABLE_SPECIFICATION_METHODS,
} from "./contract.js";
import { sharedProductGoals } from "./shared-goals.js";

export interface ConformanceIssue {
  readonly severity: "error" | "warning";
  /** Repository-relative source the issue is anchored to. */
  readonly source: string;
  readonly message: string;
}

export interface CorpusSpecification {
  /** Repository-relative source path of the specification file. */
  readonly source: string;
  readonly metadata: SpecificationMetadata;
}

export interface CorpusExecutionBinding {
  /** Repository-relative source path of the boundary execution. */
  readonly source: string;
  readonly binding: ExecutionBinding;
}

export interface CorpusInput {
  readonly specifications: readonly CorpusSpecification[];
  /** The repository's local product-goal registry. */
  readonly localGoals: ProductGoalRegistry;
  /** Source path reported for local-registry issues. */
  readonly localGoalsSource: string;
  /** Shared goals from the installed contract. Defaults to `sharedProductGoals`. */
  readonly sharedGoals?: ProductGoalRegistry;
  readonly executionBindings?: readonly CorpusExecutionBinding[];
}

/** Words that identify implementation vocabulary leaking into product language. */
const IMPLEMENTATION_WORDS = new Set([
  "layer",
  "handler",
  "mock",
  "stub",
  "middleware",
  "refactor",
]);

const CAMEL_CASE_TOKEN = /\b[a-z]+[A-Z][A-Za-z]*\b/;

/**
 * Whether at least one declared method produces runner evidence. A method
 * set made only of unverifiable methods is reported as unverified by the
 * harness, never as passing.
 */
export const isExecutableMethodSet = (methods: readonly string[]): boolean =>
  methods.some((method) => !UNVERIFIABLE_SPECIFICATION_METHODS.some((entry) => entry === method));

/**
 * Lints a title or statement for implementation vocabulary. Specification
 * text describes conditions and observable results; it never names
 * handlers, services, Layers, private functions, or mock interactions.
 */
export const lintProductLanguage = (text: string): string | undefined => {
  if (CAMEL_CASE_TOKEN.test(text)) {
    return `contains an implementation-style camelCase token: "${text}"`;
  }
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (IMPLEMENTATION_WORDS.has(word)) {
      return `contains implementation vocabulary ("${word}"): "${text}"`;
    }
  }
  return undefined;
};

const error = (source: string, message: string): ConformanceIssue => ({
  severity: "error",
  source,
  message,
});

const warning = (source: string, message: string): ConformanceIssue => ({
  severity: "warning",
  source,
  message,
});

/**
 * Checks one corpus for contract form and linkage. Issues are ordered by
 * discovery; callers decide whether warnings block.
 */
export const checkSpecificationCorpus = (input: CorpusInput): readonly ConformanceIssue[] => {
  const issues: ConformanceIssue[] = [];
  const sharedGoals = input.sharedGoals ?? sharedProductGoals;

  for (const id of Object.keys(input.localGoals)) {
    if (!IDENTITY_SEGMENT_PATTERN.test(id)) {
      issues.push(
        error(
          input.localGoalsSource,
          `product-goal id \`${id}\` must be a lowercase kebab identifier`,
        ),
      );
    }
    if (Object.hasOwn(sharedGoals, id)) {
      issues.push(
        error(
          input.localGoalsSource,
          `product goal \`${id}\` is a shared goal; reference the shared identity instead of redefining it locally`,
        ),
      );
    }
  }

  const registeredGoals = new Map<string, { readonly status: "active" | "retired" }>();
  for (const registry of [sharedGoals, input.localGoals]) {
    for (const [id, definition] of Object.entries(registry)) {
      registeredGoals.set(id, { status: definition.status ?? "active" });
    }
  }

  const byRequirement = new Map<string, CorpusSpecification>();
  for (const specification of input.specifications) {
    const existing = byRequirement.get(specification.metadata.requirement);
    if (existing !== undefined) {
      issues.push(
        error(
          specification.source,
          `duplicate requirement identity \`${specification.metadata.requirement}\` (also declared in ${existing.source})`,
        ),
      );
      continue;
    }
    byRequirement.set(specification.metadata.requirement, specification);
  }

  const referencedGoals = new Set<string>();
  for (const { source, metadata } of input.specifications) {
    for (const goal of metadata.goals) {
      referencedGoals.add(goal);
      const registered = registeredGoals.get(goal);
      if (registered === undefined) {
        issues.push(error(source, `references unregistered product goal \`${goal}\``));
      } else if (registered.status === "retired") {
        issues.push(
          error(
            source,
            `references retired product goal \`${goal}\`; the specification is a retirement candidate`,
          ),
        );
      }
    }
    for (const superseded of metadata.supersedes) {
      if (byRequirement.has(superseded)) {
        issues.push(
          error(
            source,
            `supersedes \`${superseded}\`, which is still present in the corpus; retire the predecessor in the same change`,
          ),
        );
      }
    }
    const titleFinding = lintProductLanguage(metadata.title);
    if (titleFinding !== undefined) {
      issues.push(error(source, `title ${titleFinding}`));
    }
    const statementFinding = lintProductLanguage(metadata.statement);
    if (statementFinding !== undefined) {
      issues.push(error(source, `statement ${statementFinding}`));
    }
    if (!isExecutableMethodSet(metadata.methods)) {
      issues.push(
        warning(
          source,
          `declares only unverifiable methods (${metadata.methods.join(", ")}); the harness reports this specification as unverified`,
        ),
      );
    }
  }

  for (const [id, definition] of registeredGoals) {
    if (
      definition.status === "active" &&
      !referencedGoals.has(id) &&
      input.specifications.length > 0
    ) {
      issues.push(
        warning(
          input.localGoalsSource,
          `active product goal \`${id}\` has no referencing specification (missing coverage or a dead goal)`,
        ),
      );
    }
  }

  for (const { source, binding } of input.executionBindings ?? []) {
    for (const requirement of binding.requirements) {
      if (!byRequirement.has(requirement)) {
        issues.push(
          error(source, `execution binding references unknown requirement \`${requirement}\``),
        );
      }
    }
  }

  return issues;
};
