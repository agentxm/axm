import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
} from "../../install/test-helpers.js";
import { applyUninstall, uninstallRequest } from "../../uninstall/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/uninstall/removes-one-local-connection-at-a-time",
  title: "Uninstall removes one local MCP connection and retains shared source state",
  statement:
    "When a locally named MCP connection is uninstalled, AXM shall remove only that connection from axm.json and agent configuration, and shall retain the shared source's package content and accepted resolution until no connection to that source remains.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Uninstall a locally named MCP connection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("retains the shared package and lock row until the last connection is removed", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const { workspace, registry } = world;
    registry.writeMcp("context", [{ version: "1.0.0" }]);
    return workspace
      .provide(
        Effect.gen(function* () {
          for (const localName of ["work-context", "personal-context"]) {
            yield* applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: "@acme/mcps/context" },
                localName,
              }),
            );
          }

          yield* applyUninstall(uninstallRequest({ type: "mcp-server", selector: "work-context" }));

          expect(readSettings(workspace)).toMatchObject({
            mcpServers: { "personal-context": "agentxm:@acme/mcps/context" },
          });
          expect(JSON.stringify(readSettings(workspace))).not.toContain("work-context");
          expect(workspace.readFile(".mcp.json")).not.toContain("work-context");
          expect(workspace.readFile(".mcp.json")).toContain("personal-context");
          expect(workspace.exists("agent_extensions/agentxm/@acme/mcps/context/mcp.json")).toBe(
            true,
          );
          expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 1.0.0");

          yield* applyUninstall(
            uninstallRequest({ type: "mcp-server", selector: "personal-context" }),
          );

          expect(workspace.exists("agent_extensions/agentxm/@acme/mcps/context")).toBe(false);
          expect(workspace.readFile("axm-lock.yaml")).not.toContain("resolvedVersion: 1.0.0");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
