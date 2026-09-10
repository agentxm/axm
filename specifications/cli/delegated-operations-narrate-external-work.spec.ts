import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { UpgradeDocumentSchema, type OperationEvent } from "axm.sh/specification-harness";
import {
  runUpgrade,
  recordedUpgradeEvents,
  type ExternalCommandObservation,
} from "../support/upgrade-harness.js";

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
        "The conditional wait narration obligation has no product polling witness after upgrade stopped polling publication.",
      retirementCondition:
        "A command that polls an external tool supplies an event-log example for waiting and completion.",
    },
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
      const { calls, events, document: output } = yield* runUpgrade();
      const document = yield* Schema.decodeUnknownEffect(UpgradeDocumentSchema)(output);
      const delegated = startedUnits(events).filter((unit) => unit.parentUnitId === "upgrade");
      expect(delegated.length).toBeGreaterThan(0);
      // Actual port calls establish complete command identity independently of
      // the rendered labels; their public command records connect those identities
      // to the units a person sees. Arrays preserve repeated commands.
      expect(
        document.result.commands.map(({ executable, args }) => ({ executable, args })),
      ).toEqual(calls.map(({ executable, args }) => ({ executable, args })));
      expect(delegated.map((unit) => unit.label).sort()).toEqual(
        document.result.commands.map((command) => command.display).sort(),
      );
      expect(new Set(delegated.map((unit) => unit.unitId)).size).toBe(delegated.length);
      // Homebrew checks its prefix before and after mutation; repeating a command
      // must create separate units even when the complete invocation is identical.
      const repeatedPrefix = calls.filter(
        (call) =>
          call.executable === "brew" && call.args.length === 1 && call.args[0] === "--prefix",
      );
      expect(repeatedPrefix.length).toBeGreaterThan(1);
      expect(delegated.filter((unit) => unit.label === "brew --prefix")).toHaveLength(
        repeatedPrefix.length,
      );
      expect(delegated.some((unit) => unit.label === "brew upgrade agentxm/tap/axm")).toBe(true);
      const parent = startedUnits(events).filter((unit) => unit.unitId === "upgrade");
      expect(parent).toHaveLength(1);
      for (const unit of delegated) {
        expect(unit.parentUnitId).toBe(parent[0]?.unitId);
      }
    }),
  );

  it.effect("settles each delegated unit and never leaves one running", () =>
    Effect.gen(function* () {
      const { events } = yield* runUpgrade();
      const delegated = startedUnits(events).filter((unit) => unit.parentUnitId === "upgrade");
      expect(delegated.length).toBeGreaterThan(0);
      for (const unit of delegated) {
        const resolved = events.filter(
          (event) => event._tag === "UnitResolved" && event.unitId === unit.unitId,
        );
        expect(resolved).toHaveLength(1);
      }
    }),
  );

  it.effect("publishes no wait when nothing blocked", () =>
    Effect.gen(function* () {
      const { events } = yield* runUpgrade();
      expect(events.filter((event) => event._tag === "Waiting")).toHaveLength(0);
      expect(events.filter((event) => event._tag === "WaitEnded")).toHaveLength(0);
    }),
  );

  it.effect("publishes the delegated command before its external work can finish", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<ExternalCommandObservation>();
      const release = yield* Deferred.make<void>();
      const fiber = yield* runUpgrade({
        duringExternalCommand: (observation) => {
          const { executable, args } = observation.invocation;
          if (executable !== "brew" || args[0] !== "upgrade") return Effect.void;
          return Effect.gen(function* () {
            yield* Deferred.succeed(entered, observation);
            yield* Deferred.await(release);
          });
        },
      }).pipe(Effect.forkChild);

      const observed = yield* Deferred.await(entered);
      const unitId = yield* Effect.gen(function* () {
        const events = yield* recordedUpgradeEvents(observed.writes);
        const started = startedUnits(events).filter(
          (unit) =>
            unit.label === "brew upgrade agentxm/tap/axm" && unit.parentUnitId === "upgrade",
        );
        expect(started).toHaveLength(1);
        const [unit] = started;
        if (unit === undefined) throw new Error("Expected the running delegated command unit");
        expect(
          events.filter((event) => event._tag === "UnitResolved" && event.unitId === unit.unitId),
        ).toEqual([]);
        expect(events.filter((event) => event._tag === "OperationSettled")).toEqual([]);
        expect(observed.writes.filter((write) => write.channel === "stdout")).toEqual([]);
        return unit.unitId;
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)));

      const completed = yield* Fiber.join(fiber);
      expect(
        completed.events.filter((event) => event._tag === "UnitStarted" && event.unitId === unitId),
      ).toHaveLength(1);
      expect(
        completed.events.filter(
          (event) => event._tag === "UnitResolved" && event.unitId === unitId,
        ),
      ).toHaveLength(1);
      const document = yield* Schema.decodeUnknownEffect(UpgradeDocumentSchema)(completed.document);
      expect(document.result.outcome).toBe("applied");
    }),
  );
});
