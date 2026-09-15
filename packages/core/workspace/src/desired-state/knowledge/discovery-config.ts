/** Resolved Knowledge instruction-table policy. */

export interface ResolvedKnowledgeDiscoveryConfig {
  readonly instructions: boolean;
}

/**
 * Knowledge discovery is synchronized into the canonical instruction source by
 * default. `false` is the only persisted override.
 */
export const resolveKnowledgeDiscoveryConfig = (args: {
  readonly instructions?: false;
}): ResolvedKnowledgeDiscoveryConfig => ({
  instructions: args.instructions !== false,
});
