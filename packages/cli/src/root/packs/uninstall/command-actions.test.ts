import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decodeDesiredExtensionIdentity } from "@agentxm/client-core/unstable/extensions";
import type {
  DesiredExtensionNode,
  DesiredStateGraph,
} from "@agentxm/client-core/unstable/workspace";

import {
  validateResolvedPackUninstallTargets,
  type ResolvedPackUninstallTarget,
} from "./command-actions.js";

const targetFor = (identity: string): ResolvedPackUninstallTarget => {
  const decoded = decodeDesiredExtensionIdentity(identity);
  if (decoded === undefined || decoded.type !== "pack") {
    throw new Error(`Invalid pack test identity: ${identity}`);
  }
  return {
    type: "pack",
    owner: decoded.owner,
    name: decoded.name,
    authority: decoded.authority,
    desiredIdentity: identity,
  };
};

const packNode = (identity: string, name = "toolkit"): DesiredExtensionNode => ({
  type: "pack",
  name,
  identity,
  source: identity,
  enabled: true,
  constraints: [],
  origins: [{ type: "settings", source: identity, enabled: true }],
});

const completeGraph = (nodes: ReadonlyArray<DesiredExtensionNode>): DesiredStateGraph => ({
  complete: true,
  nodes,
  problems: [],
});

const expectFailureCode = (
  graph: DesiredStateGraph,
  targets: ReadonlyArray<ResolvedPackUninstallTarget>,
  code: "conflict" | "validation",
) =>
  Effect.gen(function* () {
    const error = yield* validateResolvedPackUninstallTargets(graph, targets).pipe(Effect.flip);
    expect(error.code).toBe(code);
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
          identity: "@other/skills/unrelated",
          source: "@other/skills/unrelated",
          enabled: true,
          constraints: [],
          origins: [
            {
              type: "settings",
              source: "@other/skills/unrelated",
              enabled: true,
            },
          ],
        },
      ]),
      [selected],
    ),
  );

  it.effect("fails with conflict when the selected owner changes", () =>
    expectFailureCode(
      completeGraph([packNode("workspace:@other/packs/toolkit")]),
      [selected],
      "conflict",
    ),
  );

  it.effect("fails with conflict when the selected authority changes", () =>
    expectFailureCode(completeGraph([packNode("@acme/packs/toolkit")]), [selected], "conflict"),
  );

  it.effect("fails with conflict when the selected node disappears", () =>
    expectFailureCode(completeGraph([]), [selected], "conflict"),
  );

  it.effect("fails with validation when the selected current identity cannot decode", () =>
    expectFailureCode(
      completeGraph([packNode("workspace:not-an-extension")]),
      [selected],
      "validation",
    ),
  );

  it.effect("fails with validation when the current graph is incomplete", () =>
    expectFailureCode(
      { complete: false, nodes: [packNode(selected.desiredIdentity)], problems: [] },
      [selected],
      "validation",
    ),
  );
});
