import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstallMcpServer, handleUninstallMcpServer } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/uninstall/removes-one-local-connection-at-a-time",
  title: "Uninstall removes one local MCP connection and retains shared source state",
  statement:
    "When a locally named MCP connection is uninstalled, AXM shall remove only that connection from axm.json and agent configuration, and shall retain the shared source's package content and accepted resolution until no connection to that source remains.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "agent-interoperability"],
  status: "accepted",
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

  it.effect("retains the shared package and lock row until the last connection is removed", () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      registry.writeMcp("context", [{ version: "1.0.0" }]);
      const workspace = makeSpecWorkspace({ settings: { sources: [registry.source] } });
      cleanups.push(workspace.cleanup, registry.cleanup);
      for (const localName of ["work-context", "personal-context"]) {
        yield* handleInstallMcpServer(
          {
            source: Option.some("@acme/mcps/context"),
            localName: Option.some(localName),
            env: [],
          },
          { yes: true, force: false, preview: false },
        ).pipe(Effect.provide(workspace.layer));
      }

      yield* handleUninstallMcpServer(
        { serverName: "work-context" },
        { yes: true, preview: false },
      ).pipe(Effect.provide(workspace.layer));

      expect(workspace.readSettings()).toMatchObject({
        mcpServers: { "personal-context": "agentxm:@acme/mcps/context" },
      });
      expect(JSON.stringify(workspace.readSettings())).not.toContain("work-context");
      expect(workspace.readFile(".mcp.json")).not.toContain("work-context");
      expect(workspace.readFile(".mcp.json")).toContain("personal-context");
      expect(workspace.exists("agent_extensions/agentxm/@acme/mcps/context/mcp.json")).toBe(true);
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");

      yield* handleUninstallMcpServer(
        { serverName: "personal-context" },
        { yes: true, preview: false },
      ).pipe(Effect.provide(workspace.layer));

      expect(workspace.exists("agent_extensions/agentxm/@acme/mcps/context")).toBe(false);
      expect(workspace.readLockfileText()).not.toContain("resolvedVersion: 1.0.0");
    }),
  );
});
