import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import type { CodingAgentRepositoryService } from "@agentxm/workspace-kernel/projection";
import { codingAgentForId } from "@agentxm/workspace-kernel/agent-adapters";
import type { WorkspaceStateOptions } from "@agentxm/workspace-kernel/workspace-state";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import {
  makeWorkspaceLifecycleTestContext,
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  planResultUnits,
  property,
} from "../../test-support/test-helpers.js";
import { handleAgentsRemove } from "./remove.js";

const writeWorkspace = (
  axmDir: string,
  options: {
    readonly agents: ReadonlyArray<string>;
    readonly lockfile: string;
    /** Skill declarations written into settings, keyed by name. */
    readonly skills?: Readonly<Record<string, unknown>>;
  },
) => {
  const projectRoot = path.dirname(axmDir);
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "axm.json"),
    JSON.stringify(
      {
        owner: "@acme",
        agents: options.agents,
        ...(options.skills === undefined ? {} : { skills: options.skills }),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(projectRoot, "axm-lock.yaml"), options.lockfile);
};

/** A workspace-authored skill the desired graph can resolve. */
const writeAuthoredSkill = (projectRoot: string, name: string) => {
  const skillDir = path.join(projectRoot, "skills", name);
  fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "skill.json"),
    `${JSON.stringify(
      { owner: "@acme", type: "skill", name, version: "1.0.0", description: `The ${name} skill.` },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(skillDir, "src", "SKILL.md"),
    `---\nname: ${name}\ndescription: The ${name} skill.\n---\n\n# ${name}\n`,
  );
  return path.join(skillDir, "src");
};

/** Realize a skill into an agent directory the way the product does. */
const linkSkill = (
  projectRoot: string,
  agentSkillsDir: string,
  name: string,
  sourceDir: string,
) => {
  const skillsDir = path.join(projectRoot, agentSkillsDir);
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.symlinkSync(path.relative(skillsDir, sourceDir), path.join(skillsDir, name));
};

/** The one cleanup step every removal of managed outputs plans, as the kernel labels it. */
const CLEANUP_LABEL = "stale managed agent projections";

describe("agents remove.handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-remove-handler-test-"));
    homeDir = path.join(tempDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });
    process.chdir(tempDir);
    process.env["HOME"] = homeDir;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: {
    readonly wsOverrides?: Partial<WorkspaceStateOptions>;
    readonly machine?: boolean;
    /** The agents the catalog knows; `opencode` alone unless stated. */
    readonly agents?: ReadonlyArray<MaterializationTargetId>;
  }) => {
    const opencode = codingAgentForId("opencode");
    const agents = (opts?.agents ?? ["opencode"]).map((id) => codingAgentForId(id));
    // The repository never reports the membership a removal leaves behind:
    // a cleanup that consulted it instead of the settled candidate would
    // treat every agent's outputs as residue.
    const agentRepo: CodingAgentRepositoryService = {
      get: (id) => Effect.succeed(agents.find((agent) => agent.id === id) ?? opencode),
      all: Effect.succeed(agents),
      getConfiguredAgents: () => Effect.succeed([]),
      getMaterializationAgents: () => Effect.succeed([]),
      getUnknownConfiguredAgentIds: () => Effect.succeed([]),
    };
    return makeWorkspaceLifecycleTestContext({
      machine: opts?.machine,
      codingAgentRepository: agentRepo,
      wsOptions: {
        scope: "project",
        ...opts?.wsOverrides,
        projectRoot: opts?.wsOverrides?.projectRoot ?? tempDir,
      },
    });
  };

  it.effect("previews removal when the lockfile needs reconciliation", () => {
    const { provide, rendererState } = makeLayers();
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 9\nskills: {}\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          force: false,
          preview: true,
        });

        expect(
          rendererState.logs.some(
            (entry) => entry._tag === "success" && entry.message.includes("Done"),
          ),
        ).toBe(false);
      }),
    );
  });

  it.effect("emits previewed plan JSON in machine mode", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 9\nskills: {}\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          force: false,
          preview: true,
        });

        // Nothing of the departing agent's is on disk, so no cleanup step is
        // planned: the plan holds only the membership change.
        const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          totalSteps: 1,
        });
        expect(result).toMatchObject({
          units: [{ label: "Remove opencode", state: "ready" }],
        });
      }),
    );
  });

  it.effect("emits applied plan JSON in machine mode", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 9\nskills: {}\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          force: false,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          totalSteps: 1,
          appliedCount: 1,
        });
        expect(result).toMatchObject({
          units: [
            {
              label: "Remove opencode",
              state: "committed",
              message: "Removed opencode",
              artifact: {
                path: "axm.json",
                scope: "project",
                agents: ["opencode"],
                change: "updated",
                fileCount: 1,
              },
            },
          ],
        });
      }),
    );
  });

  it.effect("reports a departing agent's outputs as the one projection cleanup step", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 9\nskills: {}\n",
      skills: { axm: "workspace" },
    });
    const sourceDir = writeAuthoredSkill(tempDir, "axm");
    linkSkill(tempDir, path.join(".opencode", "skills"), "axm", sourceDir);
    const removedPath = path.join(tempDir, ".opencode", "skills", "axm");

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          force: false,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          totalSteps: 2,
        });
        const units = planResultUnits(result);
        const cleanup = units.find((unit) => property(unit, "label") === CLEANUP_LABEL);
        // The same step `sync` and `uninstall` plan: the kernel's label,
        // message, and absolute target path.
        expect(cleanup).toMatchObject({
          label: CLEANUP_LABEL,
          state: "committed",
          message: "Removed 1 stale managed agent projection",
          artifact: { path: removedPath, scope: "project", change: "removed", fileCount: 1 },
        });
        expect(property(cleanup, "artifact")).not.toHaveProperty("agents");
        expect(units).toContainEqual(
          expect.objectContaining({ label: "Remove opencode", state: "committed" }),
        );
      }),
    );
  });

  it.effect("cleans up against the membership left after removal, not the catalog", () => {
    const { provide, rendererState } = makeLayers({
      machine: true,
      agents: ["claude-code", "opencode"],
    });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["claude-code", "opencode"],
      lockfile: "lockfileVersion: 9\nskills: {}\n",
      skills: { "code-review": { source: "workspace", enabled: true } },
    });
    const sourceDir = writeAuthoredSkill(tempDir, "code-review");
    linkSkill(tempDir, path.join(".claude", "skills"), "code-review", sourceDir);
    linkSkill(tempDir, path.join(".opencode", "skills"), "code-review", sourceDir);
    const remaining = path.join(tempDir, ".claude", "skills", "code-review");
    const departing = path.join(tempDir, ".opencode", "skills", "code-review");

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          force: false,
          preview: false,
        });

        // The catalog reports no materialization agents at all; had the
        // cleanup consulted it, the remaining agent's output would be gone.
        expect(fs.existsSync(departing)).toBe(false);
        expect(fs.existsSync(remaining)).toBe(true);
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          totalSteps: 2,
        });
        expect(
          planResultUnits(result).find((unit) => property(unit, "label") === CLEANUP_LABEL),
        ).toMatchObject({ artifact: { path: departing, change: "removed", fileCount: 1 } });
      }),
    );
  });

  it.effect("emits no-op JSON when all requested agents are already absent", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["claude-code"],
      lockfile: "lockfileVersion: 9\nskills: {}\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          force: false,
          preview: false,
        });

        const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          message: "All requested agents are already absent",
        });
        expect(result).toMatchObject({
          planDescription: "Remove opencode and clean up managed artifacts",
        });
      }),
    );
  });
});
