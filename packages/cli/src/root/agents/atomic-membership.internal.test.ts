import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { TestFlagsLayer } from "@agentxm/extension-management/unstable/cli-flags";
import { TestRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  applyPlan,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  layer as coreWorkspaceLayer,
  protectWorkspacePath,
  WorkspaceMutations,
} from "@agentxm/extension-management/unstable/workspace";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAtomicMembershipSteps } from "./atomic-membership.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";

const writeWorkspace = (root: string, agents: ReadonlyArray<string>) => {
  writeWorkspaceFiles(path.join(root, ".axm"), { agents });
};

const readAgents = (root: string): ReadonlyArray<string> => {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(root, "axm.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("agents" in parsed)) return [];
  return Array.isArray(parsed.agents)
    ? parsed.agents.filter((agent): agent is string => typeof agent === "string")
    : [];
};

const plan = (steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Change coding agents",
  description: Option.none(),
  jobs: [{ concurrency: 1, executionPolicy: "best-effort", steps }],
});

describe("makeAtomicMembershipSteps", () => {
  it.effect("restores membership and an earlier materialized target after add failure", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-add-transaction-"));
    writeWorkspace(root, []);
    const renderer = TestRenderer.make();
    const platform = Layer.mergeAll(NodeServices.layer, renderer.layer, TestFlagsLayer());
    const workspace = Layer.provide(
      coreWorkspaceLayer({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }),
      platform,
    );

    return Effect.gen(function* () {
      const ws = yield* WorkspaceMutations;
      const effectFs = yield* FileSystem.FileSystem;
      const target = path.join(root, ".cursor", "skills", "review");
      const steps: ReadonlyArray<PlannedJobStep> = [
        {
          label: "Add cursor",
          readiness: "ready",
          run: ws.addConfiguredAgent("cursor").pipe(
            Effect.as({
              result: "success",
              message: "Configured cursor",
            } satisfies JobStepResult),
          ),
        },
        {
          label: "Materialize review skill",
          readiness: "ready",
          run: Effect.gen(function* () {
            yield* protectWorkspacePath(target);
            yield* effectFs.makeDirectory(target, { recursive: true });
            yield* effectFs.writeFileString(path.join(target, "SKILL.md"), "managed\n");
            return yield* makeAppError({
              code: "internal",
              detail: "Injected materialization failure",
            });
          }).pipe(
            Effect.mapError((cause) =>
              cause._tag === "AppError"
                ? cause
                : makeAppError({
                    code: "internal",
                    detail: "Injected materialization write failed",
                    cause,
                  }),
            ),
          ),
        },
      ];
      const atomic = yield* makeAtomicMembershipSteps({
        ws,
        steps,
        validate: () => Effect.void,
      });

      const result = yield* applyPlan(plan(atomic));

      expect(result.jobs[0]?.steps[0]).toMatchObject({
        label: "Add cursor",
        result: {
          result: "error",
          message: expect.stringContaining("rolled back"),
        },
      });
      expect(result.jobs[0]?.steps[1]).toMatchObject({
        label: "Materialize review skill",
        result: {
          result: "error",
          message: expect.stringContaining("Injected materialization failure"),
        },
      });
      expect(readAgents(root)).toEqual([]);
      expect(fs.existsSync(target)).toBe(false);
    }).pipe(
      Effect.provide(Layer.mergeAll(platform, workspace)),
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    );
  });

  it.effect("attributes a membership-step failure only to that membership step", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-membership-failure-"));
    writeWorkspace(root, []);
    const renderer = TestRenderer.make();
    const platform = Layer.mergeAll(NodeServices.layer, renderer.layer, TestFlagsLayer());
    const workspace = Layer.provide(
      coreWorkspaceLayer({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }),
      platform,
    );

    return Effect.gen(function* () {
      const ws = yield* WorkspaceMutations;
      const steps: ReadonlyArray<PlannedJobStep> = [
        {
          label: "Add cursor",
          readiness: "ready",
          run: makeAppError({
            code: "internal",
            detail: "Injected membership failure",
          }),
        },
        {
          label: "Materialize review skill",
          readiness: "ready",
          run: Effect.succeed({
            result: "success",
            message: "Materialized review",
          } satisfies JobStepResult),
        },
      ];
      const atomic = yield* makeAtomicMembershipSteps({
        ws,
        steps,
        validate: () => Effect.void,
      });

      const result = yield* applyPlan(plan(atomic));

      expect(result.jobs[0]?.steps[0]).toMatchObject({
        label: "Add cursor",
        result: {
          result: "error",
          message: expect.stringContaining("Injected membership failure"),
        },
      });
      expect(result.jobs[0]?.steps[1]).toMatchObject({
        label: "Materialize review skill",
        result: {
          result: "error",
          message: expect.stringContaining("blocked by Add cursor failure"),
        },
      });
      expect(readAgents(root)).toEqual([]);
    }).pipe(
      Effect.provide(Layer.mergeAll(platform, workspace)),
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    );
  });

  it.effect("restores removed artifacts and membership after remove failure", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-remove-transaction-"));
    writeWorkspace(root, ["cursor"]);
    const target = path.join(root, ".cursor", "commands", "review.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "managed\n");
    const renderer = TestRenderer.make();
    const platform = Layer.mergeAll(NodeServices.layer, renderer.layer, TestFlagsLayer());
    const workspace = Layer.provide(
      coreWorkspaceLayer({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }),
      platform,
    );

    return Effect.gen(function* () {
      const ws = yield* WorkspaceMutations;
      const effectFs = yield* FileSystem.FileSystem;
      const steps: ReadonlyArray<PlannedJobStep> = [
        {
          label: "Remove managed artifacts",
          readiness: "ready",
          run: protectWorkspacePath(target).pipe(
            Effect.andThen(effectFs.remove(target)),
            Effect.mapError((cause) =>
              cause._tag === "AppError"
                ? cause
                : makeAppError({
                    code: "internal",
                    detail: "Injected cleanup write failed",
                    cause,
                  }),
            ),
            Effect.as({ result: "success", message: "Removed artifact" } satisfies JobStepResult),
          ),
        },
        {
          label: "Remove cursor",
          readiness: "ready",
          run: ws.removeConfiguredAgent("cursor").pipe(
            Effect.andThen(
              makeAppError({
                code: "internal",
                detail: "Injected settings commit failure",
              }),
            ),
          ),
        },
      ];
      const atomic = yield* makeAtomicMembershipSteps({
        ws,
        steps,
        validate: () => Effect.void,
      });

      yield* applyPlan(plan(atomic));

      expect(readAgents(root)).toEqual(["cursor"]);
      expect(fs.readFileSync(target, "utf8")).toBe("managed\n");
    }).pipe(
      Effect.provide(Layer.mergeAll(platform, workspace)),
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    );
  });
});
