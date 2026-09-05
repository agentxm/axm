import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Verify an authored pack fixture after a test edits its authoritative
 * manifest directly. Authored manifests are desired-state authority, so no
 * receipt or trust state needs to be refreshed.
 */
export const refreshAuthoredWorkspacePackState = (
  workspaceRoot: string,
  owner: string,
  name: string,
): void => {
  void owner;
  const manifestPath = path.join(workspaceRoot, "packs", name, "pack.json");
  JSON.parse(fs.readFileSync(manifestPath, "utf8"));
};
