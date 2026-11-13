import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { createHash } from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  LocalInspectionDocumentSchema,
  ExtensionInventoryDocumentSchema,
} from "@agentxm/workspace-features/inspection";
import { PublishResultSchema } from "@agentxm/workspace-features/publishing";
import { PlanResolutionDocumentSchema, toPlanResolutionResult } from "./operation-output.js";
import { emitResult, type Screen } from "./screen/screen.js";
import type { OutputWriteFailed } from "./screen/streams.js";
import {
  humanScreenLayer,
  machineScreenLayer,
  makeRecordingStreams,
} from "./test-support/screen-harness.js";
import { handleSchemaPath } from "./root/schema/command.js";
import {
  inspectionProfile,
  inventoryProfile,
  restorationProfile,
  publicationProfile,
} from "./test-support/output-reference-profiles.js";

export const specification = defineSpecification({
  requirement: "cli/output/reference-size-budgets",
  title: "Complete ordinary results fit bounded reference profiles",
  statement:
    "Without truncating result facts, AXM shall keep the fixed representation profiles for one ownership answer within 16 KiB, thirty ownership answers within 128 KiB, thirty inventory entries within 64 KiB, fifty restoration units within 256 KiB, three publication candidates and one hundred paths within 64 KiB, and human schema outlines and field explanations within 8 KiB and 4 KiB respectively.",
  class: "quality",
  characteristic: "performance",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["benchmark", "contract"],
  derivedFrom: ["workspace/native-documents/share-complete-evidence"],
  supersedes: [],
  assumptions: [
    "The fixed fixtures use two native locations and forty declared readers per subject, up to three retention reasons, names below forty characters and paths below one hundred sixty characters.",
    "This memory boundary measures real encoder and Screen output for declared representation fixtures; producer correctness, built-process behavior, before/after timing and agent task outcomes have separate evidence.",
    "Complete authored content, full schemas, arbitrary explicit selections and exact archive paths are not runtime truncation limits.",
  ],
  openQuestions: [],
});

const measure = <E>(
  name: string,
  budget: number,
  action: Effect.Effect<void, E | OutputWriteFailed, Screen>,
  human = false,
) =>
  Effect.gen(function* () {
    const streams = makeRecordingStreams();
    yield* action.pipe(
      Effect.provide(human ? humanScreenLayer(streams) : machineScreenLayer(streams)),
    );
    const stdout = streams.log
      .filter((entry) => entry.channel === "stdout")
      .map((entry) => entry.content)
      .join("");
    const stderr = streams.log
      .filter((entry) => entry.channel === "stderr")
      .map((entry) => entry.content)
      .join("");
    const bytes = new TextEncoder().encode(stdout).length;
    const receipt = {
      profile: name,
      budget,
      stdoutBytes: bytes,
      stderrBytes: new TextEncoder().encode(stderr).length,
      stdoutSha256: createHash("sha256").update(stdout).digest("hex"),
    };
    yield* Console.log(JSON.stringify(receipt));
    const captureRoot = process.env["AXM_OUTPUT_PROFILE_CAPTURE"];
    if (captureRoot !== undefined) {
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(captureRoot, { recursive: true });
        yield* fs.writeFileString(`${captureRoot}/${name}.stdout`, stdout);
        yield* fs.writeFileString(`${captureRoot}/${name}.stderr`, stderr);
        yield* fs.writeFileString(
          `${captureRoot}/${name}.receipt.json`,
          `${JSON.stringify(receipt)}\n`,
        );
      }).pipe(Effect.provide(NodeServices.layer));
    }
    expect(bytes, name).toBeLessThanOrEqual(budget);
    expect(stdout.length).toBeGreaterThan(0);
    if (!human) {
      const wire: unknown = JSON.parse(stdout);
      expect(stdout).toBe(`${JSON.stringify(wire)}\n`);
    }
  }).pipe(Effect.scoped);

const query = { mode: "query", outcome: "completed", exitCode: 0 } as const;
describe("Reference output budgets", () => {
  for (const count of [1, 30]) {
    it.effect(
      `${count} complete ownership answers retain native evidence and all contributors`,
      () => {
        const profile = inspectionProfile(count);
        expect(profile.nativeLocations).toHaveLength(count * 2);
        expect(profile.nativeReaderDeclarations).toHaveLength(1);
        expect(
          profile.nativeLocations.every(
            (location) =>
              profile.nativeReaderDeclarations.find(
                (declaration) => declaration.id === location.readerDeclarationRef,
              )?.potentialReaders.length === 40,
          ),
        ).toBe(true);
        const ids = new Set(profile.nativeLocations.map(({ id }) => id));
        for (const item of profile.items) {
          expect(item.nativeLocationRefs).toHaveLength(2);
          expect(item.nativeLocationRefs.every((id) => ids.has(id))).toBe(true);
          expect(item.retention.reasons).toHaveLength(3);
        }
        return measure(
          `inspection-${count}`,
          (count === 1 ? 16 : 128) * 1024,
          emitResult(profile, LocalInspectionDocumentSchema, () => [], { completion: query }),
        );
      },
    );
  }
  it.effect("thirty ordinary mixed inventory rows", () =>
    measure(
      "inventory-30",
      64 * 1024,
      emitResult(inventoryProfile(), ExtensionInventoryDocumentSchema, () => [], {
        completion: query,
      }),
    ),
  );
  it.effect("fifty restoration units share native observations", () => {
    const result = toPlanResolutionResult(restorationProfile());
    expect(result.units).toHaveLength(50);
    expect(result.nativeLocations).toHaveLength(100);
    return measure(
      "restoration-50",
      256 * 1024,
      emitResult({ result }, PlanResolutionDocumentSchema, () => [], {
        completion: { mode: "apply", outcome: "applied", exitCode: 0 },
        promotedResultFields: ["mode", "outcome"],
      }),
    );
  });
  it.effect("publication keeps one hundred paths and all explicit rules", () => {
    const result = publicationProfile();
    expect(result.execution.outcomes.flatMap((item) => item.archive?.included ?? [])).toHaveLength(
      100,
    );
    expect(
      result.execution.outcomes.every(
        (item) =>
          item.archive?.patterns.length === 5 &&
          item.archive.patternCoverage.omittedInheritedCount === 300,
      ),
    ).toBe(true);
    return measure(
      "publication-3",
      64 * 1024,
      emitResult(result, PublishResultSchema, () => [], {
        completion: { mode: "preview", outcome: "previewed", exitCode: 0 },
        promotedResultFields: ["mode"],
      }),
    );
  });
  it.effect("schema outline is concise", () =>
    measure("schema-outline", 8 * 1024, handleSchemaPath(["show"], undefined, false), true),
  );
  it.effect("schema field explanation is concise", () =>
    measure(
      "schema-field",
      4 * 1024,
      handleSchemaPath(["show"], "result.items[].editing.kind", false),
      true,
    ),
  );
});
