import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PlanPolicyIds } from "@agentxm/workspace-operations";
import { NAMED_OVERRIDE_POLICIES } from "../../cli-flags/index.js";
import { rootCommand } from "../../app.js";
import { registeredCommandCapabilities } from "./command-capabilities.js";

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

describe("command capability declarations", () => {
  it("keeps every named mutation policy reachable as one override flag", () => {
    const policyFlags = Object.keys(NAMED_OVERRIDE_POLICIES);
    for (const policy of PlanPolicyIds) {
      expect(policyFlags).toContain(`--${policy}`);
    }
  });

  it("declares a preapproval purpose only on routes that expose the flag", () => {
    const declared = registeredCommandCapabilities(rootCommand).flatMap((entry) =>
      entry.capabilities !== undefined && entry.capabilities.preapproval !== null
        ? [{ path: entry.path, purpose: entry.capabilities.preapproval.purpose }]
        : [],
    );
    for (const entry of declared) {
      expect(entry.purpose.trim().length, entry.path.join(" ")).toBeGreaterThan(0);
    }
  });

  it("prevents production command handlers from bypassing the shared policy boundary", () => {
    const directApplyCallers = productionTypeScriptFiles(sourceRoot).filter((file) =>
      /\bapplyPlan\s*\(/.test(fs.readFileSync(file, "utf8")),
    );
    expect(directApplyCallers).toEqual([]);
  });
});
