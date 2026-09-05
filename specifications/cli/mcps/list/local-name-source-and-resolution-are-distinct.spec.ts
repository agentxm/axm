import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstallMcpServer, handleListMcpServers } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/list/local-name-source-and-resolution-are-distinct",
  title: "The machine MCP inventory distinguishes local connection identity from source resolution",
  statement:
    "When MCP servers are listed in machine output, AXM shall report each connection's local name, its source, and its accepted resolution as distinct fields, so that connections sharing one source remain individually identifiable.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics", "agent-interoperability"],
  methods: ["example", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("List locally named MCP connections as a machine document", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const setup = () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      registry.writeMcp("context", [{ version: "1.0.0" }]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { sources: [registry.source] },
      });
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
      workspace.rendererState.results.length = 0;
      return workspace;
    });

  it.effect("emits discriminated local, source, and resolution fields", () =>
    Effect.gen(function* () {
      const workspace = yield* setup();

      yield* handleListMcpServers().pipe(Effect.provide(workspace.layer));

      const output = JSON.stringify(workspace.rendererState.results[0]?.data);
      expect(output).toContain('"count":2');
      expect(output).toContain('"localName":"work-context"');
      expect(output).toContain('"source":{"kind":"registry"');
      expect(output).toContain('"locator":"agentxm:@acme/mcps/context"');
      expect(output).toContain("@acme/mcps/context");
      expect(output).toContain('"resolution":{"kind":"registry","version":"1.0.0"');
      expect(output).toContain('"integrity":"sha512-');
    }),
  );
});
