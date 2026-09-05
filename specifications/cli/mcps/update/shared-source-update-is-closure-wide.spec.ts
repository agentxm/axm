import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstallMcpServer, handleWorkspaceUpdate } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/update/shared-source-update-is-closure-wide",
  title: "Updating one locally named connection advances every connection sharing its source",
  statement:
    "When an update targets one locally named MCP connection, AXM shall advance the single accepted resolution of its shared source and refresh the agent configuration of every connection to that source, rather than advancing the named connection alone.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Update a shared MCP source closure", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("advances one lock resolution and refreshes every local projection", () =>
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
          { force: false, preview: false },
        ).pipe(Effect.provide(workspace.layer));
      }
      registry.writeMcp("context", [{ version: "1.0.0" }, { version: "2.0.0" }]);

      yield* handleWorkspaceUpdate({
        command: "mcps.update",
        type: Option.some("mcp-server"),
        planName: "Update configured MCP servers",
        planDescription: Option.some("Update configured MCP servers"),
        flags: { preview: false, force: false },
        names: ["work-context"],
      }).pipe(Effect.provide(workspace.layer));

      expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
        result: { outcome: "applied", counts: { committed: 1 } },
      });
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 2.0.0");
      const projection = workspace.readFile(".mcp.json");
      expect(projection).toContain("work-context");
      expect(projection).toContain("personal-context");
      expect(projection).toContain("2.0.0");
    }),
  );
});
