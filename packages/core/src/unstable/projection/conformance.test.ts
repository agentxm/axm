/**
 * Completeness gate for aggregate ownership units.
 *
 * Every unit declared with many contributors in the ownership-unit registry
 * must register multi-route contributor coverage: behavior tests that render
 * the unit from contributors reached through more than one route (members of
 * two different Packs at minimum) and prove one contributor's lifecycle leaves
 * the others rendered exactly once. Declaring a new aggregate unit without
 * registering that coverage fails this gate.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aggregateOwnershipUnits } from "./units.js";

const packageSrc = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Registered multi-route coverage per aggregate unit, as paths relative to
 * `src/unstable`. Each referenced suite must exercise contributors from two
 * different Packs (the `pack-a`/`pack-b` fixtures).
 */
const registeredCoverage: Readonly<Record<string, ReadonlyArray<string> | undefined>> = {
  "rule:instructions-region": ["rules/manager.graph-projection.test.ts"],
  "hook:agent-hook-entries": ["hooks/manager.graph-projection.test.ts"],
  "hook:fallback-region": ["hooks/manager.graph-projection.test.ts"],
  "knowledge:discovery-region": ["knowledge/manager.graph-projection.test.ts"],
};

describe("aggregate ownership unit conformance", () => {
  it("registers multi-route contributor coverage for every aggregate unit", () => {
    for (const unit of aggregateOwnershipUnits) {
      const coverage = registeredCoverage[unit.unitId];
      expect(
        coverage,
        `Aggregate unit "${unit.unitId}" has no registered multi-route contributor coverage`,
      ).toBeDefined();
      for (const relativePath of coverage ?? []) {
        const absolute = nodePath.join(packageSrc, relativePath);
        expect(
          nodeFs.existsSync(absolute),
          `Registered coverage for "${unit.unitId}" does not exist: ${relativePath}`,
        ).toBe(true);
        const content = nodeFs.readFileSync(absolute, "utf8");
        expect(
          content.includes("pack-a") && content.includes("pack-b"),
          `Registered coverage for "${unit.unitId}" must span members of two different Packs: ${relativePath}`,
        ).toBe(true);
      }
    }
  });

  it("rejects coverage registrations for unknown units", () => {
    const declared = new Set(aggregateOwnershipUnits.map((unit) => unit.unitId));
    for (const unitId of Object.keys(registeredCoverage)) {
      expect(declared.has(unitId), `Unknown aggregate unit in coverage registry: ${unitId}`).toBe(
        true,
      );
    }
  });
});
