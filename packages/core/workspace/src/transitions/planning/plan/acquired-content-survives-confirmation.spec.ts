import * as nodeFs from "node:fs";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { defineSpecification } from "@agentxm/specification-metadata";

import { SourceNotResolvable } from "../../../resolution/sources/errors.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../../../resolution/sources/service.js";
import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";
import { deriveOperationOutcome } from "./operation-resolution.js";
import type { Plan } from "./plan.js";
import { promptablePlanExecution } from "./plan-execution-fixtures.js";
import { prepareExecutionCandidate, resolveExecutionCandidate } from "./resolve-plan.js";

export const specification = defineSpecification({
  requirement: "workspace/acquired-content-survives-confirmation",
  title: "Verified source content stays scoped across delayed confirmation",
  statement:
    "For an apply candidate requiring confirmation, AXM shall acquire its selected source content before prompting, retain that exact content while confirmation is pending, and release the temporary source tree on refusal without applying or reacquiring it.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "A controlled source provider and delayed confirmation port expose the temporary tree's lifetime, acquisition count, and absence of workspace mutation.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Acquired content through confirmation", () => {
  it.effect("retains one source through the prompt and cleans it after refusal", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* makeSpecWorkspace("axm-acquired-confirmation-");
      const entered = yield* Deferred.make<void>();
      const answer = yield* Deferred.make<"declined">();
      const name = decodeExtensionNameSync("review");
      const ref: SkillExtensionRef = {
        type: "skill",
        refType: "local",
        name,
        skill: { name, description: Option.none(), metadata: Option.none() },
        source: { type: "local", path: workspace.root },
        location: `file://${workspace.root}`,
      };
      let acquisitions = 0;
      let scratch = "";
      let applied = false;
      const sources = {
        find: () => Effect.die(new Error("unexpected source discovery")),
        resolveNamedRegistry: () => Effect.die(new Error("unexpected registry resolution")),
        fetch: () => Effect.die(new Error("unexpected source fetch")),
        acquireForTransition: () =>
          Effect.gen(function* () {
            acquisitions += 1;
            scratch = yield* fs
              .makeTempDirectoryScoped({ prefix: "axm-confirmed-source-" })
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new SourceNotResolvable({ category: "network", detail: "scratch", cause }),
                ),
              );
            return { directory: scratch };
          }),
        cloneUrl: () => Option.none(),
        origin: () => "source",
      } satisfies SourceHostProvidersService;
      const context = makeSpecContext(workspace.workspaceDir, {
        confirmationAvailable: true,
        confirmApplyChanges: () =>
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(answer))),
      });
      const plan: Plan = {
        _tag: "Plan",
        name: "Install review",
        description: Option.none(),
        riskConditions: [
          { level: "confirmable", id: "publisher-change", detail: "Publisher changed" },
        ],
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                key: "skill:review",
                label: "review",
                acquisitionRefs: [ref],
                run: Effect.sync(() => {
                  applied = true;
                  return { result: "success" as const, message: "installed" };
                }),
              },
            ],
          },
        ],
      };
      const candidate = yield* prepareExecutionCandidate(plan).pipe(Effect.provide(context.layer));
      const resolution = yield* resolveExecutionCandidate(
        candidate,
        promptablePlanExecution({ command: ["install"], arguments: [] }),
      ).pipe(
        Effect.provide(context.layer),
        Effect.provideService(SourceHostProviders, sources),
        Effect.forkChild,
      );

      yield* Deferred.await(entered);
      expect(acquisitions).toBe(1);
      expect(nodeFs.existsSync(scratch)).toBe(true);
      expect(applied).toBe(false);

      yield* Deferred.succeed(answer, "declined");
      const result = yield* Fiber.join(resolution);
      expect(deriveOperationOutcome(result)).toBe("cancelled");
      expect(acquisitions).toBe(1);
      expect(nodeFs.existsSync(scratch)).toBe(false);
      expect(applied).toBe(false);
      expect(yield* fs.readFileString(workspace.settingsPath)).toBe('{\n  "skills": {}\n}\n');
      expect(yield* fs.readFileString(workspace.lockPath)).toBe("lockfileVersion: 8\nskills: {}\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
