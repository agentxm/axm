import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  PlanResolutionDocumentSchema,
  ProgressEventSchema,
  handleInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import type { RecordedWrite } from "../support/screen-harness.js";

export const specification = defineSpecification({
  requirement: "cli/long-running-operations-emit-lifecycle-events",
  title: "A plan-family operation publishes its lifecycle as typed events",
  statement:
    "A plan-family operation shall publish an operation-started event, a phase-started event for each phase it enters, a unit-started and a unit-resolved event for every unit it attempts, and exactly one settled event whose outcome equals the outcome of its result document.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "example"],
  derivedFrom: ["cli/machine-progress-events-follow-the-lifecycle-schema"],
  supersedes: [],
  assumptions: [
    "Source resolution, lockfile reconciliation, and the plan's units are the only units a local install attempts, so units that do not appear in the result document belong to the resolution or planning phase.",
  ],
  openQuestions: [],
});

const decodeProgressEvent = Schema.decodeUnknownEffect(ProgressEventSchema);
const decodeDocument = Schema.decodeUnknownEffect(PlanResolutionDocumentSchema);

const decodeEvents = (log: ReadonlyArray<RecordedWrite>) =>
  Effect.forEach(
    log.flatMap((entry) =>
      entry.channel === "stderr"
        ? entry.content
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line): unknown => JSON.parse(line))
            .filter(
              (value) =>
                typeof value === "object" &&
                value !== null &&
                "type" in value &&
                value.type === "progress",
            )
        : [],
    ),
    (value) => Effect.map(decodeProgressEvent(value), (decoded) => decoded.event),
  );

const resultDocument = (log: ReadonlyArray<RecordedWrite>) =>
  Effect.gen(function* () {
    const entry = log.find((write) => write.channel === "stdout");
    expect(entry).toBeDefined();
    return yield* decodeDocument(JSON.parse(entry?.content ?? ""));
  });

describe("Plan-family lifecycle events", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const observedInstall = (options: {
    readonly preview: boolean;
    readonly prepare?: (
      workspace: ReturnType<typeof makeSpecWorkspace>,
      source: string,
    ) => Effect.Effect<void, unknown>;
  }) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ screen: { kind: "machine" }, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      if (options.prepare !== undefined) {
        yield* options.prepare(workspace, skillPackage);
        workspace.streams?.log.splice(0);
      }
      yield* handleInstall({
        source: Option.some(skillPackage),
        yes: true,
        force: false,
        preview: options.preview,
      }).pipe(Effect.provide(workspace.layer));
      const log = workspace.streams?.log ?? [];
      const events = yield* decodeEvents(log);
      const document = yield* resultDocument(log);
      return { events, document };
    });

  it.effect(
    "an apply publishes start, each phase in order, every unit's start and resolution, and one settlement matching the result",
    () =>
      Effect.gen(function* () {
        const { events, document } = yield* observedInstall({ preview: false });

        expect(events[0]?._tag).toBe("OperationStarted");
        expect(events[0]?._tag === "OperationStarted" ? events[0].mode : undefined).toBe("apply");

        const phases = events.flatMap((event) =>
          event._tag === "PhaseStarted" ? [event.phase] : [],
        );
        const resolution = phases.indexOf("resolution");
        const planning = phases.indexOf("planning");
        const apply = phases.indexOf("apply");
        expect(resolution).toBeGreaterThan(-1);
        expect(planning).toBeGreaterThan(resolution);
        expect(apply).toBeGreaterThan(planning);

        const started = new Map(
          events.flatMap((event) =>
            event._tag === "UnitStarted" ? [[event.unitId, event] as const] : [],
          ),
        );
        const resolved = new Map(
          events.flatMap((event) =>
            event._tag === "UnitResolved" ? [[event.unitId, event] as const] : [],
          ),
        );
        expect([...started.keys()].sort()).toEqual([...resolved.keys()].sort());

        expect(document.result.units.length).toBeGreaterThan(0);
        for (const unit of document.result.units) {
          expect(started.has(unit.id), unit.id).toBe(true);
          expect(resolved.get(unit.id)?.state, unit.id).toBe(unit.state);
        }

        const settled = events.filter((event) => event._tag === "OperationSettled");
        expect(settled).toHaveLength(1);
        expect(settled[0]?._tag === "OperationSettled" ? settled[0].outcome : undefined).toBe(
          document.result.outcome,
        );
        expect(events.at(-1)?._tag).toBe("OperationSettled");
      }),
  );

  it.effect("a preview enters no apply phase and settles as previewed", () =>
    Effect.gen(function* () {
      const { events, document } = yield* observedInstall({ preview: true });

      expect(events[0]?._tag).toBe("OperationStarted");
      expect(events[0]?._tag === "OperationStarted" ? events[0].mode : undefined).toBe("preview");
      const phases = events.flatMap((event) =>
        event._tag === "PhaseStarted" ? [event.phase] : [],
      );
      expect(phases).not.toContain("apply");
      expect(phases).not.toContain("restoration");

      const settled = events.filter((event) => event._tag === "OperationSettled");
      expect(settled).toHaveLength(1);
      expect(document.result.outcome).toBe("previewed");
      expect(settled[0]?._tag === "OperationSettled" ? settled[0].outcome : undefined).toBe(
        "previewed",
      );
    }),
  );

  it.effect("a repeated install settles with the no-op outcome its result reports", () =>
    Effect.gen(function* () {
      const { events, document } = yield* observedInstall({
        preview: false,
        prepare: (workspace, source) =>
          handleInstall({
            source: Option.some(source),
            yes: true,
            force: false,
            preview: false,
          }).pipe(Effect.provide(workspace.layer)),
      });

      expect(document.result.outcome).toBe("no-op");
      const settled = events.filter((event) => event._tag === "OperationSettled");
      expect(settled).toHaveLength(1);
      expect(settled[0]?._tag === "OperationSettled" ? settled[0].outcome : undefined).toBe(
        "no-op",
      );
    }),
  );
});
