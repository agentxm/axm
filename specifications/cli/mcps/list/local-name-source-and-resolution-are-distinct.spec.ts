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
  title: "MCP inventory distinguishes local connection identity from source resolution",
  statement:
    "When MCP servers are listed, AXM shall report each connection's local name, its source, and its accepted resolution as distinct fields in machine output and as separate columns in human output, so that connections sharing one source remain individually identifiable.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics", "agent-interoperability"],
  status: "accepted",
  methods: ["golden-output", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("List locally named MCP connections", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const setup = (machine: boolean) =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      registry.writeMcp("context", [{ version: "1.0.0" }]);
      const workspace = makeSpecWorkspace({
        machine,
        ...(machine ? { flags: { json: true } } : {}),
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
          { yes: true, force: false, preview: false },
        ).pipe(Effect.provide(workspace.layer));
      }
      workspace.rendererState.results.length = 0;
      workspace.rendererState.tables.length = 0;
      return workspace;
    });

  it.effect("emits discriminated local, source, and resolution fields in machine mode", () =>
    Effect.gen(function* () {
      const workspace = yield* setup(true);

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

  it.effect("shows local name and source as separate human table columns", () =>
    Effect.gen(function* () {
      const workspace = yield* setup(false);

      yield* handleListMcpServers().pipe(Effect.provide(workspace.layer));

      expect(workspace.rendererState.tables[0]?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            localName: "work-context",
            source: "agentxm:@acme/mcps/context",
            version: "1.0.0",
          }),
        ]),
      );
    }),
  );
});
