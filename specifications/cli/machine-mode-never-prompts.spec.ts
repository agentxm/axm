import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { SetupDocumentSchema, handleSetup } from "axm.sh/specification-harness";

import { defineSpecification } from "../support/contract.js";
import { makeSetupSpecContext } from "../support/setup-harness.js";

export const specification = defineSpecification({
  requirement: "cli/machine-mode-never-prompts",
  title: "Machine output mode terminates deterministically instead of prompting",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["example"],
});

const decodeDocument = Schema.decodeUnknownEffect(SetupDocumentSchema);

describe("Machine mode never prompts", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "a setup that needs interactive input reports approval required without raising any prompt",
    () =>
      Effect.gen(function* () {
        // The session itself is interactive-capable: only machine output mode
        // may force the deterministic termination.
        const context = makeSetupSpecContext({
          machine: true,
          flags: { nonInteractive: false, json: true },
        });
        cleanups.push(context.cleanup);

        const exit = yield* handleSetup({ scope: "project", scopeExplicit: true }).pipe(
          Effect.provide(context.layer),
          Effect.exit,
        );

        expect(Exit.isFailure(exit)).toBe(true);
        expect(context.promptState.selectAgentsCalls).toEqual([]);
        expect(context.promptState.confirmSetupPlanCalls).toEqual([]);
        expect(context.promptState.confirmInstructionSyncCalls).toEqual([]);
        expect(context.promptState.selectInstructionSourceCalls).toEqual([]);

        const entry = context.rendererState.results.at(-1);
        expect(entry?.ok).toBe(false);
        const document = yield* decodeDocument(entry?.data);
        expect(document.result.status).toBe("approval-required");
        expect(document.result.outcome).toBe("failed");
        expect(document.result.changed).toBe(false);

        expect(context.exists("axm.json")).toBe(false);
        expect(context.exists(".axm")).toBe(false);
      }),
  );

  it.effect("the same request prompts and honors the answer when machine output is off", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({
        machine: false,
        flags: { nonInteractive: false, json: false },
        interaction: { selectAgents: [], confirmSetupPlan: false },
      });
      cleanups.push(context.cleanup);

      yield* handleSetup({ scope: "project", scopeExplicit: true }).pipe(
        Effect.provide(context.layer),
      );

      expect(context.promptState.confirmSetupPlanCalls.length).toBeGreaterThanOrEqual(1);
      expect(context.exists("axm.json")).toBe(false);
      expect(context.exists(".axm")).toBe(false);
    }),
  );
});
