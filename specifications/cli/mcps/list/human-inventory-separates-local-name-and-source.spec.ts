import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstallMcpServer, handleListMcpServers } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/list/human-inventory-separates-local-name-and-source",
  title: "The human MCP inventory shows local name and source as separate columns",
  statement:
    "When MCP servers are listed in human output, AXM shall present each connection's local name, its source, and its resolved version as separate columns, so that connections sharing one source remain individually identifiable.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/list/local-name-source-and-resolution-are-distinct"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("List locally named MCP connections for a person", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const setup = () =>
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
      workspace.rendererState.tables.length = 0;
      return workspace;
    });

  it.effect("shows local name, source, and version as separate table columns", () =>
    Effect.gen(function* () {
      const workspace = yield* setup();

      yield* handleListMcpServers().pipe(Effect.provide(workspace.layer));

      expect(workspace.rendererState.tables[0]?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            localName: "work-context",
            source: "agentxm:@acme/mcps/context",
            version: "1.0.0",
          }),
          expect.objectContaining({
            localName: "personal-context",
            source: "agentxm:@acme/mcps/context",
            version: "1.0.0",
          }),
        ]),
      );
    }),
  );
});
