import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-kernel/workspace-state/live";

import { paintText } from "../../screen/paint-text.js";
import { makeTestScreen } from "../../test-support/screen-test.js";
import {
  cliTestBuiltInSources,
  makeWorkspaceLifecycleTestContext,
} from "../../test-support/test-helpers.js";
import { handleInstall } from "./handler.js";

export const specification = defineSpecification({
  requirement: "cli/install/source-selection-is-one-question",
  title: "Choosing what to install from a source is one question",
  statement:
    "Where a prompt can open and an install request leaves open what to take from a source, AXM shall state how many extensions of each type the source offers and then ask one question that lists them all under a heading for each type, Packs first, shall show the extensions a picked Pack brings as included without counting them among those picked, shall accept an answer only when at least one extension is picked, and shall change no workspace state when the question is cancelled.",
  class: "human-factors",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [
    "cli/install/selects-requested-source-extensions",
    "cli/interactions-retain-context-and-disposition",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "How should the question show an extension the workspace already desires, directly or through a Pack?",
  ],
  limitations: [
    {
      limitation:
        "The question is answered through the scripted terminal, which replays keys through the production reducer and view; the example does not establish the rendering in a real terminal emulator or from a remote Git source.",
      retirementCondition:
        "Add process-boundary evidence when an interactive terminal harness is allocated to the install route.",
    },
  ],
});

const writeManifest = (directory: string, manifest: Readonly<Record<string, unknown>>): void => {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${String(manifest["type"])}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
};

const writeSkill = (directory: string, name: string, owner = "@acme"): void => {
  writeManifest(directory, {
    owner,
    type: "skill",
    name,
    version: "1.0.0",
    description: `The ${name} skill.`,
  });
  fs.mkdirSync(path.join(directory, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "src", "SKILL.md"),
    `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n`,
  );
};

/**
 * A source that authors a Pack, the skill it brings, a skill and a rule of
 * their own, and keeps one skill it installed from another publisher.
 */
const writeSource = (root: string): string => {
  const source = path.join(root, "upstream");
  writeSkill(path.join(source, "skills", "review"), "review");
  writeSkill(path.join(source, "skills", "lint"), "lint");
  writeManifest(path.join(source, "rules", "style"), {
    owner: "@acme",
    type: "rule",
    name: "style",
    version: "1.0.0",
    description: "Guidance for style.",
  });
  fs.mkdirSync(path.join(source, "rules", "style", "src"), { recursive: true });
  fs.writeFileSync(path.join(source, "rules", "style", "src", "RULE.md"), "# style\n");
  writeManifest(path.join(source, "packs", "kit"), {
    owner: "@acme",
    type: "pack",
    name: "kit",
    version: "1.0.0",
    description: "Everything for review.",
    dependencies: { "@acme/skills/review": "^1.0.0" },
  });
  writeSkill(
    path.join(source, "agent_extensions", "registry.example", "@other", "skills", "audit"),
    "audit",
    "@other",
  );
  return source;
};

describe("Choosing what to install from a source", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-selection-")));
    projectDir = path.join(tempDir, "project");
    const userHome = path.join(tempDir, "home");
    fs.mkdirSync(projectDir);
    fs.mkdirSync(userHome);
    fs.writeFileSync(
      path.join(projectDir, "axm.json"),
      `${JSON.stringify({ owner: "@acme", agents: ["claude-code"], instructionFiles: false }, null, 2)}\n`,
    );
    process.chdir(projectDir);
    process.env["HOME"] = userHome;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** The root install as its command runs it, naming a source and nothing else. */
  const install = (source: string, screen: ReturnType<typeof makeTestScreen>) => {
    const context = makeWorkspaceLifecycleTestContext({
      screenLayer: screen.layer,
      workspaceLayer: coreWorkspaceLayer({
        scope: "project",
        projectRoot: decodeAbsolutePathSync(projectDir),
        builtInSources: cliTestBuiltInSources(),
      }),
      wsOptions: { projectRoot: projectDir },
    });
    return handleInstall({
      type: Option.none(),
      source: Option.some(source),
      selectors: {},
      all: false,
      preview: false,
      bind: [],
      bindEnv: [],
      localName: Option.none(),
      bundled: false,
    }).pipe(Effect.provideService(ReleaseAgePosture, "enforce"), Effect.provide(context.fullLayer));
  };

  const settings = (): Readonly<Record<string, unknown>> => {
    const parsed: unknown = JSON.parse(fs.readFileSync("axm.json", "utf8"));
    if (typeof parsed !== "object" || parsed === null) throw new Error("Expected settings");
    return { ...parsed };
  };

  it.effect("states what the source offers, then asks once across every type", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push({ _tag: "Pick", titles: ["kit"] });

      yield* install(writeSource(tempDir), screen);

      expect(screen.state.script.asks).toHaveLength(1);
      expect(screen.state.script.asks[0]).toMatchObject({
        _tag: "Pick",
        question: "Select extensions to install",
        label: "Extensions",
        context: "1 pack, 2 skills, 1 rule",
        min: 1,
        options: [
          { title: "kit", group: "Packs", brings: [2] },
          { title: "lint", group: "Skills" },
          { title: "review", group: "Skills" },
          { title: "style", group: "Rules" },
        ],
      });
    }),
  );

  it.effect("shows what a picked Pack brings as included, and installs it through the Pack", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push({ _tag: "Pick", titles: ["kit"] });

      yield* install(writeSource(tempDir), screen);

      const views = screen.state.script.views.map((view) =>
        paintText(view, { width: 120, colors: false }),
      );
      const picked = views.find((lines) => lines.some((line) => line.includes("◉   kit")));
      expect(picked?.some((line) => line.includes("◪   review"))).toBe(true);
      expect(picked?.some((line) => line.includes("◯   lint"))).toBe(true);
      expect(picked?.at(-1)).toContain("1 of 4 selected · 1 included");
      expect(picked?.at(-1)).toContain("enter install 2");

      expect(settings()["packs"]).toMatchObject({ kit: expect.anything() });
      // The Pack brought its member; nobody picked it in its own right.
      expect(settings()["skills"]).toBeUndefined();
      expect(fs.readFileSync("axm-lock.yaml", "utf8")).toContain("review");
    }),
  );

  it.effect("changes nothing when the question is cancelled", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push({ _tag: "Cancel" });
      const before = fs.readFileSync("axm.json", "utf8");

      const failure = yield* install(writeSource(tempDir), screen).pipe(Effect.flip);

      expect(failure).toMatchObject({ _tag: "InstallSelectionCancelled" });
      expect(fs.readFileSync("axm.json", "utf8")).toBe(before);
      expect(fs.existsSync("axm-lock.yaml")).toBe(false);
      expect(fs.existsSync("agent_extensions")).toBe(false);
    }),
  );
});
