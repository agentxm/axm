/**
 * Structural conformance gate for projection planning.
 *
 * Recovery coverage for aggregate ownership units is registered by the
 * exhaustive recovery-conformance suite. This file retains code-boundary
 * checks that keep construction and application inside shared planning.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageSrc = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "..");

const productionTypeScriptFiles = (root: string): ReadonlyArray<string> =>
  nodeFs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = nodePath.join(root, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test.")
      ? [absolute]
      : [];
  });

describe("aggregate ownership unit conformance", () => {
  it("keeps marker primitives and render-input construction inside projection planning", () => {
    const offenders = productionTypeScriptFiles(packageSrc)
      .filter((file) => !file.includes(`${nodePath.sep}projection${nodePath.sep}`))
      .filter((file) => {
        const source = nodeFs.readFileSync(file, "utf8");
        return source.includes("projection/markers") || source.includes("managed-files");
      })
      .map((file) => nodePath.relative(packageSrc, file));
    expect(offenders).toEqual([]);

    const planningSource = nodeFs.readFileSync(
      nodePath.join(packageSrc, "projection", "planning.ts"),
      "utf8",
    );
    expect(planningSource).toContain("ProjectionRenderInputTypeId");
    expect(planningSource).toContain("planAggregateProjection");
    expect(planningSource).toContain("planSingletonProjection");
  });

  it("routes every ownership-unit cardinality through shared plans", () => {
    const aggregateParticipants = ["rules/manager.ts", "hooks/manager.ts", "knowledge/manager.ts"];
    for (const relativePath of aggregateParticipants) {
      expect(nodeFs.readFileSync(nodePath.join(packageSrc, relativePath), "utf8")).toContain(
        "planAggregateProjection",
      );
    }

    const singletonParticipants = [
      "skills/manager.ts",
      "subagents/manager.ts",
      "mcps/manager.ts",
      "mcps/operations/install.ts",
      "mcps/operations/enable.ts",
    ];
    for (const relativePath of singletonParticipants) {
      expect(nodeFs.readFileSync(nodePath.join(packageSrc, relativePath), "utf8")).toContain(
        "planSingletonProjection",
      );
    }

    const serviceContract = nodeFs.readFileSync(
      nodePath.join(packageSrc, "workspace", "service-interface.ts"),
      "utf8",
    );
    expect(serviceContract).not.toContain("reconcileProjections");
  });
});
