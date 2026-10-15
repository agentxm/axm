import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { RuleManager } from "@agentxm/workspace-kernel/materialization";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import {
  observeProjectionPlans,
  projectionOutputDigest,
} from "@agentxm/workspace-kernel/projection";
import { AdoptInstructionRegion } from "../index.js";
import { makeConfigurationFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/adopt/records-current-projection",
  title: "Instruction region adoption records the planned region as current",
  statement:
    "When explicitly asked to adopt the Rules or Knowledge region of the instruction file the selected scope's settings plan, AXM shall record that region's current generation and the digest of its body as found in the lockfile, so later reconciliation treats it as current, without changing the instruction file, desired settings, canonical sources or accepted resolutions. An absent or malformed region, a region in any other file, a region without accepted source authority, and a region or authority that changed after planning shall be refused without mutation; ordinary sync shall not adopt.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "extension-adoption"],
  boundary: "platform",
  boundaryRationale:
    "Exact instruction bytes, the persisted lockfile, and stale file observations require a real temporary filesystem.",
  methods: ["example", "decision-table"],
  derivedFrom: ["workspace/projections/native-regions-follow-planned-target"],
  supersedes: ["cli/instructions/adopt/records-exact-scoped-authority"],
  assumptions: [],
  openQuestions: [],
});

const BODY = "Existing body\n";
const rawRegion = (region: "rules" | "knowledge" = "rules") =>
  `# Foreign\r\n<!-- axm:${region} -->\r\n${BODY}<!-- /axm:${region} -->\r\nForeign tail`;

describe("Explicit instruction region adoption", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const fixture = (raw = rawRegion(), accepted = true, extra: Record<string, string> = {}) => {
    const world = makeConfigurationFixture({
      settings: {
        owner: "@acme",
        agents: ["codex"],
        ...(accepted ? { rules: { guide: "workspace" } } : {}),
      },
      files: {
        "AGENTS.md": raw,
        "rules/guide/rule.json": JSON.stringify({
          owner: "@acme",
          type: "rule",
          name: "guide",
          version: "1.0.0",
        }),
        "rules/guide/src/RULE.md": "Canonical guide body.\n",
        ...extra,
      },
    });
    cleanups.push(world.cleanup);
    return world;
  };

  it.effect("records knowledge from its own accepted contributors without writing the file", () => {
    const raw = rawRegion("knowledge");
    const world = makeConfigurationFixture({
      settings: {
        owner: "@acme",
        agents: ["codex"],
        knowledge: { guide: { source: "workspace" } },
      },
      files: {
        "AGENTS.md": raw,
        "knowledge/guide/knowledge.json": JSON.stringify({
          owner: "@acme",
          type: "knowledge",
          name: "guide",
          version: "1.0.0",
        }),
        "knowledge/guide/src/index.md": "Canonical guide.\n",
      },
    });
    cleanups.push(world.cleanup);
    return world
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptInstructionRegion.prepare({ region: "knowledge" });
          expect(
            deriveOperationOutcome(
              yield* AdoptInstructionRegion.previewOrApply(candidate, preapprovedPlanExecution),
            ),
          ).toBe("applied");
          expect(world.readFile("AGENTS.md")).toBe(raw);
          const lockfile = world.readFile("axm.lock");
          expect(lockfile).toContain("[projections.");
          expect(lockfile).toContain(`output = "${projectionOutputDigest(BODY)}"`);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("preserves every byte and source record, and later reconciliation is current", () => {
    const world = fixture();
    return world
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptInstructionRegion.prepare({ region: "rules" });
          const settings = world.readFile("axm.json");
          expect(
            deriveOperationOutcome(
              yield* AdoptInstructionRegion.previewOrApply(candidate, preapprovedPlanExecution),
            ),
          ).toBe("applied");
          expect(world.readFile("AGENTS.md")).toBe(rawRegion());
          expect(world.readFile("axm.json")).toBe(settings);
          expect(world.readFile("rules/guide/src/RULE.md")).toBe("Canonical guide body.\n");
          expect(world.readFile("axm.lock")).toContain(
            `output = "${projectionOutputDigest(BODY)}"`,
          );
          const [observed] = yield* (yield* RuleManager)
            .projectionPlans()
            .pipe(Effect.flatMap(observeProjectionPlans));
          expect(observed).toMatchObject({ present: true, current: true });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("rejects a region changed after planning and preserves the external edit", () => {
    const world = fixture();
    return world
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptInstructionRegion.prepare({ region: "rules" });
          const edited = rawRegion().replace("Existing body", "External edit");
          world.writeFile("AGENTS.md", edited);
          const before = world.snapshot();
          const outcome = deriveOperationOutcome(
            yield* AdoptInstructionRegion.previewOrApply(candidate, preapprovedPlanExecution),
          );
          expect(outcome).not.toBe("applied");
          expect(world.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("ignores a region in any file other than the planned instruction target", () => {
    const world = fixture("# Authored instructions\n", true, { "CLAUDE.md": rawRegion() });
    return world
      .provide(
        Effect.gen(function* () {
          const before = world.snapshot();
          const result = yield* AdoptInstructionRegion.prepare({ region: "rules" }).pipe(
            Effect.result,
          );
          expect(result._tag).toBe("Failure");
          expect(world.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses contributor authority that changed after planning", () => {
    const world = fixture();
    return world
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptInstructionRegion.prepare({ region: "rules" });
          world.writeFile(
            "axm.json",
            JSON.stringify({ owner: "@someone", agents: ["codex"], rules: { guide: "workspace" } }),
          );
          const before = world.snapshot();
          const outcome = deriveOperationOutcome(
            yield* AdoptInstructionRegion.previewOrApply(candidate, preapprovedPlanExecution),
          );
          expect(outcome).not.toBe("applied");
          expect(world.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses a source package that changed after planning", () => {
    const world = fixture();
    return world
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptInstructionRegion.prepare({ region: "rules" });
          world.writeFile(
            "rules/guide/rule.json",
            JSON.stringify({ owner: "@someone", type: "rule", name: "guide", version: "1.0.0" }),
          );
          const before = world.snapshot();
          const outcome = deriveOperationOutcome(
            yield* AdoptInstructionRegion.previewOrApply(candidate, preapprovedPlanExecution),
          );
          expect(outcome).not.toBe("applied");
          expect(world.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  for (const [label, raw, accepted] of [
    ["an absent region", "# No region\n", true],
    ["unpaired fences", "<!-- axm:rules -->\nbody\n", true],
    ["duplicate fences", `${rawRegion()}\n<!-- axm:rules -->\nagain\n<!-- /axm:rules -->\n`, true],
    ["no accepted source authority", rawRegion(), false],
  ] as const) {
    it.effect(`refuses ${label} without mutation`, () => {
      const world = fixture(raw, accepted);
      return world
        .provide(
          Effect.gen(function* () {
            const before = world.snapshot();
            const result = yield* AdoptInstructionRegion.prepare({ region: "rules" }).pipe(
              Effect.result,
            );
            expect(result._tag).toBe("Failure");
            expect(world.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }
});
