import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { describe, expect, it } from "@effect/vitest";
import { afterAll, afterEach } from "vitest";

import {
  PlanResolutionDocumentSchema,
  getAppError,
  handleInstall,
} from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../support/contract.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { pinSpecUserHome } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/changes-do-not-interleave",
  title: "Concurrent changes to one workspace never interleave",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
});

const userHome = pinSpecUserHome();

const decodeDocument = Schema.decodeUnknownEffect(PlanResolutionDocumentSchema);

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

/** The authoritative state families one extension's change writes. */
const realization = (workspace: SpecWorkspace, name: string) => {
  const settings = workspace.readSettings();
  const skills =
    typeof settings === "object" && settings !== null && "skills" in settings
      ? settings.skills
      : undefined;
  return {
    configured: typeof skills === "object" && skills !== null && name in skills,
    locked: workspace.readLockfileText().includes(name),
    canonical: workspace.exists(`agent_extensions/local/vendor/${name}`),
    projected: workspace.exists(`.claude/skills/${name}`),
  };
};

const fullyRealized = {
  configured: true,
  locked: true,
  canonical: true,
  projected: true,
} as const;

const untouched = {
  configured: false,
  locked: false,
  canonical: false,
  projected: false,
} as const;

describe("Concurrent workspace changes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    userHome.reset();
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });
  afterAll(() => {
    userHome.cleanup();
  });

  it.effect(
    "two concurrent installs serialize or terminate without applying, never interleaving",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        const names = ["alpha", "beta"] as const;
        const sources = new Map(
          names.map((name) => [name, writeLocalSkillPackage(workspace.root, { name })]),
        );
        const install = (name: (typeof names)[number]) =>
          handleInstall({
            source: Option.fromUndefinedOr(sources.get(name)),
            yes: true,
            force: false,
            preview: false,
          }).pipe(Effect.provide(workspace.layer), Effect.exit);

        // Contention against the workspace transition hold waits on the
        // clock, so the race runs on a forked fiber while a driver fiber
        // keeps advancing the TestClock until the race settles. The driver
        // is unbounded so real filesystem latency under suite load never
        // starves the race of clock progress.
        const race = yield* Effect.forkChild(
          Effect.all([install(names[0]), install(names[1])], { concurrency: "unbounded" }),
        );
        const driver = yield* Effect.forkChild(
          Effect.forever(
            Effect.gen(function* () {
              yield* Effect.yieldNow;
              yield* TestClock.adjust("250 millis");
            }),
          ),
        );
        const [alphaExit, betaExit] = yield* Fiber.join(race);
        yield* Fiber.interrupt(driver);
        expect(alphaExit).toBeDefined();
        expect(betaExit).toBeDefined();
        if (alphaExit === undefined || betaExit === undefined) {
          return;
        }

        const documents = yield* Effect.forEach(workspace.rendererState.results, (entry) =>
          decodeDocument(entry.data),
        );
        const outcomeByName = new Map(
          documents.map((document) => {
            const [unit] = document.result.units;
            expect(unit).toBeDefined();
            const name = unit === undefined ? "" : unit.id.replace(/^skill:/, "");
            return [name, document.result.outcome] as const;
          }),
        );

        // Every concurrent change either fully applies or terminates without
        // applying anything: a rendered non-applied outcome or a typed
        // failure, in both cases leaving no partial state family behind. An
        // interleaved execution would surface here as a mixed family set.
        const applied: Array<string> = [];
        const attempts = [
          { name: names[0], exit: alphaExit },
          { name: names[1], exit: betaExit },
        ];
        for (const attempt of attempts) {
          if (attempt.exit._tag === "Success") {
            const outcome = outcomeByName.get(attempt.name);
            expect(outcome).toBeDefined();
            if (outcome === "applied") {
              applied.push(attempt.name);
              expect(realization(workspace, attempt.name)).toEqual(fullyRealized);
            } else {
              expect(outcome).toBe("blocked");
              expect(realization(workspace, attempt.name)).toEqual(untouched);
            }
          } else {
            const error = getAppError(Cause.squash(attempt.exit.cause));
            expect(error._tag).toBe("AppError");
            expect(outcomeByName.has(attempt.name)).toBe(false);
            expect(realization(workspace, attempt.name)).toEqual(untouched);
          }
        }
        expect(applied.length).toBeGreaterThanOrEqual(1);
        expect(workspace.exists(".axm/tmp")).toBe(false);

        // A change that lost the race was serialized out, not lost: rerunning
        // it applies it on top of the winner without disturbing the winner.
        workspace.rendererState.results.length = 0;
        for (const name of names) {
          if (!applied.includes(name)) {
            yield* install(name);
          }
        }
        for (const name of names) {
          expect(realization(workspace, name)).toEqual(fullyRealized);
        }
      }),
    30000,
  );
});
