/**
 * Unit tests for displayPlan.
 *
 * displayPlan renders planning-time orientation only: the preview block in
 * preview mode, and the pre-confirmation block in apply mode when the
 * candidate carries confirmable risk. Executed outcomes render from the
 * `OperationResolution` at the emit boundary, not here.
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
import { displayPlan } from "./display-plan.js";
import type { OperationPresentation, Plan } from "../plan/plan.js";

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

const installSkillPresentation: OperationPresentation = {
  verb: { imperative: "install", past: "Installed", gerund: "Installing" },
  subject: { singular: "skill", plural: "skills" },
};

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

  it.effect("renders the preview heading from the plan's presentation vocabulary", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            name: "Install skills",
            presentation: installSkillPresentation,
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

        expect(logsByTag(state).info[0]).toBe("Would install 1 skill");
      }),
    ),
  );

  it.effect("quiet preview renders only the would-do outcome heading", () =>
    withOutput(
      (state) =>
        Effect.gen(function* () {
          yield* displayPlan(
            makePlan({
              name: "Publish skill",
              description: Option.some('Publish @acme/skills/review to registry "default"'),
              presentation: {
                verb: { imperative: "publish", past: "Published", gerund: "Publishing" },
                subject: { singular: "skill", plural: "skills" },
              },
              jobs: [
                {
                  concurrency: "unbounded",
                  steps: [
                    {
                      readiness: "ready",
                      label: "Publish @acme/skills/review",
                      run: Effect.succeed({ result: "success", message: "ok" }),
                    },
                  ],
                },
              ],
            }),
          );

          expect(logsByTag(state).info).toEqual([]);
          expect(logsByTag(state).success).toEqual(["Would publish 1 skill"]);
          expect(logsByTag(state).message).toEqual([]);
        }),
      { quiet: true },
    ),
  );

  it.effect("quiet preview keeps risk-condition warnings with the one-line heading", () =>
    withOutput(
      (state) =>
        Effect.gen(function* () {
          yield* displayPlan(
            makePlan({
              name: "Install skills",
              description: Option.some("Install code-review from the registry"),
              presentation: installSkillPresentation,
              riskConditions: [
                {
                  level: "confirmable",
                  id: "replace-unmanaged-target",
                  detail: "Replace an unmanaged target",
                },
              ],
              jobs: [
                {
                  concurrency: "unbounded",
                  steps: [
                    {
                      readiness: "ready",
                      label: "code-review",
                      run: Effect.succeed({ result: "success", message: "ok" }),
                    },
                  ],
                },
              ],
            }),
          );

          expect(logsByTag(state).success).toEqual(["Would install 1 skill"]);
          expect(logsByTag(state).warn).toEqual(["Replace an unmanaged target"]);
          expect(logsByTag(state).info).toEqual([]);
          expect(logsByTag(state).message).toEqual([]);
        }),
      { quiet: true },
    ),
  );

  it.effect("falls back to apply/changes wording when the plan declares no presentation", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            name: "Add MCP server",
            description: Option.some("Configure demo and sync agent MCP configs"),
            jobs: [
              {
                concurrency: 1,
                steps: [
                  {
                    readiness: "ready",
                    label: "Configure demo",
                    run: Effect.succeed({ result: "success", message: "Configured demo" }),
                  },
                  {
                    readiness: "ready",
                    label: "Sync demo to configured agents",
                    run: Effect.succeed({
                      result: "success",
                      message: "Synced demo to 1 agent",
                    }),
                  },
                ],
              },
            ],
          }),
        );

        expect(logsByTag(state).info[0]).toContain("Would apply 2 changes");
        expect(logsByTag(state).info[0]).not.toContain("MCP servers");
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

  it.effect("renders every destructive target in the unapplied plan", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            name: "Uninstall skill",
            jobs: [
              {
                concurrency: 1,
                steps: [
                  {
                    readiness: "ready",
                    label: "code-review",
                    artifact: {
                      path: "axm-lock.yaml",
                      scope: "project",
                      change: "removed",
                      targets: [
                        { path: "axm-lock.yaml", change: "updated" },
                        { path: ".agents/skills/code-review", change: "removed" },
                        {
                          path: "agent_extensions/github/acme/extensions/skills/code-review",
                          change: "removed",
                        },
                      ],
                    },
                    run: Effect.succeed({ result: "success", message: "removed" }),
                  },
                ],
              },
            ],
          }),
        );

        expect(logsByTag(state).message).toEqual(
          expect.arrayContaining([
            "    updated: axm-lock.yaml",
            "    removed: .agents/skills/code-review",
            "    removed: agent_extensions/github/acme/extensions/skills/code-review",
          ]),
        );
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

  it.effect("C-23: apply mode with confirmable risk states readiness without preview wording", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            name: "Install skills",
            presentation: installSkillPresentation,
            riskConditions: [
              {
                level: "confirmable",
                id: "replace-unmanaged-target",
                detail: "Replace an unmanaged target",
              },
            ],
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "code-review",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
          { mode: "apply" },
        );

        expect(logsByTag(state).info[0]).toBe("Ready to install 1 skill");
        expect(logsByTag(state).warn).toEqual(["Replace an unmanaged target"]);
        const rendered = state.logs.map((entry) => entry.message).join("\n");
        expect(rendered).not.toContain("Would");
        expect(rendered).not.toContain("to apply");
      }),
    ),
  );

  it.effect("apply mode without confirmable risk renders nothing", () =>
    withOutput((state) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            name: "Install skills",
            presentation: installSkillPresentation,
            riskConditions: [
              {
                level: "override-required",
                id: "installed-dependents",
                policy: "accept-warnings",
                requiredFlag: "--accept-warnings",
                detail: "The plan has unresolved warnings",
              },
            ],
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "code-review",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
          { mode: "apply" },
        );

        expect(state.logs).toEqual([]);
      }),
    ),
  );
});
