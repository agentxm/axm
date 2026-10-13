/**
 * Currency inputs of one agent-native Subagent file projection.
 *
 * The generation digests what AXM renders from, never what it rendered, so a
 * dormant change to a native adapter or a formatter rewrite of the file does
 * not read as a changed input.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { SubagentRenderInput } from "../../agent-adapters/index.js";
import { stableJson, type ProjectionDigest } from "../../workspace-state/index.js";
import { projectionGeneration } from "../generation.js";
import type { SubagentProvenance } from "./managed-file.js";

/** One configured agent's render input for a planned Subagent file. */
export interface SubagentGenerationArgs {
  readonly provenance: SubagentProvenance;
  readonly input: SubagentRenderInput;
}

/**
 * Input-only generation of the Subagent file at one planned path. Several
 * configured agents can read one physical file, so the generation covers
 * every claimant's whole canonicalized input in a stable order: whichever
 * agent writes the file records the same generation.
 */
export const subagentProjectionGeneration = (
  claimants: ReadonlyArray<SubagentGenerationArgs>,
): ProjectionDigest =>
  projectionGeneration([...new Set(claimants.map((claimant) => stableJson(claimant)))].sort());
