import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  PLAN_RESULT_CONTRACT,
  PlanResolutionDocumentSchema,
  handleInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/machine-result-is-schema-backed",
  title: "Machine install output is one complete schema-backed plan document",
  statement:
    "When the install command runs in machine output mode, it shall emit a single result document that satisfies the published plan-result schema and accounts for every unit exactly once in its counts, and preview shall report through that same contract with a previewed outcome.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeDocument = Schema.decodeUnknownEffect(PlanResolutionDocumentSchema);

describe("Machine install result contract", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const machineInstall = (options?: { readonly preview?: boolean }) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        screen: { kind: "machine" },
      });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: options?.preview === true,
      }).pipe(Effect.provide(workspace.layer));
      const stdout = (workspace.streams?.lines("stdout") ?? []).join("\n");
      // Parsing the complete stream rejects a second document, progress text,
      // and trailing non-JSON output without constraining pretty-printing.
      const document: unknown = JSON.parse(stdout);
      return document;
    });

  it.effect("emits exactly one document that satisfies the published plan schema", () =>
    Effect.gen(function* () {
      const payload = yield* machineInstall();
      const document = yield* decodeDocument(payload);
      expect(document.result.contract).toBe(PLAN_RESULT_CONTRACT);
      expect(document.result.mode).toBe("apply");
    }),
  );

  it.effect("partitions unit counts so every unit is accounted for once", () =>
    Effect.gen(function* () {
      const payload = yield* machineInstall();
      const document = yield* decodeDocument(payload);
      const counts = document.result.counts;
      const accounted =
        counts.committed +
        counts.unchanged +
        counts.failed +
        counts.rolledBack +
        counts.blocked +
        counts.skipped +
        counts.cancelled +
        counts.interrupted +
        counts.planned;
      expect(accounted).toBe(counts.total);
      expect(document.result.units).toHaveLength(counts.total);
    }),
  );

  it.effect("reports preview through the same contract with a previewed outcome", () =>
    Effect.gen(function* () {
      const payload = yield* machineInstall({ preview: true });
      const document = yield* decodeDocument(payload);
      expect(document.result.contract).toBe(PLAN_RESULT_CONTRACT);
      expect(document.result.outcome).toBe("previewed");
      expect(document.result.mode).toBe("preview");
    }),
  );
});
