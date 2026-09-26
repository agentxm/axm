/** Canonical AXM application-home and workspace names. */

export const USER_WORKSPACE_DIRECTORY = "workspace";
export const LOCK_FILENAME = "axm-lock.yaml";
export const ACQUIRED_EXTENSIONS_DIR = "agent_extensions";

/** AXM's own interrupted replacement directories beside a canonical package. */
export const isInstallRootStagingName = (name: string): boolean =>
  name.endsWith(".axm-staging") || name.endsWith(".axm-backup");
