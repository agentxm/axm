import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { nonInteractiveFlag } from "./cli-flags/index.js";
import { plain, type Ask } from "./screen/index.js";
import { TestRenderer } from "./test-support/presenter-test.js";
import {
  WorkspaceInitializationCancelled,
  WorkspaceInitializationInteraction,
} from "@agentxm/workspace/configuration";
import { WorkspaceInitializationInteractionLive } from "./workspace-initialization-interaction-live.js";

const makeHarness = Effect.sync(() => {
  const renderer = TestRenderer.make();
  const layer = Layer.mergeAll(
    renderer.layer,
    Layer.succeed(nonInteractiveFlag, Option.some(false)),
    WorkspaceInitializationInteractionLive.pipe(Layer.provide(renderer.layer)),
  );
  return { layer, script: renderer.state.script };
});

/** A pick's options as a title, the facts beside it, and whether it opens picked. */
const agentOptions = (
  asked: Ask<unknown> | undefined,
): ReadonlyArray<readonly [string, string, boolean]> =>
  asked?._tag === "Pick"
    ? asked.options.map((option) => [
        option.title,
        (option.details ?? []).map((detail) => plain(detail)).join(" · "),
        option.selected === true,
      ])
    : [];

const selectAgents = (options: {
  readonly projectDetectedIds?: ReadonlyArray<string>;
  readonly configuredIds?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const interaction = yield* WorkspaceInitializationInteraction;
    return yield* interaction.selectAgents({
      allAgents: [AGENTS["claude-code"], AGENTS["codex"]],
      detectedIds: options.projectDetectedIds ?? [],
      projectDetectedIds: options.projectDetectedIds ?? [],
      userDetectedIds: [],
      suggestedIds: [],
      configuredIds: options.configuredIds ?? [],
    });
  });

/** The words of a confirmation's choices, in the order it offers them. */
const confirmWords = (asked: Ask<unknown> | undefined): ReadonlyArray<string> =>
  asked?._tag === "Confirm" ? asked.choices.map((choice) => choice.word) : [];

/** A list's options as a title and the facts beside it. */
const sourceOptions = (
  asked: Ask<unknown> | undefined,
): ReadonlyArray<readonly [string, string]> =>
  asked?._tag === "Choose"
    ? asked.options.map((option) => [
        option.title,
        (option.details ?? []).map((detail) => plain(detail)).join(" · "),
      ])
    : [];

/** What an input question makes of a typed line. */
const inputValidation = (asked: Ask<unknown> | undefined, raw: string) =>
  asked?._tag === "Input" ? asked.validate(raw) : Result.fail("not an input");

const selectSource = Effect.gen(function* () {
  const interaction = yield* WorkspaceInitializationInteraction;
  return yield* interaction.selectInstructionSource({
    defaultFileName: "AGENTS.md",
    choices: [
      { fileName: "AGENTS.md", exists: true, lines: 12 },
      { fileName: "CLAUDE.md", exists: true, lines: 84 },
      { fileName: "GEMINI.md", exists: false, lines: 0 },
    ],
  });
});

describe("WorkspaceInitializationInteractionLive", () => {
  it.effect("offers every agent with what the scan found, detected agents picked", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;

      const selected = yield* selectAgents({ projectDetectedIds: ["claude-code"] }).pipe(
        Effect.provide(harness.layer),
      );

      // Nothing was scripted, so the list was taken as it opened.
      expect(selected).toEqual(["claude-code"]);
      const [asked] = harness.script.asks;
      expect(asked?._tag).toBe("Pick");
      expect(asked?.question).toBe("Select agents to configure");
      expect(agentOptions(asked)).toEqual([
        ["Claude Code", "detected in project · skills: .claude/skills", true],
        ["Codex", "skills: .agents/skills", false],
      ]);
    }),
  );

  it.effect("preselects configured setup agents", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;

      const selected = yield* selectAgents({ configuredIds: ["codex"] }).pipe(
        Effect.provide(harness.layer),
      );

      expect(selected).toEqual(["codex"]);
    }),
  );

  it.effect("answers with the agents the person leaves picked", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      harness.script.answers.push({ _tag: "Pick", titles: ["Claude Code", "Codex"] });

      const selected = yield* selectAgents({ configuredIds: ["codex"] }).pipe(
        Effect.provide(harness.layer),
      );

      expect(selected).toEqual(["claude-code", "codex"]);
    }),
  );

  it.effect("maps a cancelled agent pick into WorkspaceInitializationCancelled", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      harness.script.answers.push({ _tag: "Cancel" });

      const failure = yield* selectAgents({}).pipe(Effect.provide(harness.layer), Effect.flip);

      expect(failure).toBeInstanceOf(WorkspaceInitializationCancelled);
    }),
  );

  it.effect("maps a cancelled prompt into WorkspaceInitializationCancelled", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      harness.script.answers.push({ _tag: "Cancel" });

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

      const enabled = yield* Effect.gen(function* () {
        const interaction = yield* WorkspaceInitializationInteraction;
        return yield* interaction.confirmInstructionSync({ enabled: true });
      }).pipe(Effect.provide(harness.layer));

      // Nothing was scripted, so the question settled on its default, which
      // the caller's own setting decides.
      expect(enabled).toBe(true);

      const [asked] = harness.script.asks;
      expect(asked?._tag).toBe("Confirm");
      expect(asked?.question).toBe("Sync instructions to the selected agents?");
      expect(asked?.note).toBe("Updates agent instruction files such as AGENTS.md and CLAUDE.md.");
      expect(confirmWords(asked)).toEqual(["yes", "no"]);
    }),
  );

  it.effect("offers the setup gate with proceeding as its default", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;

      const proceed = yield* Effect.gen(function* () {
        const interaction = yield* WorkspaceInitializationInteraction;
        return yield* interaction.confirmSetupPlan();
      }).pipe(Effect.provide(harness.layer));

      expect(proceed).toBe(true);
      expect(harness.script.asks[0]?.question).toBe("Apply setup?");
    }),
  );

  it.effect("puts the risk-bearing choice first where syncing is off", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;

      const enabled = yield* Effect.gen(function* () {
        const interaction = yield* WorkspaceInitializationInteraction;
        return yield* interaction.confirmInstructionSync({ enabled: false });
      }).pipe(Effect.provide(harness.layer));

      expect(enabled).toBe(false);
      expect(confirmWords(harness.script.asks[0])).toEqual(["no", "yes"]);
    }),
  );

  it.effect("offers the source files as a list that says which exist", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      harness.script.answers.push({ _tag: "Choose", title: "GEMINI.md" });

      const selected = yield* selectSource.pipe(Effect.provide(harness.layer));

      expect(selected).toBe("GEMINI.md");
      const [asked] = harness.script.asks;
      expect(asked?._tag).toBe("Choose");
      expect(asked?.question).toBe("Instructions source");
      expect(asked?.note).toBe(
        "AXM will sync its contents to the selected agents' instruction files.",
      );
      expect(sourceOptions(asked)).toEqual([
        ["AGENTS.md", "recommended · existing · 12 lines"],
        ["CLAUDE.md", "existing · 84 lines"],
        ["GEMINI.md", "will be created"],
        ["Other…", "type a file name"],
      ]);
    }),
  );

  it.effect("opens the source list on the recommended file", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;

      const selected = yield* selectSource.pipe(Effect.provide(harness.layer));

      expect(selected).toBe("AGENTS.md");
    }),
  );

  it.effect("asks for a file name when the source is another file", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      harness.script.answers.push(
        { _tag: "Choose", title: "Other…" },
        { _tag: "Input", text: " docs/AGENTS.md " },
      );

      const selected = yield* selectSource.pipe(Effect.provide(harness.layer));

      expect(selected).toBe("docs/AGENTS.md");
      const asked = harness.script.asks[1];
      expect(asked?._tag).toBe("Input");
      expect(asked?.question).toBe("Instructions file name");
      expect(asked?.note).toBe(
        "Relative to the project root. It will be created if it does not exist.",
      );
    }),
  );

  it.effect("refuses a source file name that is empty or outside the project", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      harness.script.answers.push(
        { _tag: "Choose", title: "Other…" },
        { _tag: "Input", text: "docs/AGENTS.md" },
      );
      yield* selectSource.pipe(Effect.provide(harness.layer));

      const refusal = (raw: string) =>
        Result.match(inputValidation(harness.script.asks[1], raw), {
          onSuccess: () => undefined,
          onFailure: (problem) => problem,
        });
      expect(refusal("   ")).toBe("Enter a file name, such as docs/AGENTS.md.");
      expect(refusal("/etc/AGENTS.md")).toBe("Enter a path relative to the project root.");
      expect(refusal("C:\\AGENTS.md")).toBe("Enter a path relative to the project root.");
      expect(refusal("docs/AGENTS.md")).toBeUndefined();
    }),
  );

  it.effect("maps a cancelled source list into WorkspaceInitializationCancelled", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      harness.script.answers.push({ _tag: "Cancel" });

      const failure = yield* selectSource.pipe(Effect.provide(harness.layer), Effect.flip);

      expect(failure).toBeInstanceOf(WorkspaceInitializationCancelled);
    }),
  );
});
