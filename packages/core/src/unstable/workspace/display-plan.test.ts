/**
 * Unit tests for displayPlan.
 *
 * Tests the shared plan display module that renders plan summaries via Log.
 */

import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  TestRenderer,
  type TestRendererState,
  CliRenderer,
  logsByTag,
} from "../cli-renderer/index.js";
import { type Verbosity, TestFlagsLayer } from "../cli-flags/index.js";
import { makeAppError } from "../app-error/index.js";
import { displayPlan } from "./display-plan.js";
import type { Plan, ExecutedPlan } from "../plan/plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makePlan = (overrides: Partial<Plan> = {}): Plan => ({
  _tag: "Plan",
  name: "Install skills",
  description: Option.none(),
  jobs: [],
  ...overrides,
});

const makeExecutedPlan = (overrides: Partial<ExecutedPlan> = {}): ExecutedPlan => ({
  _tag: "ExecutedPlan",
  name: "Install skills",
  description: Option.none(),
  jobs: [],
  ...overrides,
});

/** Creates a fresh renderer + Verbosity test layer and runs the effect, returning the state for inspection. */
const withOutput = <A, E>(
  fn: (state: TestRendererState) => Effect.Effect<A, E, CliRenderer | Verbosity>,
  flagsOverrides?: { verbose?: boolean; debug?: boolean; quiet?: boolean },
): Effect.Effect<A, E> => {
  const { layer, state } = TestRenderer.make();
  return fn(state).pipe(Effect.provide(Layer.mergeAll(layer, TestFlagsLayer(flagsOverrides))));
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("displayPlan", () => {
  it("keeps hand-authored status glyphs out of plan rendering", () => {
    const source = fs.readFileSync(new URL("./display-plan.ts", import.meta.url), "utf8");

    expect(source).not.toContain("\u2713");
    expect(source).not.toContain("\u2717");
    expect(source).not.toContain("\u26A0");
  });

  it.effect("uses plan name as heading", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            name: "Install skills",
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        expect(logsByTag(state).info.some((m) => m.includes("Install skills"))).toBe(true);
      }),
    ),
  );

  it.effect("shows description when present", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            description: Option.some("Install skills from github:owner/repo"),
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        expect(
          logsByTag(state).info.some((m) => m.includes("Install skills from github:owner/repo")),
        ).toBe(true);
      }),
    ),
  );

  it.effect("lists ready items with + prefix for unapplied plan", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                  {
                    readiness: "ready",
                    label: "review-pr",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        expect(logsByTag(state).success.some((m) => m.includes("+") && m.includes("commit"))).toBe(
          true,
        );
        expect(
          logsByTag(state).success.some((m) => m.includes("+") && m.includes("review-pr")),
        ).toBe(true);
      }),
    ),
  );

  it.effect("shows warn items with warning level and message", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "warn",
                    warnMessage: "version mismatch",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        expect(
          logsByTag(state).warn.some(
            (m) => m.includes("commit") && m.includes("version mismatch") && !m.includes("\u26A0"),
          ),
        ).toBe(true);
      }),
    ),
  );

  it.effect("shows error readiness items with error level and message", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "error",
                    errorMessage: "dependency missing",
                    label: "commit",
                  },
                ],
              },
            ],
          }),
        );

        expect(
          logsByTag(state).error.some(
            (m) =>
              m.includes("commit") && m.includes("dependency missing") && !m.includes("\u2717"),
          ),
        ).toBe(true);
      }),
    ),
  );

  it.effect("shows summary counts for unapplied plan", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                  {
                    readiness: "error",
                    errorMessage: "missing dep",
                    label: "review-pr",
                  },
                ],
              },
            ],
          }),
        );

        expect(
          logsByTag(state).message.some((m) => m.includes("1 to apply") && m.includes("1 error")),
        ).toBe(true);
      }),
    ),
  );

  it.effect("omits zero counts in summary", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        const summary = logsByTag(state).message.find((m) => m.includes("to apply"));
        expect(summary).toBeDefined();
        expect(summary).not.toContain("error");
        expect(summary).not.toContain("warning");
      }),
    ),
  );

  it.effect("includes warn and error counts in unapplied summary", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "a",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                  {
                    readiness: "warn",
                    warnMessage: "warn reason",
                    label: "c",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                  {
                    readiness: "error",
                    errorMessage: "error reason",
                    label: "d",
                  },
                ],
              },
            ],
          }),
        );

        const summary = logsByTag(state).message.find((m) => m.includes("to apply"));
        expect(summary).toBeDefined();
        expect(summary).toContain("1 to apply");
        expect(summary).toContain("1 error");
        expect(summary).toContain("1 warning");
      }),
    ),
  );

  it.effect("shows success detail for legacy successful applied plan by default", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "commit",
                    result: { result: "success", message: "Applied commit" },
                  },
                ],
              },
            ],
          }),
        );

        expect(logsByTag(state).success.some((m) => m.includes("commit"))).toBe(true);
        expect(logsByTag(state).message.some((m) => m.includes("1 applied"))).toBe(true);
        expect(logsByTag(state).success.some((m) => m.includes("\u2713"))).toBe(false);
      }),
    ),
  );

  it.effect("shows success step detail for applied plan in verbose mode", () =>
    withOutput(
      (state) =>
        Effect.gen(function* () {
          yield* displayPlan(
            makeExecutedPlan({
              jobs: [
                {
                  concurrency: "unbounded",
                  steps: [
                    {
                      label: "commit",
                      result: { result: "success", message: "Applied commit" },
                    },
                  ],
                },
              ],
            }),
          );

          expect(logsByTag(state).success.some((m) => m.includes("commit"))).toBe(true);
          expect(logsByTag(state).success.some((m) => m.includes("\u2713"))).toBe(false);
        }),
      { verbose: true },
    ),
  );

  it.effect("shows error items for applied plan", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "commit",
                    result: {
                      result: "error",
                      message: "failed to apply",
                      error: makeAppError({
                        code: "internal",
                        detail: "failed to apply",
                      }),
                    },
                  },
                ],
              },
            ],
          }),
        );

        expect(
          logsByTag(state).error.some(
            (m) => m.includes("commit") && m.includes("failed to apply") && !m.includes("\u2717"),
          ),
        ).toBe(true);
        expect(logsByTag(state).error.some((m) => m.includes("commit: failed to apply"))).toBe(
          true,
        );
      }),
    ),
  );

  it.effect("shows cause lines for step errors in debug mode", () =>
    withOutput(
      (state) =>
        Effect.gen(function* () {
          yield* displayPlan(
            makeExecutedPlan({
              jobs: [
                {
                  concurrency: "unbounded",
                  steps: [
                    {
                      label: "publish",
                      result: {
                        result: "error",
                        message: "failed to publish",
                        error: makeAppError({
                          code: "internal",
                          detail: "Failed to publish",
                          cause: new Error("connection refused"),
                        }),
                      },
                    },
                  ],
                },
              ],
            }),
          );

          expect(logsByTag(state).error.some((m) => m.includes("Cause: connection refused"))).toBe(
            true,
          );
        }),
      { verbose: true, debug: true },
    ),
  );

  it.effect("shows past tense summary for applied plan", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "commit",
                    result: { result: "success", message: "Applied commit" },
                  },
                  {
                    label: "review-pr",
                    result: {
                      result: "error",
                      message: "failed",
                      error: makeAppError({
                        code: "internal",
                        detail: "failed",
                      }),
                    },
                  },
                ],
              },
            ],
          }),
        );

        const summary = logsByTag(state).message.find((m) => m.includes("applied"));
        expect(summary).toBeDefined();
        expect(summary).toContain("1 applied");
        expect(summary).toContain("1 failed");
      }),
    ),
  );

  it.effect("omits zero counts in applied summary", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "commit",
                    result: { result: "success", message: "Applied commit" },
                  },
                ],
              },
            ],
          }),
        );

        const summary = logsByTag(state).message.find((m) => m.includes("applied"));
        expect(summary).toBeDefined();
        expect(summary).not.toContain("failed");
      }),
    ),
  );

  it.effect("uses _tag discriminant to distinguish Plan from ExecutedPlan", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        // An ExecutedPlan with _tag should render completed steps, not planned steps.
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "my-step",
                    result: { result: "success", message: "done" },
                  },
                ],
              },
            ],
          }),
        );

        expect(logsByTag(state).success.some((m) => m.includes("my-step"))).toBe(true);
        expect(logsByTag(state).success.some((m) => m.includes("+"))).toBe(false);
      }),
    ),
  );

  it.effect("renders single artifact blast radius and suggestions", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            name: "Install skill",
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "code-review",
                    result: {
                      result: "success",
                      message: "Applied install operation",
                      artifact: {
                        path: ".claude/skills/code-review",
                        scope: "project",
                        version: "1.2.3",
                        change: "created",
                        fileCount: 4,
                        targets: [
                          { path: ".agents/skills/code-review", change: "created" },
                          { path: ".claude/skills/code-review", change: "created" },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          }),
        );

        expect(
          logsByTag(state).success.some((m) =>
            m.includes("Installed skill code-review for 2 agents"),
          ),
        ).toBe(true);
        expect(state.summaries).toEqual(["-> 2 agent targets   1.2.3 | 4 files"]);
        expect(state.suggestions.map((suggestion) => suggestion.description)).toEqual([
          "Inspect installed skills",
          "Undo",
        ]);
      }),
    ),
  );

  it.effect("renders unchanged single artifact as already up to date", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            name: "Install skill",
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "code-review",
                    result: {
                      result: "success",
                      message: "code-review already installed",
                      artifact: {
                        path: ".claude/skills/code-review",
                        scope: "project",
                        version: "1.2.3",
                        change: "unchanged",
                        fileCount: 4,
                      },
                    },
                  },
                ],
              },
            ],
          }),
        );

        expect(logsByTag(state).success).toEqual(["Already up to date — code-review 1.2.3"]);
        expect(state.summaries).toEqual([]);
      }),
    ),
  );

  it.effect("uses clean skill names for single artifact suggestions", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            name: "Install skill",
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "cpp-conan-tinyflags-add-flag (pkg:conan/agentxm-example-tinyflags)",
                    result: {
                      result: "success",
                      message: "Installed cpp-conan-tinyflags-add-flag",
                      artifact: {
                        path: ".claude/skills/cpp-conan-tinyflags-add-flag",
                        scope: "project",
                        version: "0.1.3",
                        change: "created",
                        fileCount: 1,
                      },
                    },
                  },
                ],
              },
            ],
          }),
        );

        expect(state.suggestions).toContainEqual({
          description: "Undo",
          cmd: "axm skills uninstall cpp-conan-tinyflags-add-flag",
        });
        expect(logsByTag(state).success.join("\n")).not.toContain("pkg:");
        expect(logsByTag(state).success.join("\n")).not.toContain("(skill)");
      }),
    ),
  );

  it.effect("quiet output suppresses summaries and suggestions but keeps outcome", () =>
    withOutput(
      (state) =>
        Effect.gen(function* () {
          yield* displayPlan(
            makeExecutedPlan({
              name: "Install skill",
              jobs: [
                {
                  concurrency: "unbounded",
                  steps: [
                    {
                      label: "code-review",
                      result: {
                        result: "success",
                        message: "Applied install operation",
                        artifact: {
                          path: ".claude/skills/code-review",
                          scope: "project",
                          version: "1.2.3",
                          change: "created",
                          fileCount: 4,
                          targets: [{ path: ".claude/skills/code-review", change: "created" }],
                        },
                      },
                    },
                  ],
                },
              ],
            }),
          );

          expect(logsByTag(state).success).toEqual(["Installed skill code-review for 1 agent"]);
          expect(state.summaries).toEqual([]);
          expect(state.suggestions).toEqual([]);
        }),
      { quiet: true },
    ),
  );

  it.effect("verbose output keeps outcome and affordances plus step detail", () =>
    withOutput(
      (state) =>
        Effect.gen(function* () {
          yield* displayPlan(
            makeExecutedPlan({
              name: "Install skill",
              jobs: [
                {
                  concurrency: "unbounded",
                  steps: [
                    {
                      label: "code-review",
                      result: {
                        result: "success",
                        message: "Applied install operation",
                        artifact: {
                          path: ".claude/skills/code-review",
                          scope: "project",
                          version: "1.2.3",
                          change: "created",
                          fileCount: 4,
                          targets: [
                            { path: ".agents/skills/code-review", change: "created" },
                            { path: ".claude/skills/code-review", change: "created" },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            }),
          );

          expect(
            logsByTag(state).success.some((m) =>
              m.includes("Installed skill code-review for 2 agents"),
            ),
          ).toBe(true);
          expect(
            logsByTag(state).success.some((m) => m.includes("Applied install operation")),
          ).toBe(true);
          expect(state.summaries).toEqual([
            [
              "-> 2 agent targets   1.2.3 | 4 files",
              "   -> .agents/skills/code-review   created",
              "   -> .claude/skills/code-review   created",
            ].join("\n"),
          ]);
          expect(state.suggestions.map((suggestion) => suggestion.description)).toEqual([
            "Inspect installed skills",
            "Undo",
          ]);
        }),
      { verbose: true },
    ),
  );

  it.effect("renders plan sections after step summary", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "react-testing",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
            sections: [
              {
                title: "Compatible packages",
                items: ["react (npm)", "react-dom (npm)"],
              },
            ],
          }),
        );

        const messages = logsByTag(state).message;
        expect(messages.some((m) => m.includes("Compatible packages:"))).toBe(true);
        expect(messages.some((m) => m.includes("react (npm)"))).toBe(true);
        expect(messages.some((m) => m.includes("react-dom (npm)"))).toBe(true);
      }),
    ),
  );

  it.effect("omits sections when not provided", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "general-review",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        const messages = logsByTag(state).message;
        expect(messages.some((m) => m.includes("Compatible packages"))).toBe(false);
      }),
    ),
  );

  it.effect("omits section with empty items", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "general-review",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
            sections: [{ title: "Compatible packages", items: [] }],
          }),
        );

        const messages = logsByTag(state).message;
        expect(messages.some((m) => m.includes("Compatible packages"))).toBe(false);
      }),
    ),
  );
});
