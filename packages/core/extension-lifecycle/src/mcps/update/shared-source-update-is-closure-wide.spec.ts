import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { countUnitStates, deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeLifecycleFixture, makeLifecycleRegistry } from "../../testing.js";
import { applyInstall, installRequest } from "../../install/test-helpers.js";
import { applyUpdate, configuredUpdateRequest, expectResolved } from "../../update/test-helpers.js";

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

const SOURCE = "@acme/mcps/context";
const NAMED = "work-context";
const SIBLING = "personal-context";

describe("Update a shared MCP source closure", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("advances one lock resolution and refreshes every local projection", () => {
    const registry = makeLifecycleRegistry();
    cleanups.push(registry.cleanup);
    registry.writeMcp("context", [{ version: "1.0.0" }]);
    const workspace = makeLifecycleFixture({
      sources: "live",
      settings: { owner: "@acme", agents: ["claude-code"], sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup);
    return workspace
      .provide(
        Effect.gen(function* () {
          for (const localName of [NAMED, SIBLING]) {
            yield* applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: SOURCE },
                localName,
              }),
            );
          }
          registry.writeMcp("context", [{ version: "1.0.0" }, { version: "2.0.0" }]);

          const resolution = expectResolved(
            yield* applyUpdate(
              configuredUpdateRequest({
                type: "mcp-server",
                nameFilters: [NAMED],
                planName: "Update configured MCP servers",
                planDescription: "Update configured MCP servers",
              }),
            ),
          );

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(countUnitStates(resolution.units).committed).toBe(1);
          // One shared source, one accepted resolution: it advanced once.
          const lock = workspace.readFile("axm-lock.yaml");
          expect(lock).toContain("resolvedVersion: 2.0.0");
          expect(lock).not.toContain("resolvedVersion: 1.0.0");
          const projection = workspace.readFile(".mcp.json");
          expect(projection).toContain(NAMED);
          expect(projection).toContain(SIBLING);
          expect(projection).toContain("2.0.0");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
