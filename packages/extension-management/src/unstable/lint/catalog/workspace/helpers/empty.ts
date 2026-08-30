/**
 * Typed empty constants used by workspace rules to satisfy return types
 * without resorting to `[]` + type assertion. Using a shared `const` avoids
 * repeated `as ReadonlyArray<T>` assertions (banned by the repo style guide)
 * while keeping the inferred type stable.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AdvisoryFinding, LintFinding } from "@agentxm/registry-protocol/unstable/lint/rule";
import type { Operation } from "../../../../plan/plan.js";

/** Shared empty AdvisoryFinding array. */
export const EMPTY_ADVISORY_FINDINGS: ReadonlyArray<AdvisoryFinding> = [];

/** Shared empty LintFinding array. */
export const EMPTY_LINT_FINDINGS: ReadonlyArray<LintFinding> = [];

/** Shared empty Operation array. */
export const EMPTY_OPERATIONS: ReadonlyArray<Operation<string, unknown>> = [];
