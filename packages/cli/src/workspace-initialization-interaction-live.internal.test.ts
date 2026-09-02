import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Terminal from "effect/Terminal";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { nonInteractiveFlag } from "./cli-flags/index.js";
import { TestRenderer } from "./screen/index.js";
import {
  WorkspaceInitializationCancelled,
  WorkspaceInitializationInteraction,
} from "@agentxm/workspace-configuration";
import { WorkspaceInitializationInteractionLive } from "./workspace-initialization-interaction-live.js";

const ansiPattern = new RegExp(String.raw`\u001B\[[0-9;]*[A-Za-z]`, "g");

const stripAnsi = (text: string) => text.replace(ansiPattern, "");

const makeInput = (name: string): Terminal.UserInput => ({
  input: Option.some(name),
  key: {
    name,
    ctrl: false,
    meta: false,
    shift: false,
  },
});

const makeHarness = Effect.gen(function* () {
  const output: Array<string> = [];
  const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>();
  const terminal = Terminal.make({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    display: (text) =>
      Effect.sync(() => {
        output.push(text);
      }),
    readInput: Effect.succeed(Queue.asDequeue(queue)),
    readLine: Effect.succeed(""),
  });
  const platformLayer = Layer.mergeAll(
    FileSystem.layerNoop({}),
    Path.layer,
    Layer.succeed(Terminal.Terminal, terminal),
    TestRenderer.make().layer,
  );

  const layer = Layer.mergeAll(
    platformLayer,
    Layer.succeed(nonInteractiveFlag, Option.some(false)),
    WorkspaceInitializationInteractionLive.pipe(Layer.provide(platformLayer)),
  );

  return { layer, output, queue };
});

describe("WorkspaceInitializationInteractionLive", () => {
  it.effect("selects detected setup agents without rendering inverse selection", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeInput("enter"));

      const selected = yield* Effect.gen(function* () {
        const interaction = yield* WorkspaceInitializationInteraction;
        return yield* interaction.selectAgents({
          allAgents: [AGENTS["claude-code"], AGENTS["codex"]],
          detectedIds: ["claude-code"],
          projectDetectedIds: ["claude-code"],
          userDetectedIds: [],
          suggestedIds: [],
          configuredIds: [],
        });
      }).pipe(Effect.provide(harness.layer));

      expect(selected).toEqual(["claude-code"]);

      const rendered = harness.output.map(stripAnsi).join("\n");
      expect(rendered).toContain("Select agents to configure");
      expect(rendered).toContain("Filter: type to filter");
      expect(rendered).toContain("[x] Claude Code");
      expect(rendered).toContain("1 agent selected");
      expect(rendered).not.toContain("Inverse Selection");
      expect(rendered).toContain("Selected 1 agent");
      expect(rendered).not.toContain("selected: 1");
    }),
  );

  it.effect("preselects configured setup agents", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeInput("enter"));

      const selected = yield* Effect.gen(function* () {
        const interaction = yield* WorkspaceInitializationInteraction;
        return yield* interaction.selectAgents({
          allAgents: [AGENTS["claude-code"], AGENTS["codex"]],
          detectedIds: [],
          projectDetectedIds: [],
          userDetectedIds: [],
          suggestedIds: [],
          configuredIds: ["codex"],
        });
      }).pipe(Effect.provide(harness.layer));

      expect(selected).toEqual(["codex"]);
    }),
  );

  it.effect("maps a cancelled prompt into WorkspaceInitializationCancelled", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.end(harness.queue);

      const exit = yield* Effect.gen(function* () {
        const interaction = yield* WorkspaceInitializationInteraction;
        return yield* interaction.confirmSetupPlan();
      }).pipe(Effect.provide(harness.layer), Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.squash(exit.cause);
        expect(failure).toBeInstanceOf(WorkspaceInitializationCancelled);
      }
    }),
  );

  it.effect("explains instruction syncing before confirmation", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeInput("enter"));

      const enabled = yield* Effect.gen(function* () {
        const interaction = yield* WorkspaceInitializationInteraction;
        return yield* interaction.confirmInstructionSync({ enabled: true });
      }).pipe(Effect.provide(harness.layer));

      expect(enabled).toBe(true);

      const rendered = harness.output.map(stripAnsi).join("\n");
      expect(rendered).toContain("Sync instructions to the selected agents?");
      expect(rendered).toContain(
        "Updates agent instruction files such as AGENTS.md and CLAUDE.md.",
      );
    }),
  );

  it.effect("explains the source file and distinguishes existing and new choices", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeInput("down"));
      yield* Queue.offer(harness.queue, makeInput("down"));
      yield* Queue.offer(harness.queue, makeInput("enter"));

      const selected = yield* Effect.gen(function* () {
        const interaction = yield* WorkspaceInitializationInteraction;
        return yield* interaction.selectInstructionSource({
          defaultFileName: "AGENTS.md",
          choices: [
            { fileName: "AGENTS.md", exists: true, lines: 12 },
            { fileName: "CLAUDE.md", exists: true, lines: 84 },
            { fileName: "GEMINI.md", exists: false, lines: 0 },
          ],
        });
      }).pipe(Effect.provide(harness.layer));

      expect(selected).toBe("GEMINI.md");
      const rendered = harness.output.map(stripAnsi).join("\n");
      expect(rendered).toContain("Choose the source file for shared instructions");
      expect(rendered).toContain(
        "AXM will sync its contents to the selected agents' instruction files.",
      );
      expect(rendered).toContain("AGENTS.md - Recommended · existing · 12 lines");
      expect(rendered).toContain("CLAUDE.md - existing · 84 lines");
      expect(rendered).toContain("GEMINI.md - will be created");
      expect(rendered).toContain("Enter another filename...");
      expect(rendered).not.toContain("standard · recommended");
    }),
  );
});
