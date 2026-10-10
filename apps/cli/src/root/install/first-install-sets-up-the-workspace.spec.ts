import * as fs from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { useFirstInstallProject } from "../../test-support/first-install-harness.js";
import { makeTestScreen } from "../../test-support/screen-test.js";
import { setUpFirstUse } from "../shared/first-use.js";

export const specification = defineSpecification({
  requirement: "cli/install/first-install-sets-up-the-workspace",
  title: "A first install a person can answer sets the workspace up",
  statement:
    "Where a prompt can open, an install applied into an uninitialized scope shall, after the person has selected what to install, ask what setup asks — the coding agents the request did not name and, in a project, whether and from which file to manage instruction files — show setup's plan, and on approval set the workspace up before installing into it; a cancelled or empty selection shall ask nothing further, and a cancelled question or declined plan shall write no state.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [
    "cli/install/first-install-establishes-minimal-state",
    "cli/setup/first-use-plan-and-migration",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Whether a first install should also offer the official AXM skill that setup seeds is undecided; it installs only what the person selected.",
    "A Skills-manager handoff into an uninitialized scope sets the workspace up the same way, but no example here exercises that route.",
  ],
  limitations: [
    {
      limitation:
        "The questions are answered through the scripted terminal, which replays keys through the production reducer and view; the examples do not establish the rendering in a real terminal emulator.",
      retirementCondition:
        "Add process-boundary evidence when an interactive terminal harness is allocated to the install route.",
    },
    {
      limitation:
        "The examples drive the install handler with the first use its command selects where a prompt can open; the command's own choice between setup and the unattended path is exercised only by cli/install/first-install-establishes-minimal-state at the process boundary.",
      retirementCondition:
        "Drive the registered install command against a scripted terminal once the command harness can open prompts.",
    },
  ],
});

describe("First install where a person can answer", () => {
  const { writeSource, install } = useFirstInstallProject();

  /** The install as its command runs it where a person can answer setup's questions. */
  const setUpInstall = (source: string, screen: ReturnType<typeof makeTestScreen>) =>
    install(source, screen, setUpFirstUse({ scope: "project", agents: [] }));

  it.effect("runs setup after the selection and installs into the workspace it creates", () =>
    Effect.gen(function* () {
      fs.writeFileSync("CLAUDE.md", "# Team\n");
      const screen = makeTestScreen();
      screen.state.script.answers.push(
        { _tag: "Pick", titles: ["review"] },
        { _tag: "Pick", titles: ["Claude Code"] },
        { _tag: "Confirm", key: "y" },
        { _tag: "Choose", title: "AGENTS.md" },
        { _tag: "Confirm", key: "y" },
      );

      yield* setUpInstall(writeSource(["review", "triage"]), screen);

      expect(screen.state.script.asks.map((ask) => ask.label ?? ask.question)).toEqual([
        "Skills",
        "Agents",
        "Sync instructions",
        "Instructions source",
        "Apply setup",
      ]);
      const settings: unknown = JSON.parse(fs.readFileSync("axm.json", "utf8"));
      expect(settings).toMatchObject({
        agents: ["claude-code"],
        instructionFiles: { fileName: "AGENTS.md" },
      });
      expect(settings).toHaveProperty("skills.review");
      expect(settings).not.toHaveProperty("skills.triage");
      expect(fs.readFileSync("AGENTS.md", "utf8")).toBe("# Team\n");
      expect(fs.lstatSync("CLAUDE.md").isSymbolicLink()).toBe(true);
      expect(fs.existsSync(".claude/skills/review/SKILL.md")).toBe(true);
    }),
  );

  it.effect("does not ask for agents the request named", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push(
        { _tag: "Pick", titles: ["review"] },
        { _tag: "Confirm", key: "n" },
        { _tag: "Confirm", key: "y" },
      );

      yield* install(
        writeSource(["review"]),
        screen,
        setUpFirstUse({ scope: "project", agents: ["codex"] }),
      );

      expect(screen.state.script.asks.map((ask) => ask.label)).toEqual([
        "Skills",
        "Sync instructions",
        "Apply setup",
      ]);
      expect(JSON.parse(fs.readFileSync("axm.json", "utf8"))).toMatchObject({ agents: ["codex"] });
    }),
  );

  it.effect("records a declined instruction choice as the person's own", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push(
        { _tag: "Pick", titles: ["review"] },
        { _tag: "Pick", titles: ["Codex"] },
        { _tag: "Confirm", key: "n" },
        { _tag: "Confirm", key: "y" },
      );

      yield* setUpInstall(writeSource(["review"]), screen);

      expect(JSON.parse(fs.readFileSync("axm.json", "utf8"))).toMatchObject({
        agents: ["codex"],
        instructionFiles: false,
      });
      expect(fs.existsSync("AGENTS.md")).toBe(false);
    }),
  );

  it.effect("writes nothing when the setup plan is declined", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push(
        { _tag: "Pick", titles: ["review"] },
        { _tag: "Pick", titles: ["Codex"] },
        { _tag: "Confirm", key: "n" },
        { _tag: "Confirm", key: "n" },
      );

      const failure = yield* setUpInstall(writeSource(["review"]), screen).pipe(Effect.flip);

      expect(failure).toMatchObject({ _tag: "WorkspaceInitializationCancelled" });
      expect(fs.readdirSync(".")).toEqual([]);
    }),
  );

  it.effect("never starts setup when the selection is cancelled", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push({ _tag: "Cancel" });

      const failure = yield* setUpInstall(writeSource(["review", "triage"]), screen).pipe(
        Effect.flip,
      );

      expect(failure).toMatchObject({ _tag: "InstallSelectionCancelled" });
      expect(screen.state.script.asks.map((ask) => ask.label)).toEqual(["Skills"]);
      expect(fs.readdirSync(".")).toEqual([]);
    }),
  );
});
