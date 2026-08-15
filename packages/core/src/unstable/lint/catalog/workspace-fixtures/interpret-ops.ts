/** Mutable workspace-state fixture shared by read-only lint rule tests. */
export interface WorkspaceState {
  settings: unknown;
  lockfile: unknown;
  readonly existingPaths: Set<string>;
  readonly writablePaths: Set<string>;
  readonly listings: Map<string, Array<string>>;
  readonly detectedProjectAgents: Set<string>;
}

export const emptyWorkspaceState = (): WorkspaceState => ({
  settings: undefined,
  lockfile: undefined,
  existingPaths: new Set(),
  writablePaths: new Set(),
  listings: new Map(),
  detectedProjectAgents: new Set(),
});
