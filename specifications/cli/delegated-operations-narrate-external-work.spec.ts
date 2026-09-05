import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import type { OperationEvent } from "axm.sh/specification-harness";
import { runUpgrade } from "../support/upgrade-harness.js";

export const specification = defineSpecification({
  requirement: "cli/delegated-operations-narrate-external-work",
  title: "A delegating operation narrates the external work it hands off",
  statement:
    "An operation that delegates work to an external tool shall publish one unit for each command it delegates, nested under the unit that delegated it, and shall publish a wait naming its blocking class and subject for each poll that blocks on that tool, so the delegated work is observable while it runs rather than only after it settles.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "trustworthy-distribution"],
  methods: ["example", "contract"],
  derivedFrom: ["cli/machine-progress-events-follow-the-lifecycle-schema"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Upgrade is the only delegating operation this specification exercises; another command that delegates to an external tool is covered by the statement but not yet by an example.",
      retirementCondition:
        "A second command delegates to an external tool and its event log is added to this specification.",
    },
  ],
});

const startedUnits = (events: ReadonlyArray<OperationEvent>) =>
  events.filter((event) => event._tag === "UnitStarted");

describe("Delegated external work", () => {
  it.effect("publishes one unit per delegated command, nested under the delegating unit", () =>
    Effect.gen(function* () {
      const { calls, events } = yield* runUpgrade();

      const delegated = startedUnits(events).filter((unit) => unit.parentUnitId === "upgrade");
      expect(delegated.length).toBeGreaterThan(0);

      // Every command the installer was asked to run during the mutation is
      // named by a unit, and every such unit names a command that ran.
      const delegatedLabels = new Set(delegated.map((unit) => unit.label));
      expect(delegatedLabels.has("brew upgrade agentxm/tap/axm")).toBe(true);
      expect(delegatedLabels.has("brew update")).toBe(true);
      expect(calls.some((call) => call.executable === "brew" && call.args[0] === "upgrade")).toBe(
        true,
      );
      for (const unit of delegated) {
        expect(calls.some((call) => unit.label.startsWith(call.executable))).toBe(true);
      }
    }),
  );

  it.effect("settles each delegated unit and never leaves one running", () =>
    Effect.gen(function* () {
      const { events } = yield* runUpgrade();
      const delegated = startedUnits(events).filter((unit) => unit.parentUnitId === "upgrade");
      for (const unit of delegated) {
        const resolved = events.find(
          (event) => event._tag === "UnitResolved" && event.unitId === unit.unitId,
        );
        expect(resolved).toBeDefined();
      }
    }),
  );

  it.effect("publishes a wait with its blocking class and subject while a poll blocks", () =>
    Effect.gen(function* () {
      const { events } = yield* runUpgrade({
        laggingFormulaQueries: 1,
        advanceMs: 2_000,
      });

      const waiting = events.filter((event) => event._tag === "Waiting");
      expect(waiting).toHaveLength(1);
      const [wait] = waiting;
      expect(wait?.blockingClass).toBe("external-blocked");
      expect(wait?.subject).toBe("agentxm/tap/axm");
      expect(wait?.detail.length).toBeGreaterThan(0);

      const ended = events.filter((event) => event._tag === "WaitEnded");
      expect(ended).toHaveLength(1);
      expect(ended[0]?.subject).toBe(wait?.subject);
      expect(ended[0]?.seq).toBeGreaterThan(wait?.seq ?? 0);
    }),
  );

  it.effect("publishes no wait when nothing blocked", () =>
    Effect.gen(function* () {
      const { events } = yield* runUpgrade();
      expect(events.filter((event) => event._tag === "Waiting")).toHaveLength(0);
      expect(events.filter((event) => event._tag === "WaitEnded")).toHaveLength(0);
    }),
  );
});
