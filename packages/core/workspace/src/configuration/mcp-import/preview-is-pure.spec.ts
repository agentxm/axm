import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { runMcpImport } from "../inline-mcp/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/preview-is-pure",
  title: "MCP import preview describes the change without changing workspace state",
  statement:
    "When mcps import previews an eligible unmanaged native server, whether it would adopt the server inline or convert it into an authored package under --as, it shall report the change it would apply with a previewed outcome and shall not change settings, the lockfile, any authored package, or any native agent MCP configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [
    "cli/mcps/import/adoption-reaches-every-configured-agent",
    "cli/mcps/import/creates-authored-package-from-native-server",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const nativeConfig = (server: Readonly<Record<string, unknown>>): string =>
  `${JSON.stringify({ mcpServers: { demo: server } }, null, 2)}\n`;

/**
 * The --as conversion half of this obligation is stated over the authoring
 * use case it plans through, which a feature package may not import: the two
 * rows "previewing the enabled/disabled conversion writes nothing and asks no
 * one" in `extension-authoring`'s
 * `src/import/creates-authored-package-from-native-server.spec.ts` preview the
 * conversion and show the package, the declaration, and the native file all
 * unwritten. The route's flag surface is swept at parse time by
 * `cli/preview-uses-the-canonical-flag`.
 */
describe("MCP server import preview purity", () => {
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

  it.effect("a previewed import of an unmanaged server changes no protected state", () => {
    const fixture = fixtureWith(["claude-code"], {
      ".mcp.json": nativeConfig({ command: "node", args: ["server.js"] }),
    });
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const previewed = yield* runMcpImport("preview");

          expect(previewed).toMatchObject({
            outcome: "previewed",
            resolution: {
              name: "Import MCP servers",
              units: [expect.objectContaining({ label: "Import 1 MCP server", state: "ready" })],
            },
          });
          expect(fixture.snapshot()).toEqual(before);
          expect(fixture.readFile("axm.json")).not.toContain("demo");
          expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a previewed import reports a conflicting candidate and changes nothing", () => {
    const fixture = fixtureWith(["claude-code", "cursor"], {
      ".mcp.json": nativeConfig({ command: "node", args: ["one.js"] }),
      ".cursor/mcp.json": nativeConfig({ command: "node", args: ["two.js"] }),
    });
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const previewed = yield* runMcpImport("preview");

          expect(previewed).toMatchObject({
            outcome: "blocked",
            resolution: {
              name: "Import MCP servers",
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
