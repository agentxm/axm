import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { AdoptInstructionRegion } from "../index.js";
import { makeConfigurationFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/adopt/records-exact-scoped-authority",
  title: "Explicit instruction-region adoption records current scoped source authority",
  statement:
    "When explicitly asked to adopt one existing instruction region, AXM shall transfer its ownership to the selected scope's accepted contributors without changing its body, surrounding content, desired settings, or accepted resolutions. Missing, malformed, differently owned, escaped, or changed-since-planning regions, and regions without accepted source authority, shall be refused without mutation; ordinary sync shall not perform this ownership transfer.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "extension-adoption"],
  boundary: "platform",
  boundaryRationale:
    "Exact instruction bytes, physical scope confinement, and stale file observations require a real temporary filesystem.",
  methods: ["example", "decision-table"],
  derivedFrom: ["workspace/projections/native-regions-preserve-scoped-authority"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const rawRegion = (owner = "@agentxm/rules/instructions") =>
  `# Foreign\r\n<!-- axm:start v=1 region=rules ext=${owner} gen=${"a".repeat(64)} -->\r\nExisting body\n<!-- axm:end v=1 region=rules -->\r\nForeign tail`;

describe("Explicit instruction region adoption", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const fixture = (raw = rawRegion(), accepted = true) => {
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
      },
    });
    cleanups.push(world.cleanup);
    return world;
  };

  for (const [region, type, plural, owner] of [
    ["knowledge", "knowledge", "knowledge", "@agentxm/knowledge/discovery"],
    ["hook-fallbacks", "hook", "hooks", "@agentxm/hooks/fallbacks"],
  ] as const) {
    it.effect(`adopts ${region} from its own accepted contributors`, () => {
      const raw = `<!-- axm:start v=1 region=${region} ext=${owner} -->\nExisting body\n<!-- axm:end v=1 region=${region} -->\n`;
      const world = makeConfigurationFixture({
        settings: {
          owner: "@acme",
          agents: ["codex"],
          [plural]: { guide: { source: "workspace" } },
        },
        files: {
          "AGENTS.md": raw,
          [`${plural}/guide/${type}.json`]: JSON.stringify({
            owner: "@acme",
            type,
            name: "guide",
            version: "1.0.0",
          }),
          [`${plural}/guide/src/index.md`]: "Canonical guide.\n",
        },
      });
      cleanups.push(world.cleanup);
      return world
        .provide(
          Effect.gen(function* () {
            const candidate = yield* AdoptInstructionRegion.prepare({
              region,
              fileName: "AGENTS.md",
            });
            expect(
              deriveOperationOutcome(
                yield* AdoptInstructionRegion.previewOrApply(candidate, preapprovedPlanExecution),
              ),
            ).toBe("applied");
            const adopted = world.readFile("AGENTS.md");
            expect(adopted).toContain("src=");
            expect(adopted).toContain(`@acme/${plural}/guide`);
            expect(adopted).toContain(`\nExisting body\n<!-- axm:end v=1 region=${region} -->\n`);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }

  it.effect("preserves body, foreign bytes, and source records when adopting", () => {
    const world = fixture();
    return world
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptInstructionRegion.prepare({
            region: "rules",
            fileName: "AGENTS.md",
          });
          const settings = world.readFile("axm.json");
          expect(
            deriveOperationOutcome(
              yield* AdoptInstructionRegion.previewOrApply(candidate, preapprovedPlanExecution),
            ),
          ).toBe("applied");
          const adopted = world.readFile("AGENTS.md");
          expect(adopted).toContain("\r\nExisting body\n<!-- axm:end");
          expect(adopted.startsWith("# Foreign\r\n")).toBe(true);
          expect(adopted.endsWith("\r\nForeign tail")).toBe(true);
          expect(adopted).toContain("src=");
          expect(world.readFile("axm.json")).toBe(settings);
          expect(world.readFile("rules/guide/src/RULE.md")).toBe("Canonical guide body.\n");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("rejects a changed region after planning and preserves the external edit", () => {
    const world = fixture();
    return world
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptInstructionRegion.prepare({
            region: "rules",
            fileName: "AGENTS.md",
          });
          const edited = rawRegion().replace("Existing body", "External edit");
          world.writeFile("AGENTS.md", edited);
          const outcome = deriveOperationOutcome(
            yield* AdoptInstructionRegion.previewOrApply(candidate, preapprovedPlanExecution),
          );
          expect(outcome).not.toBe("applied");
          expect(world.readFile("AGENTS.md")).toBe(edited);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses a selected file outside the project root without changing it", () => {
    const world = fixture();
    return world
      .provide(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const outside = path.join(world.home, "AGENTS.md");
          yield* fs.writeFileString(outside, rawRegion());
          const before = world.snapshot();
          const result = yield* AdoptInstructionRegion.prepare({
            region: "rules",
            fileName: outside,
          }).pipe(Effect.result);
          expect(result._tag).toBe("Failure");
          expect(yield* fs.readFileString(outside)).toBe(rawRegion());
          expect(world.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses contributor ownership that changed after planning", () => {
    const world = fixture();
    return world
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptInstructionRegion.prepare({
            region: "rules",
            fileName: "AGENTS.md",
          });
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
          const candidate = yield* AdoptInstructionRegion.prepare({
            region: "rules",
            fileName: "AGENTS.md",
          });
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

  for (const [raw, accepted] of [
    ["# No region\n", true],
    ["<!-- axm:start v=1 region=rules ext=@agentxm/rules/instructions -->", true],
    [rawRegion("@someone/rules/instructions"), true],
    [rawRegion(), false],
  ] as const) {
    it.effect(`refuses unavailable authority: ${raw.length} bytes, accepted=${accepted}`, () => {
      const world = fixture(raw, accepted);
      return world
        .provide(
          Effect.gen(function* () {
            const before = world.snapshot();
            const result = yield* AdoptInstructionRegion.prepare({
              region: "rules",
              fileName: "AGENTS.md",
            }).pipe(Effect.result);
            expect(result._tag).toBe("Failure");
            expect(world.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }
});
