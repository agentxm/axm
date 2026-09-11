/**
 * The dual TypeScript alias: `tsc` is native TypeScript 7 and
 * `require("typescript")` resolves to the TypeScript 6 compatibility package,
 * until the exit condition recorded in
 * `docs/architecture/decisions/typescript-dual-alias.md` is reached.
 *
 * Supersedes the retired specification identity
 * `system/process/dual-typescript-alias-retained`
 * (see `specifications/disposition-ledger.json`); the decision record owns
 * the policy and its exit condition, and this case pins the catalog.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import YAML from "yaml";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

describe("workspace TypeScript aliases", () => {
  it("aliases native TypeScript 7 and the TypeScript 6 compatibility package", () => {
    const workspace: unknown = YAML.parse(
      fs.readFileSync(path.join(repoRoot, "pnpm-workspace.yaml"), "utf8"),
    );
    if (typeof workspace !== "object" || workspace === null || !("catalog" in workspace)) {
      throw new Error("pnpm-workspace.yaml must declare a catalog");
    }
    const catalog = workspace.catalog;
    if (typeof catalog !== "object" || catalog === null) {
      throw new Error("catalog must be an object");
    }
    const entries: Partial<Record<string, unknown>> = { ...catalog };

    // `tsc` is the native TypeScript 7 compiler.
    expect(entries["@typescript/native"]).toMatch(/^npm:typescript@\^7\./);
    // `require("typescript")` resolves to the TypeScript 6 compatibility
    // package until the recorded TypeScript 7.1 exit condition is met.
    expect(entries["typescript"]).toMatch(/^npm:@typescript\/typescript6@/);
  });
});
