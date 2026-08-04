import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { handleAgentsCapabilities } from "./capabilities.js";

interface CapabilityRow {
  readonly type: string;
  readonly capabilityKey: string;
  readonly native: string;
  readonly axm: string;
  readonly directory: string;
  readonly scopes: string;
}

describe("agents capabilities.handler", () => {
  const makeLayers = (machine: boolean) => {
    const renderer = machine ? TestMachineRenderer.make() : TestRenderer.make();
    return {
      provide: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, renderer.layer, TestFlagsLayer())),
        ),
      rendererState: renderer.state,
    };
  };

  it.effect("renders one row per modeled capability", () => {
    const { provide, rendererState } = makeLayers(false);

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsCapabilities("claude-code");

        const rows = rendererState.tables[0]?.items as ReadonlyArray<CapabilityRow>;
        expect(rows.map((row) => row.type)).toEqual([
          "skill",
          "command",
          "mcp-server",
          "subagent",
          "rule",
          "hook",
        ]);
        // The targeting vocabulary is a separate column from the type id.
        expect(rows.map((row) => row.capabilityKey)).toEqual([
          "skills",
          "commands",
          "mcp-servers",
          "subagents",
          "rules",
          "hooks",
        ]);
        const skill = rows.find((row) => row.type === "skill");
        expect(skill).toMatchObject({
          native: "native",
          axm: "supported",
          directory: ".claude/skills",
          scopes: "project, user",
        });
        // A capability AXM writes directly reports "writer", not its raw status.
        expect(rows.find((row) => row.type === "hook")?.axm).toBe("writer");
        expect(rendererState.tables[0]?.caption).toContain("Claude Code");
      }),
    );
  });

  it.effect("emits the capability matrix as JSON", () => {
    const { provide, rendererState } = makeLayers(true);

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsCapabilities("claude-code");

        expect(Object.keys(rendererState.results[0]?.data as object)).toEqual([
          "agent",
          "name",
          "lifecycle",
          "supported",
          "items",
          "count",
        ]);
        expect(rendererState.results[0]?.data).toMatchObject({
          agent: "claude-code",
          name: "Claude Code",
          lifecycle: "active",
          supported: ["skill", "command", "mcp-server", "subagent", "rule", "hook"],
        });
      }),
    );
  });

  it.effect("reports lifecycle for a retired agent", () => {
    const { provide, rendererState } = makeLayers(false);

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsCapabilities("gemini-cli");

        expect(rendererState.tables[0]?.caption).toContain("retired -> antigravity");
      }),
    );
  });

  it.effect("rejects an unknown agent id with a suggestion", () => {
    const { provide } = makeLayers(false);

    return provide(
      Effect.gen(function* () {
        const outcome = yield* handleAgentsCapabilities("claude-cod").pipe(Effect.flip);
        expect(outcome.detail).toContain("claude-cod");
      }),
    );
  });
});
