import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  type FileSystemRecording,
} from "@agentxm/test-support";
import { planBundledAxmSkillInstall } from "@agentxm/extension-kinds/skills";
import { OperationRefused, StepFailure } from "@agentxm/workspace-kernel/operations";

import { makeLifecycleFixture, type LifecycleFixtureOptions } from "../testing.js";

// Catalog agents whose primary project Skill location is `.agents/skills`.
const SHARED_AGENTS = ["codex", "gemini-cli", "zed"];

// Calls the install transaction makes on `.agents/skills/axm` after its
// readiness: the ensure-time inspection and the write of the bundled skill.
// Linking the skill decides from the link entry it has just resolved, so it no
// longer inspects that absent entry a second time.
const IN_TRANSACTION_CALLS = 46;

/** Calls naming the bundled skill's entry under `dir`, anything inside it, or its copy receipt. */
const artifactCalls = (recording: FileSystemRecording, root: string, dir: string): number => {
  const entry = nodePath.join(root, dir, "axm");
  const receipt = nodePath.join(root, dir, ".axm.axm-copy.json");
  const names = (path: string | undefined) =>
    path !== undefined && (path === entry || path === receipt || path.startsWith(`${entry}/`));
  return recording.calls().filter((call) => names(call.path) || names(call.toPath)).length;
};

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const skillsDirectoryOverride =
  (key: string, value: string) => (original: ConfigProvider.ConfigProvider) =>
    ConfigProvider.make((path) =>
      path[0] === key ? Effect.succeed(ConfigProvider.makeValue(value)) : original.load(path),
    );

describe("Bundled AXM skill readiness", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /**
   * Plan the bundled install over a fresh workspace and count the filesystem
   * calls that name the skill under each directory spelling. With `apply`, the
   * planned step also runs and its calls are counted separately.
   */
  const observe = (options: {
    readonly agents: ReadonlyArray<string>;
    readonly spellings?: ReadonlyArray<string>;
    readonly configureConfigProvider?: LifecycleFixtureOptions["configureConfigProvider"];
    readonly arrange?: (root: string) => void;
    readonly apply?: boolean;
    readonly betweenPlanAndApply?: (root: string) => void;
  }) =>
    Effect.gen(function* () {
      const workspace = makeLifecycleFixture({
        settings: { agents: options.agents },
        configureConfigProvider: options.configureConfigProvider,
      });
      cleanups.push(workspace.cleanup);
      options.arrange?.(workspace.root);
      const spellings = options.spellings ?? [".agents/skills"];
      const recording = yield* FileSystemRecorder;
      const count = () => spellings.map((dir) => artifactCalls(recording, workspace.root, dir));

      recording.reset();
      const plan = yield* workspace.provide(planBundledAxmSkillInstall);
      const planned = count();
      const step = plan.jobs[0]?.steps[0];
      if (step === undefined) throw new Error("Expected the bundled install step");

      let applied: ReadonlyArray<number> = [];
      let applyFailure: unknown;
      if (options.apply === true) {
        if (step.readiness !== "ready") throw new Error("Expected a ready bundled install step");
        options.betweenPlanAndApply?.(workspace.root);
        recording.reset();
        const outcome = yield* workspace.provide(step.run).pipe(Effect.result);
        if (Result.isFailure(outcome)) applyFailure = outcome.failure;
        applied = count();
      }
      return {
        root: workspace.root,
        workspace,
        key: step.key,
        readiness: step.readiness,
        errorMessage: step.readiness === "error" ? step.errorMessage : undefined,
        planned,
        applied,
        applyFailure,
      };
    }).pipe(Effect.provide(recordedNodeServices));

  it.effect("inspects a skills directory shared by several agents once", () =>
    Effect.gen(function* () {
      const single = yield* observe({ agents: ["codex"] });
      const shared = yield* observe({ agents: SHARED_AGENTS });

      expect(single.readiness).toBe("ready");
      expect(shared.readiness).toBe("ready");
      expect(single.planned[0]).toBeGreaterThan(0);
      // Three agents resolving the same directory spelling do one agent's work.
      expect(shared.planned).toEqual(single.planned);
    }),
  );

  it.effect("keeps the install's own inspection of each distinct directory", () =>
    Effect.gen(function* () {
      const single = yield* observe({ agents: ["codex"], apply: true });
      const shared = yield* observe({ agents: SHARED_AGENTS, apply: true });

      expect(single.applyFailure).toBeUndefined();
      expect(shared.applyFailure).toBeUndefined();
      // The install repeats one whole readiness inspection of its own, then
      // re-inspects and writes each distinct directory inside its transaction;
      // only the readiness repeats go away.
      expect(single.applied).toEqual([(single.planned[0] ?? 0) + IN_TRANSACTION_CALLS]);
      expect(shared.applied).toEqual(single.applied);
      expect(shared.workspace.exists(".agents/skills/axm/SKILL.md")).toBe(true);
    }),
  );

  it.effect("refuses at install an unowned artifact that appeared after planning", () =>
    Effect.gen(function* () {
      const shared = yield* observe({
        agents: SHARED_AGENTS,
        apply: true,
        betweenPlanAndApply: (root) => {
          fs.mkdirSync(nodePath.join(root, ".agents/skills/axm"), { recursive: true });
          fs.writeFileSync(nodePath.join(root, ".agents/skills/axm/SKILL.md"), "# mine\n");
        },
      });

      // The install's own readiness observes the live directory, not the plan's.
      const failure = shared.applyFailure;
      expect(failure).toBeInstanceOf(StepFailure);
      const refusal = failure instanceof StepFailure ? failure.cause : undefined;
      expect(refusal).toBeInstanceOf(OperationRefused);
      expect(refusal).toMatchObject({
        category: "conflict",
        detail: `Preserved unowned skill artifact at ${nodePath.join(shared.root, ".agents/skills/axm")}`,
        recover: "Preserve the conflicting artifact and inspect workspace ownership",
      });
      expect(shared.workspace.readFile(".agents/skills/axm/SKILL.md")).toBe("# mine\n");
    }),
  );

  it.effect("inspects every spelling of one physical directory separately", () =>
    Effect.gen(function* () {
      const single = yield* observe({ agents: ["codex"] });
      const aliased = yield* observe({
        agents: ["codex", "gemini-cli"],
        spellings: [".agents/skills", "alias-skills"],
        configureConfigProvider: skillsDirectoryOverride(
          "AXM_GEMINI_CLI_SKILLS_DIR",
          "alias-skills",
        ),
        arrange: (root) => {
          fs.mkdirSync(nodePath.join(root, ".agents/skills"), { recursive: true });
          fs.symlinkSync(".agents/skills", nodePath.join(root, "alias-skills"));
        },
      });

      expect(aliased.readiness).toBe("ready");
      expect(aliased.planned[1]).toBeGreaterThan(0);
      // The alias resolves to the shared directory, so its inspection names
      // both spellings; together they are two whole inspections.
      expect((aliased.planned[0] ?? 0) + (aliased.planned[1] ?? 0)).toBe(
        2 * (single.planned[0] ?? 0),
      );
    }),
  );

  it.effect("reports a dangling shared skills directory as one agent would", () =>
    Effect.gen(function* () {
      const danglingSkillsDirectory = (root: string) => {
        fs.mkdirSync(nodePath.join(root, ".agents"), { recursive: true });
        fs.symlinkSync("missing", nodePath.join(root, ".agents/skills"));
      };
      const single = yield* observe({ agents: ["codex"], arrange: danglingSkillsDirectory });
      const shared = yield* observe({ agents: SHARED_AGENTS, arrange: danglingSkillsDirectory });

      expect(shared.key).toBe("bundled-axm-skill-native-artifact");
      expect(shared.readiness).toBe("error");
      expect({ key: shared.key, errorMessage: shared.errorMessage }).toEqual({
        key: single.key,
        errorMessage: single.errorMessage,
      });
    }),
  );

  it.effect("preserves an unowned artifact in a shared skills directory", () =>
    Effect.gen(function* () {
      const unownedArtifact = (root: string) => {
        fs.mkdirSync(nodePath.join(root, ".agents/skills/axm"), { recursive: true });
        fs.writeFileSync(nodePath.join(root, ".agents/skills/axm/SKILL.md"), "# mine\n");
      };
      const shared = yield* observe({ agents: SHARED_AGENTS, arrange: unownedArtifact });

      expect(shared.key).toBe("bundled-axm-skill-native-artifact");
      expect(shared.errorMessage).toBe(
        `Preserved unowned skill artifact at ${nodePath.join(shared.root, ".agents/skills/axm")}`,
      );
      expect(shared.workspace.readFile(".agents/skills/axm/SKILL.md")).toBe("# mine\n");
    }),
  );

  it.effect("inspects nothing when no agent is configured", () =>
    Effect.gen(function* () {
      const none = yield* observe({ agents: [] });

      expect(none.readiness).toBe("ready");
      expect(none.planned).toEqual([0]);
    }),
  );
});
