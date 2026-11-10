import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";
import { recordOperationJournal } from "@agentxm/workspace-kernel/operations";
import { makeInstallPlanInvocation } from "./root/shared/confirmation-recovery.js";
import { withOperationLifecycle } from "./operation-lifecycle.js";
import { directoryFlag } from "./cli-flags/index.js";
import { CommandRoute } from "./cli-runtime/command-route.js";
import { makeSpecWorkspace } from "./test-support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/interruption-recovery-preserves-invocation",
  title: "Interruption recovery preserves the classified invocation",
  statement:
    "When an interrupted operation offers continuation, AXM shall preserve the classified invocation's arguments and scope and omit the command when any argument cannot be safely rendered.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The production lifecycle and plan-invocation helpers run under interruption with a recorded journal and screen; the journal models already-started work, not actual package installation.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("Interruption recovery", () => {
  for (const row of [
    {
      source: "./packages/review notes",
      expected:
        "axm install --directory '/work/review space' --scope user --non-interactive --yes './packages/review notes'",
    },
    { source: "https://example.test/archive.zip?token=private-value", expected: undefined },
  ]) {
    it.effect(
      row.expected === undefined
        ? "withholds a command containing a protected locator"
        : "retains source selection, quoting, explicit approval, and user scope",
      () =>
        Effect.gen(function* () {
          const workspace = makeSpecWorkspace({ scope: "user", userSettings: {} });
          cleanups.push(workspace.cleanup);
          const started = yield* Deferred.make<void>();
          const body = Effect.gen(function* () {
            yield* makeInstallPlanInvocation({ preview: false, yes: true }, [row.source]).pipe(
              Effect.provideService(directoryFlag, Option.some("/work/review space")),
            );
            yield* recordOperationJournal({
              name: "Install extensions",
              description: Option.none(),
              mode: "apply",
              atomicity: { declared: "non-rollbackable", applied: "non-rollbackable" },
              plannedUnits: [{ id: "skill:review", label: "review", state: "ready" }],
              phase: "apply",
              startedUnitIds: ["skill:review"],
              resolved: [],
              restoresOnFailure: false,
            });
            yield* Deferred.succeed(started, undefined);
            return yield* Effect.never;
          });
          const fiber = yield* withOperationLifecycle(
            { mode: "apply", planName: "Install extensions" },
            body,
          ).pipe(
            Effect.provideService(CommandRoute, ["install"]),
            workspace.provide,
            Effect.forkChild,
          );
          yield* Deferred.await(started);
          yield* Fiber.interrupt(fiber);
          expect(workspace.rendererState.suggestions).toContainEqual({
            description: "Re-run the command to continue the remaining units.",
            ...(row.expected === undefined ? {} : { cmd: row.expected }),
          });
          expect(JSON.stringify(workspace.rendererState.results)).not.toContain("private-value");
        }),
    );
  }
});
