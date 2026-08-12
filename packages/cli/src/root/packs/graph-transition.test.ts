import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import type { JobStepResult, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

import { makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { buildAtomicPackGraphStep } from "./graph-transition.js";

describe("atomic pack graph transition", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-graph-transition-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("rolls back the complete graph when every possible member position fails", () => {
    const { provide } = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });

    return provide(
      Effect.gen(function* () {
        const ws = yield* WorkspaceMutations;
        const targets = ["pack", "skill", "command"].map((name) =>
          path.join(tempDir, ".axm", "extensions", name, "content.txt"),
        );

        for (const failAt of targets.keys()) {
          for (const target of targets) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, "before\n");
          }

          const childSteps: ReadonlyArray<PlannedJobStep> = targets.map((target, index) => ({
            readiness: "ready",
            label: `member-${String(index)}`,
            run: ws.runTransaction({
              targets: [target],
              transition: Effect.sync(() => {
                fs.writeFileSync(target, `after-${String(index)}\n`);
                return index === failAt
                  ? ({
                      result: "error",
                      message: `injected failure at ${String(index)}`,
                      error: makeAppError({
                        code: "internal",
                        detail: `injected failure at ${String(index)}`,
                      }),
                    } satisfies JobStepResult)
                  : ({
                      result: "success",
                      message: `updated member ${String(index)}`,
                    } satisfies JobStepResult);
              }),
              validate: () => Effect.void,
            }),
          }));
          const graphStep = yield* buildAtomicPackGraphStep({
            label: "@test/packs/atomic",
            message: "updated atomic pack graph",
            artifact: {
              path: "pack graph",
              scope: "project",
              change: "updated",
            },
            children: childSteps.map((step) => ({ step, coverage: "ineligible" as const })),
            validate: Effect.void,
          });
          if (graphStep.readiness === "error") {
            return yield* makeAppError({
              code: "internal",
              detail: graphStep.errorMessage,
            });
          }

          const error = yield* Effect.flip(graphStep.run);
          expect(error.detail).toBe(`injected failure at ${String(failAt)}`);
          for (const target of targets) {
            expect(fs.readFileSync(target, "utf8")).toBe("before\n");
          }
        }
      }),
    );
  });

  it.effect("runs the destructive precondition before every child step", () => {
    const { provide } = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });

    return provide(
      Effect.gen(function* () {
        let childRan = false;
        const graphStep = yield* buildAtomicPackGraphStep({
          label: "@test/packs/preconditioned",
          message: "updated preconditioned pack graph",
          artifact: {
            path: "pack graph",
            scope: "project",
            change: "updated",
          },
          children: [
            {
              coverage: "ineligible",
              step: {
                readiness: "ready",
                label: "child",
                run: Effect.sync(() => {
                  childRan = true;
                  return {
                    result: "success",
                    message: "child ran",
                  } satisfies JobStepResult;
                }),
              },
            },
          ],
          preTransition: Effect.fail(
            makeAppError({
              code: "conflict",
              detail: "selected pack changed",
            }),
          ),
          validate: Effect.void,
        });
        if (graphStep.readiness === "error") {
          return yield* makeAppError({
            code: "internal",
            detail: graphStep.errorMessage,
          });
        }

        const error = yield* Effect.flip(graphStep.run);
        expect(error.code).toBe("conflict");
        expect(childRan).toBe(false);
      }),
    );
  });

  it.effect("publishes the deterministic union from successful eligible install leaves", () => {
    const { provide } = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });

    return provide(
      Effect.gen(function* () {
        const graphStep = yield* buildAtomicPackGraphStep({
          label: "@test/packs/covered",
          message: "installed covered pack",
          artifact: {
            path: "pack graph",
            scope: "project",
            change: "updated",
            fileCount: 1,
            targets: [{ path: ".axm/extensions/@test/packs/covered", change: "created" }],
          },
          children: [
            {
              coverage: "eligible",
              step: {
                readiness: "ready",
                label: "skill:a",
                run: Effect.succeed({
                  result: "success",
                  message: "installed skill a",
                  artifact: {
                    path: ".agents/skills/a",
                    scope: "project",
                    change: "created",
                    agents: ["codex", "universal", "claude-code"],
                  },
                }),
              },
            },
            {
              coverage: "eligible",
              step: {
                readiness: "ready",
                label: "hook:b",
                run: Effect.succeed({
                  result: "success",
                  message: "installed hook b",
                  artifact: {
                    path: ".claude/settings.json",
                    scope: "project",
                    change: "updated",
                    agents: ["claude-code", "cursor"],
                  },
                }),
              },
            },
            {
              coverage: "ineligible",
              step: {
                readiness: "ready",
                label: "knowledge:c",
                run: Effect.succeed({
                  result: "success",
                  message: "installed knowledge c",
                  artifact: {
                    path: ".axm/extensions/@test/knowledge/c",
                    scope: "project",
                    change: "created",
                    agents: ["ignored-agent"],
                  },
                }),
              },
            },
          ],
          validate: Effect.void,
        });
        if (graphStep.readiness === "error") {
          return yield* makeAppError({ code: "internal", detail: graphStep.errorMessage });
        }

        const result = yield* graphStep.run;
        expect(result).toMatchObject({
          result: "success",
          artifact: {
            path: "pack graph",
            scope: "project",
            agents: ["codex", "claude-code", "cursor"],
            fileCount: 1,
            targets: [{ path: ".axm/extensions/@test/packs/covered", change: "created" }],
          },
        });
      }),
    );
  });

  it.effect("publishes applicable empty coverage only for eligible applicable leaves", () => {
    const { provide } = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });

    return provide(
      Effect.gen(function* () {
        const graphStep = yield* buildAtomicPackGraphStep({
          label: "@test/packs/empty",
          message: "installed empty pack",
          artifact: { path: "pack graph", scope: "project", change: "updated" },
          children: [
            {
              coverage: "eligible",
              step: {
                readiness: "ready",
                label: "skill:empty",
                run: Effect.succeed({
                  result: "success",
                  message: "installed skill",
                  artifact: {
                    path: ".axm/extensions/@test/skills/empty",
                    scope: "project",
                    change: "created",
                    agents: [],
                  },
                }),
              },
            },
          ],
          validate: Effect.void,
        });
        if (graphStep.readiness === "error") {
          return yield* makeAppError({ code: "internal", detail: graphStep.errorMessage });
        }

        expect(yield* graphStep.run).toMatchObject({
          result: "success",
          artifact: { agents: [] },
        });
      }),
    );
  });

  it.effect("rolls back when an eligible leaf reports coverage from another scope", () => {
    const { provide } = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });

    return provide(
      Effect.gen(function* () {
        const target = path.join(tempDir, "coverage-scope.txt");
        fs.writeFileSync(target, "before\n");
        const ws = yield* WorkspaceMutations;
        const graphStep = yield* buildAtomicPackGraphStep({
          label: "@test/packs/mixed-scope",
          message: "installed mixed-scope pack",
          artifact: { path: "pack graph", scope: "project", change: "updated" },
          children: [
            {
              coverage: "eligible",
              step: {
                readiness: "ready",
                label: "skill:user",
                run: ws.runTransaction({
                  targets: [target],
                  transition: Effect.sync(() => {
                    fs.writeFileSync(target, "after\n");
                    return {
                      result: "success",
                      message: "installed user skill",
                      artifact: {
                        path: ".agents/skills/user-skill",
                        scope: "user",
                        change: "created",
                        agents: ["codex"],
                      },
                    } satisfies JobStepResult;
                  }),
                  validate: () => Effect.void,
                }),
              },
            },
          ],
          validate: Effect.void,
        });
        if (graphStep.readiness === "error") {
          return yield* makeAppError({ code: "internal", detail: graphStep.errorMessage });
        }

        const error = yield* Effect.flip(graphStep.run);
        expect(error.detail).toBe("Pack coverage spans project and user scopes");
        expect(fs.readFileSync(target, "utf8")).toBe("before\n");
      }),
    );
  });
});
