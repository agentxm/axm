/**
 * Specification files are the requirements authority, so every authored
 * `*.spec.ts` routes to maintainer review wherever it lives.
 *
 * Supersedes the retired specification identity
 * `system/process/changes-land-through-reviewed-pull-requests`
 * (see `specifications/disposition-ledger.json`). Pull-request review and
 * required checks are enforced by host-side branch protection, which no
 * repository-side check can observe; what the repository declares is this
 * ownership routing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { discoverSpecifications, readWorkspace } from "./workspace-discovery.js";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const MAINTAINER = "@craigsmitham";

const codeownerRules = (): ReadonlyArray<{
  readonly pattern: string;
  readonly owners: ReadonlyArray<string>;
}> =>
  fs
    .readFileSync(path.join(repoRoot, ".github", "CODEOWNERS"), "utf8")
    .split("\n")
    .map((line) => line.split("#")[0]?.trim() ?? "")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/u);
      return { pattern: pattern ?? "", owners };
    });

describe("specification code ownership", () => {
  it("routes every authored specification file to the maintainer", async () => {
    const rules = codeownerRules();
    const anySpec = rules.find((rule) => rule.pattern === "**/*.spec.ts");
    expect(anySpec, "CODEOWNERS must route **/*.spec.ts").toBeDefined();
    expect(anySpec?.owners).toContain(MAINTAINER);

    // The routing has to reach the files that actually exist, wherever
    // colocation put them.
    const workspace = await readWorkspace();
    const { specifications } = discoverSpecifications(workspace);
    expect(specifications.length).toBeGreaterThan(0);
    for (const discovered of specifications) {
      const source = discovered.specification.source;
      expect(source.endsWith(".spec.ts"), source).toBe(true);
    }
  });
});
