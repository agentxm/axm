import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  preapprovedPlanExecution,
  previewPlanExecution,
} from "@agentxm/client-core/unstable/cli-runtime";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";

import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import { writeWorkspaceFiles } from "../../../test-stubs.js";
import { toPlanResolutionResult } from "../../../json-output.js";
import { makeUninstallKnowledgeCommandWorkflowActions } from "./command-actions.js";

const sourceProvidersLayer = Layer.succeed(SourceHostProviders, {
  resolveNamedRegistry: () => Effect.die("not used"),
  find: () => Effect.succeed([]),
  fetch: () => Effect.die("not used"),
  cloneUrl: () => Option.none(),
  origin: () => "test",
});

const writeKnowledgePackage = (root: string, owner: string, name: string): void => {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "knowledge.json"),
    JSON.stringify({
      owner,
      type: "knowledge",
      name,
      version: "1.0.0",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    }),
  );
  fs.writeFileSync(
    path.join(root, "src", "index.md"),
    '---\nokf_version: "0.2"\n---\n# Knowledge\n',
  );
};

const registryLock = (owner: string, name: string) => ({
  type: "registry" as const,
  owner,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
});

const enableManagedInstructions = (axmDir: string, fileName = "AGENTS.md"): void => {
  const settingsPath = path.join(axmDir, "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({
      ...settings,
      instructionFiles: { fileName, gitignoreAliases: false },
    }),
  );
};

describe("Knowledge uninstall ownership", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-uninstall-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeActions = () => {
    const context = makeWorkspaceHandlerTestContext({ wsOptions: { projectRoot: tempDir } });
    return {
      context,
      provide: makeEffectProvide(Layer.mergeAll(context.fullLayer, sourceProvidersLayer)),
    };
  };

  it.effect("blocks canonical-only content and names the ownership-safe recovery", () => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir);
    writeKnowledgePackage(
      path.join(axmDir, "extensions", "@acme", "knowledge", "handbook"),
      "@acme",
      "handbook",
    );
    const { context, provide } = makeActions();

    return provide(
      Effect.gen(function* () {
        const actions = yield* makeUninstallKnowledgeCommandWorkflowActions;
        const parsed = yield* actions.parseArgs({ name: "handbook" });
        const intent = yield* actions.finalizeIntent(parsed);
        const plan = yield* actions.buildUninstallPlan(intent);
        expect(plan.jobs[0]?.steps[0]).toMatchObject({
          readiness: "error",
          label: "handbook",
          errorMessage: expect.stringContaining("no accepted AXM ownership"),
        });
        expect(plan.jobs[0]?.steps[0]).toMatchObject({
          errorMessage: expect.stringContaining("axm adopt <extension>"),
        });
        expect(plan.sections).toEqual([
          {
            title: "Knowledge ownership",
            items: [
              "handbook: settings absent; lock absent; accepted provenance absent; canonical unowned; rendered instructions absent; managed agent projections none",
            ],
          },
        ]);

        const preview = yield* previewOrApplyPlan(plan, { execution: previewPlanExecution });
        const apply = yield* previewOrApplyPlan(plan, { execution: preapprovedPlanExecution });
        for (const resolution of [preview, apply]) {
          expect(resolution).toMatchObject({
            _tag: "FailedPlan",
            reason: "hard-blocked",
            errorCode: "conflict",
          });
          expect(toPlanResolutionResult(resolution)).toMatchObject({
            outcome: "failed",
            steps: [
              {
                label: "handbook",
                status: "error",
                message: expect.stringContaining("unowned canonical surface"),
              },
            ],
          });
        }
        const humanOutput = [...context.logs.warn, ...context.logs.error].join("\n");
        expect(humanOutput).toContain("no accepted AXM ownership fact");
        expect(humanOutput).not.toContain(tempDir);
      }),
    );
  });

  it.effect("blocks configured external content without an accepted resolution", () => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      knowledge: { handbook: "@acme/knowledge/handbook" },
    });
    writeKnowledgePackage(
      path.join(axmDir, "extensions", "@acme", "knowledge", "handbook"),
      "@acme",
      "handbook",
    );
    const { provide } = makeActions();

    return provide(
      Effect.gen(function* () {
        const actions = yield* makeUninstallKnowledgeCommandWorkflowActions;
        const parsed = yield* actions.parseArgs({ name: "handbook" });
        const intent = yield* actions.finalizeIntent(parsed);
        const plan = yield* actions.buildUninstallPlan(intent);
        expect(plan.jobs[0]?.steps[0]).toMatchObject({
          readiness: "error",
          errorMessage: expect.stringContaining("accepted resolution is missing"),
        });
      }),
    );
  });

  it.effect("removes a lock-only accepted package", () => {
    const axmDir = path.join(tempDir, ".axm");
    const canonicalRoot = path.join(axmDir, "extensions", "@acme", "knowledge", "handbook");
    writeWorkspaceFiles(axmDir, {
      lockfileKnowledge: { handbook: registryLock("@acme", "handbook") },
    });
    writeKnowledgePackage(canonicalRoot, "@acme", "handbook");
    const { provide } = makeActions();

    return provide(
      Effect.gen(function* () {
        const actions = yield* makeUninstallKnowledgeCommandWorkflowActions;
        const parsed = yield* actions.parseArgs({ name: "handbook" });
        const intent = yield* actions.finalizeIntent(parsed);
        const plan = yield* actions.buildUninstallPlan(intent);
        const resolution = yield* previewOrApplyPlan(plan, {
          execution: preapprovedPlanExecution,
        });
        expect(resolution).toMatchObject({ _tag: "ExecutedPlan" });
        expect(fs.existsSync(canonicalRoot)).toBe(false);
        expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).not.toContain(
          "handbook",
        );
      }),
    );
  });

  it.effect("removes every owned surface for an accepted package", () => {
    const axmDir = path.join(tempDir, ".axm");
    const canonicalRoot = path.join(axmDir, "extensions", "@acme", "knowledge", "handbook");
    writeWorkspaceFiles(axmDir, {
      knowledge: { handbook: "@acme/knowledge/handbook" },
      lockfileKnowledge: { handbook: registryLock("@acme", "handbook") },
    });
    writeKnowledgePackage(canonicalRoot, "@acme", "handbook");
    enableManagedInstructions(axmDir);
    const instructionsPath = path.join(tempDir, "AGENTS.md");
    fs.writeFileSync(
      instructionsPath,
      "# Agent\n\n<!-- axm:start v=1 region=knowledge ext=@agentxm/knowledge/discovery -->\n## Knowledge Base\n\n### @acme\n\n| Bundle | Description |\n| --- | --- |\n| [handbook](.axm/extensions/@acme/knowledge/handbook/src/index.md) | — |\n<!-- axm:end v=1 region=knowledge -->\n",
    );
    const { provide } = makeActions();

    return provide(
      Effect.gen(function* () {
        const actions = yield* makeUninstallKnowledgeCommandWorkflowActions;
        const parsed = yield* actions.parseArgs({ name: "handbook" });
        const intent = yield* actions.finalizeIntent(parsed);
        const plan = yield* actions.buildUninstallPlan(intent);
        expect(plan.sections).toEqual([
          {
            title: "Knowledge ownership",
            items: [
              "handbook: settings present; lock present; accepted provenance lock; canonical owned; rendered instructions managed-present; managed agent projections none",
            ],
          },
        ]);
        const resolution = yield* previewOrApplyPlan(plan, {
          execution: preapprovedPlanExecution,
        });
        expect(resolution).toMatchObject({ _tag: "ExecutedPlan" });
        expect(fs.existsSync(canonicalRoot)).toBe(false);
        expect(fs.readFileSync(path.join(axmDir, "settings.json"), "utf8")).not.toContain(
          "handbook",
        );
        expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).not.toContain(
          "handbook",
        );
        expect(fs.readFileSync(instructionsPath, "utf8")).not.toContain("handbook");
      }),
    );
  });

  it.effect("removes only the accepted canonical package when an unowned namesake exists", () => {
    const axmDir = path.join(tempDir, ".axm");
    const ownedRoot = path.join(axmDir, "extensions", "@acme", "knowledge", "handbook");
    const unownedRoot = path.join(axmDir, "extensions", "@other", "knowledge", "handbook");
    writeWorkspaceFiles(axmDir, {
      knowledge: { handbook: "@acme/knowledge/handbook" },
      lockfileKnowledge: { handbook: registryLock("@acme", "handbook") },
    });
    writeKnowledgePackage(ownedRoot, "@acme", "handbook");
    writeKnowledgePackage(unownedRoot, "@other", "handbook");
    enableManagedInstructions(axmDir);
    fs.writeFileSync(
      path.join(tempDir, "AGENTS.md"),
      "# Agent\n\n<!-- axm:start v=1 region=knowledge ext=@agentxm/knowledge/discovery -->\n## Knowledge Base\n\n### @acme\n\n| Bundle | Description |\n| --- | --- |\n| [handbook](.axm/extensions/@acme/knowledge/handbook/src/index.md) | — |\n<!-- axm:end v=1 region=knowledge -->\n",
    );
    const { provide } = makeActions();

    return provide(
      Effect.gen(function* () {
        const actions = yield* makeUninstallKnowledgeCommandWorkflowActions;
        const parsed = yield* actions.parseArgs({ name: "handbook" });
        const intent = yield* actions.finalizeIntent(parsed);
        const plan = yield* actions.buildUninstallPlan(intent);
        const resolution = yield* previewOrApplyPlan(plan, {
          execution: preapprovedPlanExecution,
        });
        expect(resolution).toMatchObject({ _tag: "ExecutedPlan" });
        expect(fs.existsSync(ownedRoot)).toBe(false);
        expect(fs.existsSync(unownedRoot)).toBe(true);
        expect(fs.readFileSync(path.join(axmDir, "settings.json"), "utf8")).not.toContain(
          "handbook",
        );
        expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).not.toContain(
          "handbook",
        );
        expect(fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf8")).not.toContain("handbook");
      }),
    );
  });

  it.effect("rolls back canonical, settings, lock, and instructions when projection fails", () => {
    const axmDir = path.join(tempDir, ".axm");
    const targetRoot = path.join(axmDir, "extensions", "@acme", "knowledge", "handbook");
    const siblingRoot = path.join(axmDir, "extensions", "@acme", "knowledge", "sibling");
    writeWorkspaceFiles(axmDir, {
      knowledge: {
        handbook: "@acme/knowledge/handbook",
        sibling: "@acme/knowledge/sibling",
      },
      lockfileKnowledge: {
        handbook: registryLock("@acme", "handbook"),
        sibling: registryLock("@acme", "sibling"),
      },
    });
    writeKnowledgePackage(targetRoot, "@acme", "handbook");
    writeKnowledgePackage(siblingRoot, "@acme", "sibling");
    enableManagedInstructions(axmDir, "NOTES.json");
    const instructionsPath = path.join(tempDir, "NOTES.json");
    fs.writeFileSync(instructionsPath, "Original instructions\n");
    const settingsPath = path.join(axmDir, "settings.json");
    const lockPath = path.join(axmDir, "axm-lock.yaml");
    const before = {
      canonical: fs.readFileSync(path.join(targetRoot, "knowledge.json")),
      settings: fs.readFileSync(settingsPath),
      lock: fs.readFileSync(lockPath),
      instructions: fs.readFileSync(instructionsPath),
    };
    const { provide } = makeActions();

    return provide(
      Effect.gen(function* () {
        const actions = yield* makeUninstallKnowledgeCommandWorkflowActions;
        const parsed = yield* actions.parseArgs({ name: "handbook" });
        const intent = yield* actions.finalizeIntent(parsed);
        const plan = yield* actions.buildUninstallPlan(intent);
        const resolution = yield* previewOrApplyPlan(plan, {
          execution: preapprovedPlanExecution,
        });
        expect(resolution).toMatchObject({
          _tag: "FailedPlan",
          reason: "execution-failed",
        });
        expect(toPlanResolutionResult(resolution)).toMatchObject({
          outcome: "failed",
          steps: [
            {
              label: "handbook",
              status: "failed",
              message: expect.stringContaining("does not support managed regions"),
            },
          ],
        });
        expect(fs.readFileSync(path.join(targetRoot, "knowledge.json"))).toEqual(before.canonical);
        expect(fs.readFileSync(settingsPath)).toEqual(before.settings);
        expect(fs.readFileSync(lockPath)).toEqual(before.lock);
        expect(fs.readFileSync(instructionsPath)).toEqual(before.instructions);
      }),
    );
  });
});
