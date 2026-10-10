import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { runMcpAdoption } from "../inline-mcp/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/adopt/preview-is-pure",
  title: "MCP adoption preview describes the change without changing workspace state",
  statement:
    "When mcps adopt previews unmanaged native servers, it shall describe the inline ownership transfers and blockers without changing settings, the lockfile, any authored package, or any native agent MCP configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [
    "cli/mcps/adopt/adoption-reaches-every-configured-agent",
    "cli/mcps/import/preview-is-pure",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const nativeConfig = (server: Readonly<Record<string, unknown>>): string =>
  `${JSON.stringify({ mcpServers: { demo: server } }, null, 2)}\n`;

describe("MCP server adoption preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const fixtureWith = (
    agents: ReadonlyArray<string>,
    files: Readonly<Record<string, string>>,
  ): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({ settings: { agents: [...agents] }, files });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("a previewed adoption of an unmanaged server changes no protected state", () => {
    const fixture = fixtureWith(["claude-code"], {
      ".mcp.json": nativeConfig({ command: "node", args: ["server.js"] }),
    });
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const previewed = yield* runMcpAdoption("preview");

          expect(previewed).toMatchObject({
            outcome: "previewed",
            resolution: {
              name: "Adopt MCP servers",
              units: [expect.objectContaining({ label: "Adopt 1 MCP server", state: "ready" })],
            },
          });
          expect(fixture.snapshot()).toEqual(before);
          expect(fixture.readFile("axm.json")).not.toContain("demo");
          expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a previewed adoption reports a conflicting candidate and changes nothing", () => {
    const fixture = fixtureWith(["claude-code", "cursor"], {
      ".mcp.json": nativeConfig({ command: "node", args: ["one.js"] }),
      ".cursor/mcp.json": nativeConfig({ command: "node", args: ["two.js"] }),
    });
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const previewed = yield* runMcpAdoption("preview");

          expect(previewed).toMatchObject({
            outcome: "blocked",
            resolution: {
              name: "Adopt MCP servers",
              blocking: {
                class: "precondition-unmet",
                subject: "demo",
                causeCode: "conflict",
              },
              units: [expect.objectContaining({ label: "demo", state: "blocked" })],
            },
          });
          expect(previewed.candidate.preflight.conflicts).toHaveLength(1);
          expect(fixture.snapshot()).toEqual(before);
          expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
