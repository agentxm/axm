/**
 * The two staleness gates a settled pack removal passes before it applies.
 *
 * A candidate is built from one reading of the desired state and applied
 * against another; both gates compare the two readings, so they are decisions
 * over data and are exercised as such. What a passing gate then removes is
 * `cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable`'s
 * business.
 */

import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  desiredPackageKey,
  UNCONSTRAINED_DESIRED_NODE,
  type DesiredExtensionNode,
  type DesiredNodeIdentity,
  type DesiredStateGraph,
} from "../../../desired-state/index.js";
import {
  validatePackRetirementFacts,
  validateResolvedPackUninstallTargets,
  type ResolvedPackUninstallTarget,
} from "./plan.js";

const packIdentity = (locator: string): DesiredNodeIdentity =>
  locator.startsWith("workspace:")
    ? { authority: "workspace", fqn: locator.slice("workspace:".length) }
    : {
        authority: "registry",
        fqn: locator,
        registry: { sourceName: undefined, endpoint: undefined },
      };

const targetFor = (locator: string): ResolvedPackUninstallTarget => {
  const identity = packIdentity(locator);
  const decoded = parseExtensionFqnParts(desiredPackageKey(identity));
  if (decoded === undefined || decoded.type !== "pack") {
    throw new Error(`Invalid pack test identity: ${locator}`);
  }
  return {
    type: "pack",
    owner: decoded.owner,
    name: decoded.name,
    authority: identity.authority,
    desiredIdentity: identity,
  };
};

const packNode = (identity: DesiredNodeIdentity, name = "toolkit"): DesiredExtensionNode => ({
  type: "pack",
  name,
  identity,
  source: identity.authority === "workspace" ? "workspace" : desiredPackageKey(identity),
  enabled: true,
  constraint: UNCONSTRAINED_DESIRED_NODE,
  origins: [
    {
      type: "settings",
      source: identity.authority === "workspace" ? "workspace" : desiredPackageKey(identity),
      enabled: true,
    },
  ],
});

const completeGraph = (nodes: ReadonlyArray<DesiredExtensionNode>): DesiredStateGraph => ({
  complete: true,
  nodes,
  mcpSourceClosures: [],
  problems: [],
});

const expectFailureCategory = (
  graph: DesiredStateGraph,
  targets: ReadonlyArray<ResolvedPackUninstallTarget>,
  category: "conflict" | "validation",
) =>
  Effect.gen(function* () {
    const error = yield* validateResolvedPackUninstallTargets(graph, targets).pipe(Effect.flip);
    expect(error.category).toBe(category);
  });

describe("pack uninstall target precondition", () => {
  const selected = targetFor("workspace:@acme/packs/toolkit");

  it.effect("accepts an unchanged target and ignores unrelated graph drift", () =>
    validateResolvedPackUninstallTargets(
      completeGraph([
        packNode(selected.desiredIdentity),
        {
          type: "skill",
          name: "unrelated",
          identity: {
            authority: "registry",
            fqn: "@other/skills/unrelated",
            registry: { sourceName: undefined, endpoint: undefined },
          },
          source: "@other/skills/unrelated",
          enabled: true,
          constraint: UNCONSTRAINED_DESIRED_NODE,
          origins: [{ type: "settings", source: "@other/skills/unrelated", enabled: true }],
        },
      ]),
      [selected],
    ),
  );

  it.effect("fails with conflict when the selected owner changes", () =>
    expectFailureCategory(
      completeGraph([packNode(packIdentity("workspace:@other/packs/toolkit"))]),
      [selected],
      "conflict",
    ),
  );

  it.effect("fails with conflict when the selected authority changes", () =>
    expectFailureCategory(
      completeGraph([packNode(packIdentity("@acme/packs/toolkit"))]),
      [selected],
      "conflict",
    ),
  );

  it.effect("fails with conflict when the selected node disappears", () =>
    expectFailureCategory(completeGraph([]), [selected], "conflict"),
  );

  it.effect("fails with validation when the selected current identity cannot decode", () =>
    expectFailureCategory(
      completeGraph([packNode(packIdentity("workspace:not-an-extension"))]),
      [selected],
      "validation",
    ),
  );

  it.effect("revalidates target identity without introducing a graph-completeness rule", () =>
    validateResolvedPackUninstallTargets(
      {
        complete: false,
        nodes: [packNode(selected.desiredIdentity)],
        mcpSourceClosures: [],
        problems: [],
      },
      [selected],
    ),
  );
});

describe("pack retirement staleness", () => {
  const retirement = {
    pack: "@acme/packs/toolkit",
    manifestPath: "packs/toolkit/pack.json",
    reason: "missing",
  } as const;

  it.effect("accepts unchanged retirement facts", () =>
    validatePackRetirementFacts({ planned: [retirement], observed: [retirement] }),
  );

  it.effect("accepts a plan that retires nothing against an intact graph", () =>
    validatePackRetirementFacts({ planned: [], observed: [] }),
  );

  it.effect("conflicts when the target's package became readable before apply", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [retirement],
        observed: [],
      }).pipe(Effect.flip);
      expect(error.category).toBe("conflict");
      expect(error.detail).toContain("@acme/packs/toolkit");
    }),
  );

  it.effect("conflicts when the target's package became unreadable before apply", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [],
        observed: [retirement],
      }).pipe(Effect.flip);
      expect(error.category).toBe("conflict");
    }),
  );

  it.effect("conflicts when the reason for the target's unreadability changed", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [retirement],
        observed: [{ ...retirement, reason: "invalid" }],
      }).pipe(Effect.flip);
      expect(error.category).toBe("conflict");
    }),
  );

  it.effect("conflicts when the graph no longer supports any retirement decision", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [retirement],
        observed: undefined,
      }).pipe(Effect.flip);
      expect(error.category).toBe("conflict");
    }),
  );
});
