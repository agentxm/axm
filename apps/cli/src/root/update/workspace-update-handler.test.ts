/**
 * What the configured-extension sweep reports when there is nothing to
 * resolve, and how it treats configuration the Registry does not own.
 *
 * These behaviours are the update surface's own; they belong beside the
 * feature's configured-update planner and should move there once
 * `@agentxm/workspace/lifecycle/testing` can compose a workspace fixture.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { PACK_CONSTRAINT_CONFLICT_BLOCKER_ID } from "@agentxm/workspace/lifecycle";
import {
  StepFailure,
  recoverySwitch,
  type ResolvedUnit,
} from "@agentxm/workspace/transitions/planning";

import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import {
  expectNoOpPlanResult,
  makeWorkspaceLifecycleTestContext,
  planResultUnits,
} from "../../test-support/test-helpers.js";
import { handleWorkspaceUpdate, updateSuggestions } from "./workspace-update-handler.js";

describe("workspace update handler output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-update-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("emits hooks update JSON no-op for an empty hooks configuration", () => {
    const ctx = makeWorkspaceLifecycleTestContext({ machine: true });
    const provide = Effect.provide(ctx.fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "hooks.update",
          type: Option.some("hook"),
          planName: "Update hooks",
          planDescription: Option.some("Update configured hooks packages"),
          flags: { preview: false },
        });

        const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
          planName: "Update hooks",
          message: "No configured hooks.",
        });
        expect(result).toMatchObject({
          planDescription: "Update configured hooks packages",
        });
      }),
    );
  });

  it.effect("emits knowledge update JSON no-op for an empty knowledge configuration", () => {
    const ctx = makeWorkspaceLifecycleTestContext({ machine: true });
    const provide = Effect.provide(ctx.fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "knowledge.update",
          type: Option.some("knowledge"),
          planName: "Update Knowledge",
          planDescription: Option.some("Update configured Knowledge bundles"),
          flags: { preview: false },
        });

        const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
          planName: "Update Knowledge",
          message: "No configured knowledge bundles.",
        });
        expect(result).toMatchObject({
          planDescription: "Update configured Knowledge bundles",
        });
      }),
    );
  });

  it.effect("emits MCP update JSON no-op for an empty MCP server configuration", () => {
    const ctx = makeWorkspaceLifecycleTestContext({ machine: true });
    const provide = Effect.provide(ctx.fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "mcps.update",
          type: Option.some("mcp-server"),
          planName: "Update configured MCP servers",
          planDescription: Option.some("Update configured MCP servers"),
          flags: { preview: false },
        });

        const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
          planName: "Update configured MCP servers",
          message: "No configured MCP servers.",
        });
        expect(result).toMatchObject({
          planDescription: "Update configured MCP servers",
        });
      }),
    );
  });

  it.effect("reports inline MCP servers as sync-owned without source resolution", () => {
    const ctx = makeWorkspaceLifecycleTestContext({ machine: true });
    const provide = Effect.provide(ctx.fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      mcps: {
        linear: { command: "npx", args: ["-y", "linear-mcp-server"] },
        sentry: { url: "https://mcp.sentry.dev/sse" },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "mcps.update",
          type: Option.some("mcp-server"),
          planName: "Update configured MCP servers",
          planDescription: Option.some("Update configured MCP servers"),
          flags: { preview: false },
        });

        const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
          planName: "Update configured MCP servers",
          totalSteps: 2,
        });
        expect(planResultUnits(result)).toEqual([
          expect.objectContaining({
            label: "mcps/linear",
            state: "skipped",
            message: "linear is inline workspace configuration; run axm sync to reconcile it",
          }),
          expect.objectContaining({
            label: "mcps/sentry",
            state: "skipped",
            message: "sentry is inline workspace configuration; run axm sync to reconcile it",
          }),
        ]);
      }),
    );
  });

  it.effect("keeps independent MCP planning results when one source is invalid", () => {
    const ctx = makeWorkspaceLifecycleTestContext({ machine: true });
    const provide = Effect.provide(ctx.fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      mcps: {
        linear: { command: "npx", args: ["-y", "linear-mcp-server"] },
        broken: "missing-server",
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "mcps.update",
          type: Option.some("mcp-server"),
          planName: "Update configured MCP servers",
          planDescription: Option.some("Update configured MCP servers"),
          flags: { preview: false },
        });

        expect(ctx.rendererState.results[0]?.data).toMatchObject({
          result: {
            outcome: "failed",
            counts: { total: 2, failed: 1 },
            units: expect.arrayContaining([
              expect.objectContaining({ label: "mcps/linear", state: "skipped" }),
              expect.objectContaining({
                label: "mcps/broken",
                state: "failed",
                message: expect.stringContaining('Unknown MCP server "missing-server"'),
              }),
            ]),
          },
        });
      }),
    );
  });
});

/**
 * What the sweep offers next. A constraint contradiction and a retryable
 * failure are different kinds of unsettled, and only one of them is a step to
 * repeat; neither route was covered before.
 */
describe("workspace update suggestions", () => {
  const unit = (over: Partial<ResolvedUnit<unknown>>): ResolvedUnit<unknown> => ({
    id: "packs/alpha",
    label: "@acme/packs/alpha",
    state: "failed",
    ...over,
  });

  const suggest = (
    over: Partial<Parameters<typeof updateSuggestions>[0]>,
    unsettled: ReadonlyArray<ResolvedUnit<unknown>>,
  ) =>
    updateSuggestions({
      type: Option.none(),
      recovery: {
        command: Option.match(over.type ?? Option.none(), {
          onNone: () => ["update"],
          onSome: () => ["skills", "update"],
        }),
        arguments: [recoverySwitch("--refresh", false)],
      },
      constraintRefused: false,
      ...over,
    })({ outcome: "failed", unsettled });

  it("points a constraint refusal at the declarations that disagree", () => {
    const blocked = unit({
      state: "blocked",
      blocking: {
        class: "precondition-unmet",
        subject: "@acme/packs/alpha",
        phase: "planning",
        detail: "Configured Pack constraints are unsatisfiable.",
        reference: PACK_CONSTRAINT_CONFLICT_BLOCKER_ID,
      },
    });

    expect(suggest({ constraintRefused: true }, [blocked])).toEqual([
      {
        description:
          "Review the declarations that disagree, then widen or remove the declared range, or hold the Pack at a compatible version",
        cmd: "axm packs show <pack>",
      },
      { description: "Inspect installed extensions", cmd: "axm list" },
    ]);
  });

  it("offers the narrowed update route for a failure a retry can change", () => {
    const failed = unit({
      label: "skills/triage",
      error: new StepFailure({ category: "network", detail: "Registry unreachable." }),
    });

    expect(suggest({ type: Option.some("skill") }, [failed])).toEqual([
      {
        description: "Try the extension that did not update again",
        cmd: "axm skills update --name triage",
      },
    ]);
  });

  it("offers nothing where no rerun would settle the failure", () => {
    const refused = unit({
      error: new StepFailure({ category: "forbidden", detail: "Not entitled to this Pack." }),
    });

    expect(suggest({}, [refused])).toEqual([]);
  });

  it("offers the inventory when every unit settled", () => {
    expect(suggest({}, [])).toEqual([
      { description: "Inspect installed extensions", cmd: "axm list" },
    ]);
  });
});
