import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { AddInlineMcpServer } from "./add-inline-mcp-server.js";
import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { runInlineMcpAdd } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/add/preview-is-pure",
  title: "Inline MCP server add preview describes the entry without changing any state",
  statement:
    "When mcps add runs in preview mode for an inline MCP server the workspace does not yet configure, it shall report the settings entry and native realization it would apply with a previewed outcome and shall not change settings, native MCP configuration, or any other workspace state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/add/records-and-realizes-inline-configuration"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Inline MCP server add preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const fixture = (): ConfigurationFixture => {
    const created = makeConfigurationFixture({ settings: { agents: ["claude-code"] } });
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("a previewed add of a new inline server changes no protected state", () => {
    const workspace = fixture();
    const before = workspace.snapshot();
    return workspace
      .provide(
        Effect.gen(function* () {
          const outcome = yield* runInlineMcpAdd(
            { name: "demo", command: "node server.js", env: [], headers: [] },
            "preview",
          );

          expect(outcome).toMatchObject({
            outcome: "previewed",
            resolution: {
              name: "Add MCP server",
              units: [
                expect.objectContaining({ label: "Configure demo", state: "ready" }),
                expect.objectContaining({
                  label: "Sync demo to configured agents",
                  state: "ready",
                }),
              ],
            },
          });
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.exists(".mcp.json")).toBe(false);
          expect(workspace.readFile("axm.json")).not.toContain("demo");
          expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "a previewed add without a transport reports the usage failure and changes nothing",
    () => {
      const workspace = fixture();
      const before = workspace.snapshot();
      return workspace
        .provide(
          Effect.gen(function* () {
            const failure = yield* AddInlineMcpServer.prepare({
              name: "demo",
              env: [],
              headers: [],
            }).pipe(Effect.flip);

            expect(failure).toMatchObject({
              _tag: "WorkspaceConfigurationFailed",
              category: "usage",
              detail: expect.stringContaining("only configures inline MCP servers"),
            });
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
