/**
 * State types for workspace initialization.
 *
 * This module implements state types for the `axm init` command:
 * - **ActualInitState**: What exists on disk (settings presence, validity)
 * - **IdealInitState**: Desired state (agents, scope)
 * - **InitChange**: Diff between actual and ideal
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../agents/types.js";
import type { Settings } from "../settings/schema.js";

// =============================================================================
// Init Validity (discriminated union for settings state)
// =============================================================================

/**
 * Validity states for workspace initialization.
 *
 * - Valid: Settings file exists and passes schema validation
 * - NotInitialized: No .axm/settings.json file exists
 * - Invalid: Settings file exists but fails schema validation
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InitValidity =
  | { readonly _tag: "Valid"; readonly settings: Settings }
  | { readonly _tag: "NotInitialized" }
  | { readonly _tag: "Invalid"; readonly error: string };

/**
 * Constructors for InitValidity variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const InitValidity = {
  Valid: (settings: Settings): InitValidity => ({ _tag: "Valid", settings }),
  NotInitialized: (): InitValidity => ({ _tag: "NotInitialized" }),
  Invalid: (error: string): InitValidity => ({ _tag: "Invalid", error }),
} as const;

// =============================================================================
// Actual State (what's on disk)
// =============================================================================

/**
 * Actual initialization state - what exists on disk.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ActualInitState {
  readonly validity: InitValidity;
}

// =============================================================================
// Ideal State (desired after operation)
// =============================================================================

/**
 * Ideal initialization state - desired configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface IdealInitState {
  readonly agents: readonly AgentConfig[];
  readonly scope: string;
}

// =============================================================================
// Init Change (diff between actual and ideal)
// =============================================================================

/**
 * Change types for workspace initialization.
 *
 * - Add: New workspace initialization (no settings.json exists)
 * - Update: Re-initialization with --force (overwrite existing)
 * - Unchanged: Already initialized with same configuration
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InitChange =
  | { readonly _tag: "Add"; readonly ideal: IdealInitState }
  | { readonly _tag: "Update"; readonly from: Settings; readonly to: IdealInitState }
  | { readonly _tag: "Unchanged"; readonly settings: Settings };

/**
 * Constructors for InitChange variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const InitChange = {
  Add: (ideal: IdealInitState): InitChange => ({ _tag: "Add", ideal }),
  Update: (from: Settings, to: IdealInitState): InitChange => ({ _tag: "Update", from, to }),
  Unchanged: (settings: Settings): InitChange => ({ _tag: "Unchanged", settings }),
} as const;

// =============================================================================
// Init Diff (plan for workspace initialization)
// =============================================================================

/**
 * Diff/Plan for workspace initialization.
 *
 * Contains a single change representing the transformation from
 * actual to ideal state.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InitDiff {
  readonly change: InitChange;
}

/**
 * Check if the init diff has changes to apply.
 *
 * Returns true for Add and Update changes, false for Unchanged.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const hasInitChanges = (diff: InitDiff): boolean => diff.change._tag !== "Unchanged";
