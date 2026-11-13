import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { ConfiguredAgentOutcomesProvider } from "@agentxm/workspace-kernel/workspace-state";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  ListExtensions,
  LocalInspection,
  ListKnowledge,
  listSkills,
  listSubagents,
  listRules,
  listHooks,
  listPacks,
  listMcpServers,
} from "../index.js";
import {
  AUTHORING_TYPES,
  makeAuthoredExtensionFixture,
  makeInspectionFixture,
  makeKnowledgeInventoryFixture,
  knowledgeDocument,
  makeInstalledSkillFixture,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/list/ordinary-inventory-is-local",
  title: "Ordinary listings report local state without registry assessment",
  statement:
    "When an ordinary inventory is requested, AXM shall report the local inventory without consulting remote sources, verifying native currency, or inspecting Knowledge document contents, with explicit not-requested inspection and not-checked remote assessment; current presence and configured or observed agent associations shall remain visible.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundaryRationale:
    "Production workspace services execute over native temporary files and directories; the default examples observe their state and outcomes without a separate CLI process.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/list/command.test.ts",
    "packages/core/workspace-features/src/inspection/extension-list/list-extensions.ts",
  ],
  supersedes: ["cli/list/ordinary-inventory-identifies-deprecation"],
  assumptions: [],
  openQuestions: [],
});

describe("Local ordinary inventories", () => {
  it.effect("reports local state without assessing deprecated and archived metadata", () => {
    const fixture = makeInstalledSkillFixture({
      index: {
        versions: [{ version: "1.0.0", published: "2026-01-01T00:00:00.000Z" }],
        archival: { archivedAt: "2026-03-02T00:00:00.000Z", message: "Publication is closed." },
        deprecation: {
          deprecatedAt: "2026-03-01T00:00:00.000Z",
          reason: "other",
          message: "Use the replacement.",
        },
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* ListExtensions.query({ filter: "all" });
          expect(result.document).toMatchObject({
            filter: "all",
            items: [{ name: "review", assessment: { state: "not-checked" } }],
          });
          expect(result.document.items[0]?.assessment).toEqual({ state: "not-checked" });
          expect(result.document.coverage).toBeUndefined();
          expect(fixture.requests).toEqual([]);
          const typed = yield* ListExtensions.query({ filter: "all", types: ["skill"] });
          expect(typed.document.items).toEqual(result.document.items);
          expect(fixture.requests).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});

describe("Lightweight inventory", () => {
  for (const type of AUTHORING_TYPES) {
    it.effect(`does not request native inspection for root or typed ${type} lists`, () => {
      const fixture = makeAuthoredExtensionFixture(type);
      return fixture
        .provide(
          Effect.gen(function* () {
            const typed = () => {
              switch (type) {
                case "skill":
                  return listSkills({});
                case "subagent":
                  return listSubagents({});
                case "rule":
                  return listRules({});
                case "hook":
                  return listHooks({});
                case "pack":
                  return listPacks({});
                case "mcp-server":
                  return listMcpServers({});
                case "knowledge":
                  return ListKnowledge.query({});
              }
            };
            const root = yield* ListExtensions.query({ filter: "all" });
            const selected = yield* typed();
            for (const document of [root.document, selected.document]) {
              expect(document.items[0]).toMatchObject({
                installed: true,
                inspection: { state: "not-requested" },
                agents: { configured: ["claude-code"] },
              });
              expect(document.items[0]).not.toHaveProperty("agentOutcomes");
              expect(document.items[0]).not.toHaveProperty("nativeLocations");
            }
          }).pipe(
            Effect.provideService(ConfiguredAgentOutcomesProvider, {
              byExtensionType: {
                [type]: () => Effect.die("Ordinary inventory invoked native inspection"),
              },
            }),
          ),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
  }

  it.effect("reports completed inspection even when the native projection is missing", () => {
    const fixture = makeAuthoredExtensionFixture("skill");
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({ selection: { kind: "all" } });
          expect(result.items[0]).toMatchObject({
            nativeCoverage: { state: "complete" },
            agentOutcomes: [{ outcome: "failed", reasonCode: "projection-missing" }],
          });
        }).pipe(
          Effect.provideService(ConfiguredAgentOutcomesProvider, {
            byExtensionType: {
              skill: () =>
                Effect.succeed(
                  new Map([
                    [
                      "example",
                      {
                        nativeLocations: [],
                        agentOutcomes: [
                          {
                            extensionType: "skill",
                            name: "example",
                            agentId: "claude-code",
                            outcome: "failed",
                            reasonCode: "projection-missing",
                            reason: "The projection is missing.",
                          },
                        ],
                      },
                    ],
                  ]),
                ),
            },
          }),
        ),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("does not read Knowledge documents until inspection is requested", () => {
    const fixture = makeKnowledgeInventoryFixture({
      bundles: [
        {
          name: "platform",
          documents: {
            "index.md": knowledgeDocument("# Platform\n"),
            "guide.md": knowledgeDocument("# Guide\n"),
          },
        },
      ],
    });
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      let reads = 0;
      const counted: FileSystem.FileSystem = {
        ...fs,
        readFile: (file) =>
          Effect.gen(function* () {
            if (file.startsWith(fixture.sourceRoot("platform"))) reads++;
            return yield* fs.readFile(file);
          }),
      };
      yield* fixture
        .provide(
          Effect.gen(function* () {
            const root = yield* ListExtensions.query({ filter: "all" });
            const typed = yield* ListKnowledge.query({});
            expect(reads).toBe(0);
            expect(root.document.items[0]?.inspection).toEqual({ state: "not-requested" });
            expect(typed.rows[0]?.concepts).toBeUndefined();
            const detailed = yield* LocalInspection.query({ selection: { kind: "all" } });
            expect(detailed.items[0]).toMatchObject({
              knowledge: { concepts: 2 },
            });
            expect(reads).toBeGreaterThan(0);
          }),
        )
        .pipe(Effect.provideService(FileSystem.FileSystem, counted));
    }).pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("retains healthy rows and marks unreadable presence unknown", () => {
    const manifest = (name: string) =>
      JSON.stringify({
        owner: "@acme",
        name,
        type: "skill",
        version: "1.0.0",
        description: "Fixture",
      });
    const fixture = makeInspectionFixture({
      settings: {
        owner: "@acme",
        agents: [],
        skills: {
          healthy: { source: "workspace" },
          unreadable: { source: "workspace" },
        },
      },
      files: {
        "skills/healthy/skill.json": manifest("healthy"),
        "skills/healthy/src/SKILL.md": "# Healthy\n",
        "skills/unreadable/skill.json": manifest("unreadable"),
        "skills/unreadable/src/SKILL.md": "# Unreadable\n",
      },
    });
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const blocked = `${fixture.root}/skills/unreadable/src`;
      const guarded: FileSystem.FileSystem = {
        ...fs,
        stat: (file) =>
          file === blocked
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "stat",
                  pathOrDescriptor: file,
                }),
              )
            : fs.stat(file),
      };
      yield* fixture
        .provide(
          Effect.gen(function* () {
            const { document } = yield* ListExtensions.query({ filter: "all" });
            expect(document.items.find((item) => item.name === "healthy")?.installed).toBe(true);
            expect(document.items.find((item) => item.name === "unreadable")?.installed).toBeNull();
            expect(document.observationDiagnostics).toContainEqual(
              expect.objectContaining({ path: blocked }),
            );
          }),
        )
        .pipe(Effect.provideService(FileSystem.FileSystem, guarded));
    }).pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
