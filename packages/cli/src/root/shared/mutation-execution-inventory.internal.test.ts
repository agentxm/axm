import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  mutationExecutionInventory,
  mutationPolicyFlagInventory,
  mutationPolicyIds,
} from "./mutation-execution-inventory.js";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const productionTypeScriptFiles = (directory: string): ReadonlyArray<string> =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__generated__" ? [] : productionTypeScriptFiles(target);
    }
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [target]
      : [];
  });

describe("mutation execution conformance inventory", () => {
  it("keeps every public named mutation policy mapped to one distinct flag", () => {
    expect(Object.keys(mutationPolicyFlagInventory).sort()).toEqual([...mutationPolicyIds].sort());
    expect(new Set(Object.values(mutationPolicyFlagInventory)).size).toBe(mutationPolicyIds.length);
  });

  it("requires a rationale for every audited exception", () => {
    const exceptions = mutationExecutionInventory.filter(
      (entry) => entry.classification === "audited-non-plan-exception",
    );
    expect(exceptions.length).toBeGreaterThan(0);
    for (const entry of exceptions) {
      expect(entry.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  it("prevents production command handlers from bypassing the shared policy boundary", () => {
    const directApplyCallers = productionTypeScriptFiles(sourceRoot).filter((file) =>
      /\bapplyPlan\s*\(/.test(fs.readFileSync(file, "utf8")),
    );
    expect(directApplyCallers).toEqual([]);
  });
});
