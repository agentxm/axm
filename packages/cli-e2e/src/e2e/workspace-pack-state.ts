import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";

const packageContentHash = (packageDir: string): string => {
  const files: Array<{ readonly absolutePath: string; readonly relativePath: string }> = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: path.relative(packageDir, absolutePath),
        });
      }
    }
  };

  visit(packageDir);
  files.sort((left, right) =>
    left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0,
  );

  const packageHash = crypto.createHash("sha256");
  for (const file of files) {
    packageHash.update(file.relativePath);
    packageHash.update("\0");
    packageHash.update(fs.readFileSync(file.absolutePath));
    packageHash.update("\0");
  }

  return crypto.createHash("sha256").update(packageHash.digest("hex")).digest("hex");
};

/**
 * Keep an authored pack fixture's derived receipt and trust state aligned
 * after a test edits pack.json directly instead of using an AXM mutation.
 */
export const refreshAuthoredWorkspacePackState = (
  workspaceRoot: string,
  owner: string,
  name: string,
): void => {
  const axmDir = path.join(workspaceRoot, ".axm");
  const packageDir = path.join(axmDir, "extensions", owner, "packs", name);
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "pack.json"), "utf8"));
  const sourceHash = packageContentHash(packageDir);
  const now = new Date().toISOString();

  const lockPath = path.join(axmDir, "axm-lock.yaml");
  const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf8"));
  const previous = lockfile.packs?.[name];
  lockfile.packs = {
    ...(lockfile.packs ?? {}),
    [name]: {
      type: "workspace",
      owner,
      extensionType: "pack",
      name,
      version: manifest.version,
      sourceHash,
      installedAt: previous?.installedAt ?? now,
      updatedAt: now,
      resolvedSkills: previous?.resolvedSkills ?? {},
      resolvedMcpServers: previous?.resolvedMcpServers ?? {},
      resolvedSubagents: previous?.resolvedSubagents ?? {},
      resolvedRules: previous?.resolvedRules ?? {},
      resolvedHooks: previous?.resolvedHooks ?? {},
      resolvedKnowledge: previous?.resolvedKnowledge ?? {},
    },
  };
  fs.writeFileSync(lockPath, YAML.stringify(lockfile));

  const trustPath = path.join(axmDir, "trust.json");
  const trust = fs.existsSync(trustPath)
    ? JSON.parse(fs.readFileSync(trustPath, "utf8"))
    : { trustStateVersion: 1, records: {} };
  trust.records = {
    ...(trust.records ?? {}),
    [`pack:${name}`]: {
      extensionType: "pack",
      name,
      authority: "workspace",
      sourceIdentity: `workspace:${owner}/packs/${name}`,
      resolvedVersion: manifest.version,
      contentIdentity: sourceHash,
    },
  };
  fs.writeFileSync(trustPath, `${JSON.stringify(trust, null, 2)}\n`);
};
