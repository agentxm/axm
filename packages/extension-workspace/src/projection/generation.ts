import { computeSourceHash } from "@agentxm/workspace-state";

/**
 * Compute a stable provenance token from explicitly selected authoritative
 * inputs. The rendered projection is deliberately not an input.
 */
export const projectionGeneration = (parts: ReadonlyArray<string>): string =>
  computeSourceHash(JSON.stringify(parts));
