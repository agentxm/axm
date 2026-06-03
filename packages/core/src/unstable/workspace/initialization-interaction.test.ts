import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Terminal from "effect/Terminal";
import { AGENTS } from "../agents/registry.js";
import { nonInteractiveFlag } from "../cli-flags/index.js";
import {
  WorkspaceInitializationInteraction,
  WorkspaceInitializationInteractionLive,
} from "./initialization-interaction.js";

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
  const queue = yield* Queue.make<Terminal.UserInput, never>();
  const terminal = Terminal.make({
    columns: Effect.succeed(80),
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
          configuredIds: [],
        });
      }).pipe(Effect.provide(harness.layer));

      expect(selected).toEqual(["claude-code"]);

      const rendered = harness.output.map(stripAnsi).join("\n");
      expect(rendered).toContain("Select agents to configure");
      expect(rendered).toContain("[x] Claude Code");
      expect(rendered).not.toContain("Inverse Selection");
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
          configuredIds: ["codex"],
        });
      }).pipe(Effect.provide(harness.layer));

      expect(selected).toEqual(["codex"]);
    }),
  );
});
