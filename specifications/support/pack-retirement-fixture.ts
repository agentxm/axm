/**
 * Desired-pack fixtures whose packages are intact, absent, or unreadable.
 *
 * Builds a workspace that desires one or more packs, each with the settings
 * entry, accepted lock row, and canonical directory a completed install leaves
 * behind, then damages the selected package as the scenario requires.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { computePackManifestContentIdentity } from "axm.sh/specification-harness";

import { makeSpecWorkspace } from "./install-harness.js";

/** How a fixture pack's own package manifest presents on disk. */
export type PackManifestCondition = "intact" | "deleted" | "undecodable" | "mismatched";

export interface PackFixture {
  readonly name: string;
  readonly authority: "workspace" | "registry";
  readonly manifest: PackManifestCondition;
}

export interface PackRetirementWorkspace {
  readonly workspace: ReturnType<typeof makeSpecWorkspace>;
  /** Fully qualified name of each fixture pack, keyed by its workspace name. */
  readonly fqn: (name: string) => string;
  /** Workspace-relative canonical directory of a fixture pack. */
  readonly packDirectory: (name: string) => string;
  /** Workspace-relative package manifest path of a fixture pack. */
  readonly manifestPath: (name: string) => string;
}

const OWNER = "@acme";

const canonicalDirectory = (fixture: PackFixture): string =>
  fixture.authority === "workspace"
    ? path.join("packs", fixture.name)
    : path.join("agent_extensions", "agentxm", OWNER, "packs", fixture.name);

const manifestFor = (fixture: PackFixture) => ({
  owner: OWNER,
  type: "pack" as const,
  name: fixture.name,
  version: fixture.authority === "workspace" ? "0.0.1" : "1.0.0",
  dependencies: {},
});

const lockEntryFor = (fixture: PackFixture) =>
  fixture.authority === "workspace"
    ? {
        type: "workspace",
        owner: OWNER,
        extensionType: "pack",
        name: fixture.name,
        version: "0.0.1",
        installedAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        resolvedSkills: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
        resolvedRules: {},
        resolvedHooks: {},
        resolvedKnowledge: {},
      }
    : {
        type: "registry",
        owner: OWNER,
        name: fixture.name,
        resolvedVersion: "1.0.0",
        integrity: "sha512-AAAA==",
        sourceName: "agentxm",
        publisherBindingId: "hbnd_test",
        installedAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        resolvedSkills: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
        // The accepted resolution records the manifest as it was when the
        // install completed, whatever the scenario later does to the file.
        manifestContentIdentity: computePackManifestContentIdentity(manifestFor(fixture)),
      };

export const makePackRetirementWorkspace = (
  fixtures: ReadonlyArray<PackFixture>,
): PackRetirementWorkspace => {
  const workspace = makeSpecWorkspace({
    machine: true,
    flags: { json: true },
    settings: {
      packs: Object.fromEntries(
        fixtures.map((fixture) => [
          fixture.name,
          fixture.authority === "workspace" ? "workspace" : `${OWNER}/packs/${fixture.name}`,
        ]),
      ),
      lockfilePacks: Object.fromEntries(
        fixtures.map((fixture) => [fixture.name, lockEntryFor(fixture)]),
      ),
    },
  });

  const byName = new Map(fixtures.map((fixture) => [fixture.name, fixture]));
  const lookup = (name: string): PackFixture => {
    const fixture = byName.get(name);
    if (fixture === undefined) throw new Error(`Unknown fixture pack: ${name}`);
    return fixture;
  };

  for (const fixture of fixtures) {
    const directory = path.join(workspace.root, canonicalDirectory(fixture));
    fs.mkdirSync(directory, { recursive: true });
    // Every pack starts with the content a completed install leaves, so a
    // damaged manifest is the only difference a scenario introduces.
    fs.writeFileSync(path.join(directory, "README.md"), `# ${fixture.name}\n`);
    const manifestFile = path.join(directory, "pack.json");
    switch (fixture.manifest) {
      case "intact":
        fs.writeFileSync(manifestFile, JSON.stringify(manifestFor(fixture)));
        break;
      case "deleted":
        break;
      case "undecodable":
        fs.writeFileSync(manifestFile, "{ this is not a pack manifest");
        break;
      case "mismatched":
        fs.writeFileSync(
          manifestFile,
          JSON.stringify({ ...manifestFor(fixture), owner: "@other" }),
        );
        break;
    }
  }

  return {
    workspace,
    fqn: (name) => `${OWNER}/packs/${lookup(name).name}`,
    packDirectory: (name) => canonicalDirectory(lookup(name)),
    manifestPath: (name) => path.join(canonicalDirectory(lookup(name)), "pack.json"),
  };
};
