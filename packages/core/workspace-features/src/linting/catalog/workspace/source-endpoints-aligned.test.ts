import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  makeWorkspaceReadModel,
  type DesiredExtensionNode,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  desiredConstraintOf,
  WorkspaceReadModelTest,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { sourceEndpointsAlignedRule } from "./source-endpoints-aligned.js";

const treeIntegrity = `sha256-tree-v2:${"0".repeat(64)}`;

/** A Pack member bound to a Registry endpoint, through a configured alias or its own declaration. */
const member = (endpoint: string, sourceName: string | undefined): DesiredExtensionNode => ({
  type: "skill",
  name: "review",
  identity: {
    authority: "registry",
    fqn: "@acme/skills/review",
    registry: { sourceName, endpoint: decodeRegistryEndpointSync(endpoint) },
  },
  source: "@acme/skills/review@^1.0.0",
  enabled: true,
  constraint: desiredConstraintOf("^1.0.0"),
  origins: [
    {
      type: "pack",
      pack: { authority: "registry", fqn: "@acme/packs/toolkit" },
      manifestPath: "axm-lock.yaml#packs.toolkit",
      source: "@acme/skills/review",
      constraint: "^1.0.0",
      enabled: true,
    },
  ],
});

const check = (node: DesiredExtensionNode) =>
  Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    const context = {
      subject: { root: "/workspace", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(true),
      health: {
        desiredState: Effect.succeed({
          nodes: [node],
          mcpSourceClosures: [],
          problems: [],
          packMembership: [],
        }),
      },
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
    return yield* sourceEndpointsAlignedRule.check(context);
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({
        workspaceRoot: "/workspace",
        userHome: "/home/test",
        project: {
          settings: {
            _tag: "valid",
            contents: {
              agents: ["claude-code"],
              sources: [{ name: "alias", type: "registry", location: "https://registry.example/" }],
            },
          },
          lockfile: {
            _tag: "valid",
            contents: {
              lockfileVersion: 12,
              skills: {
                review: {
                  source: { type: "registry", url: "https://registry.example" },
                  identity: { owner: "@acme", name: "review" },
                  resolved: {
                    version: "1.0.0",
                    integrity: "sha512-review",
                    publisherBindingId: "hbnd_review",
                  },
                  treeIntegrity,
                },
              },
            },
          },
        },
      }),
    ),
    Effect.orDie,
  );

describe("workspace/source-endpoints-aligned", () => {
  it.effect("reports an explicit-endpoint Pack member whose accepted row is elsewhere", () =>
    Effect.gen(function* () {
      const findings = yield* check(member("https://mirror.example", undefined));
      expect(findings.map(({ message }) => message)).toEqual([
        "Accepted resolution 'skill:review' was resolved from registry https://registry.example, but its declared Registry endpoint now binds it to registry https://mirror.example. Use an explicit source transition before syncing.",
      ]);
    }),
  );

  it.effect("accepts any alias or spelling of the accepted endpoint", () =>
    Effect.gen(function* () {
      expect(yield* check(member("https://registry.example/", "alias"))).toEqual([]);
      expect(yield* check(member("https://registry.example", undefined))).toEqual([]);
    }),
  );
});
