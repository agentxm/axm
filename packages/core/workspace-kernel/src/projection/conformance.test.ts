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

const projectionSrc = nodePath.dirname(fileURLToPath(import.meta.url));
const kernelSrc = nodePath.resolve(projectionSrc, "..");
const agentAdaptersSrc = nodePath.join(kernelSrc, "agent-adapters");

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
    // Reading and rendering a managed region is a single decision. Native
    // format adapters own the primitives; the two projection adapters own
    // workspace-region and native-region reconciliation respectively.
    const regionOffenders = productionTypeScriptFiles(projectionSrc)
      .filter(
        (file) =>
          !["managed-region-adapter.ts", "native-managed-region.ts"].includes(
            nodePath.basename(file),
          ),
      )
      .filter((file) => {
        const source = nodeFs.readFileSync(file, "utf8");
        return source.includes("inspectManagedRegion") || source.includes("renderManagedRegion");
      })
      .map((file) => nodePath.relative(kernelSrc, file));
    expect(regionOffenders).toEqual([]);

    const markerReaderOffenders = [projectionSrc, agentAdaptersSrc]
      .flatMap(productionTypeScriptFiles)
      .filter((file) => !file.includes(`${nodePath.sep}__generated__${nodePath.sep}`))
      .filter((file) => {
        const source = nodeFs.readFileSync(file, "utf8");
        return source.includes('.includes("axm:') || source.includes(".includes('axm:");
      })
      .map((file) => nodePath.relative(kernelSrc, file));
    expect(markerReaderOffenders).toEqual([]);

    const planningSource = nodeFs.readFileSync(nodePath.join(projectionSrc, "planning.ts"), "utf8");
    expect(planningSource).toContain("ProjectionRenderInputTypeId");
    expect(planningSource).toContain("planAggregateProjection");
    expect(planningSource).toContain("planSingletonProjection");

    // The ownership marker grammar is native format mechanics and remains the
    // single marker reader in the kernel's agent adapter boundary.
    expect(
      nodeFs.readFileSync(nodePath.join(agentAdaptersSrc, "managed-markers.ts"), "utf8"),
    ).toContain("export const parseMarker");
  });

  it("keeps projection reconciliation out of the workspace service contract", () => {
    const serviceContract = nodeFs.readFileSync(
      nodePath.join(kernelSrc, "workspace-state", "workspace", "contracts.ts"),
      "utf8",
    );
    expect(serviceContract).not.toContain("reconcileProjections");
  });

  it("evaluates invariant facts from the participant registry alone", () => {
    // Projection must not reach back into the capability that materializes a
    // unit; owners register through `ProjectionParticipants`.
    const factsSource = nodeFs.readFileSync(
      nodePath.join(projectionSrc, "invariant-facts.ts"),
      "utf8",
    );
    expect(factsSource).toContain("ProjectionParticipants");
    expect(factsSource).not.toContain("Manager");
    expect(factsSource).not.toContain("describeFailure");
  });
});
