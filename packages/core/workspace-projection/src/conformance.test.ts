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

const packageSrc = nodePath.dirname(fileURLToPath(import.meta.url));
const packagesRoot = nodePath.resolve(packageSrc, "..", "..", "..");

const productionTypeScriptFiles = (root: string): ReadonlyArray<string> =>
  nodeFs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = nodePath.join(root, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test.")
      ? [absolute]
      : [];
  });

describe("aggregate ownership unit conformance", () => {
  it("keeps managed-region reconciliation sealed and exposes the marker grammar", () => {
    // Reading and rendering a managed region is a single decision. Only the
    // adapter may reach the region primitives; every other module reconciles
    // through `reconcileManagedRegionFile`.
    const regionOffenders = productionTypeScriptFiles(packageSrc)
      .filter((file) => nodePath.basename(file) !== "managed-region-adapter.ts")
      .filter((file) => {
        const source = nodeFs.readFileSync(file, "utf8");
        return source.includes("inspectManagedRegion") || source.includes("renderManagedRegion");
      })
      .map((file) => nodePath.relative(packageSrc, file));
    expect(regionOffenders).toEqual([]);

    const markerReaderOffenders = productionTypeScriptFiles(packageSrc)
      .filter((file) => !file.includes(`${nodePath.sep}__generated__${nodePath.sep}`))
      .filter((file) => {
        const source = nodeFs.readFileSync(file, "utf8");
        return source.includes('.includes("axm:') || source.includes(".includes('axm:");
      })
      .map((file) => nodePath.relative(packageSrc, file));
    expect(markerReaderOffenders).toEqual([]);

    const planningSource = nodeFs.readFileSync(nodePath.join(packageSrc, "planning.ts"), "utf8");
    expect(planningSource).toContain("ProjectionRenderInputTypeId");
    expect(planningSource).toContain("planAggregateProjection");
    expect(planningSource).toContain("planSingletonProjection");

    // The ownership marker grammar is native format mechanics and lives in the
    // agent-integration package; it remains the single marker reader.
    expect(
      nodeFs.readFileSync(
        nodePath.join(packagesRoot, "supporting", "agent-integration", "src", "managed-markers.ts"),
        "utf8",
      ),
    ).toContain("export const parseMarker");
  });

  it("routes every ownership-unit cardinality through shared plans", () => {
    // The extension-type managers and the MCP install operation live in the
    // extension-materialization capability, and the remaining MCP operations
    // in the extension-lifecycle feature; this structural gate reads their
    // sources across the package boundary on purpose.
    const materializationSrc = nodePath.join(
      packagesRoot,
      "core",
      "extension-materialization",
      "src",
    );
    const lifecycleSrc = nodePath.join(packagesRoot, "core", "extension-lifecycle", "src");
    const aggregateParticipants = ["rules/manager.ts", "hooks/manager.ts", "knowledge/manager.ts"];
    for (const relativePath of aggregateParticipants) {
      expect(
        nodeFs.readFileSync(nodePath.join(materializationSrc, relativePath), "utf8"),
      ).toContain("planAggregateProjection");
    }

    const singletonParticipants = [
      [materializationSrc, "skills/manager.ts"],
      [materializationSrc, "subagents/manager.ts"],
      [materializationSrc, "mcps/manager.ts"],
    ] as const;
    for (const [root, relativePath] of singletonParticipants) {
      expect(nodeFs.readFileSync(nodePath.join(root, relativePath), "utf8")).toContain(
        "planSingletonProjection",
      );
    }
    const sharedMcpParticipants = [
      [
        nodePath.join(packagesRoot, "core", "workspace-reconciliation", "src"),
        "mcps/install-operation.ts",
      ],
      [lifecycleSrc, "mcps/operations/enable.ts"],
    ] as const;
    for (const [root, relativePath] of sharedMcpParticipants) {
      expect(nodeFs.readFileSync(nodePath.join(root, relativePath), "utf8")).toContain(
        "syncManifestMcpServerToAgents",
      );
    }

    const serviceContract = nodeFs.readFileSync(
      nodePath.join(
        packagesRoot,
        "core",
        "workspace-state",
        "src",
        "workspace",
        "service-interface.ts",
      ),
      "utf8",
    );
    expect(serviceContract).not.toContain("reconcileProjections");
  });

  it("evaluates invariant facts from the participant registry alone", () => {
    // Projection must not reach back into the capability that materializes a
    // unit; owners register through `ProjectionParticipants`.
    const factsSource = nodeFs.readFileSync(
      nodePath.join(packageSrc, "invariant-facts.ts"),
      "utf8",
    );
    expect(factsSource).toContain("ProjectionParticipants");
    expect(factsSource).not.toContain("Manager");
    expect(factsSource).not.toContain("describeFailure");
  });
});
