import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ExtensionInventoryDocumentSchema, ExtensionListItemSchema } from "./inventory-document.js";
import { ListExtensions } from "./extension-list/list-extensions.js";
import { ListKnowledge } from "./knowledge/list-knowledge.js";
import {
  listSkills,
  listSubagents,
  listRules,
  listHooks,
  listPacks,
  listMcpServers,
} from "./type-list/type-lists.js";
import {
  AUTHORING_TYPES,
  makeAuthoredExtensionFixture,
  makeInspectionFixture,
  inspectionRegistryUrl,
} from "./testing.js";

export const specification = defineSpecification({
  requirement: "cli/inventories/use-one-item-and-envelope-contract",
  title: "Extension inventories share item identity, source, and management fields",
  statement:
    "Root and typed extension inventories shall share a schema-backed item core identifying type, local name, scope, optional fully qualified identity and version, flat management, installation, activation, structured source, and agent outcomes, and an envelope with filter, selected and total counts, and management counts, while retaining type-specific facts and omitting superseded identity, classification, source-type, and internal-origin fields.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["decision-table", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Shared inventory contract", () => {
  for (const type of AUTHORING_TYPES) {
    it.effect(`root and ${type} lists share their core`, () => {
      const fixture = makeAuthoredExtensionFixture(type);
      const readTyped = () =>
        Effect.gen(function* () {
          switch (type) {
            case "skill":
              return (yield* listSkills({})).document;
            case "subagent":
              return (yield* listSubagents({})).document;
            case "rule":
              return (yield* listRules({})).document;
            case "hook":
              return (yield* listHooks({})).document;
            case "pack":
              return (yield* listPacks({})).document;
            case "mcp-server":
              return (yield* listMcpServers({})).document;
            case "knowledge":
              return (yield* ListKnowledge.query({})).document;
          }
        });
      return fixture
        .provide(
          Effect.gen(function* () {
            const root = (yield* ListExtensions.query({ filter: "all" })).document;
            const typed = yield* readTyped();
            for (const document of [root, typed]) {
              expect(
                Schema.decodeUnknownSync(ExtensionInventoryDocumentSchema)(document),
              ).toMatchObject({
                filter: "all",
                count: 1,
                totalCount: 1,
                managementCounts: { configured: 1 },
              });
              for (const oldKey of [
                "configuredCount",
                "implicitCount",
                "installedCount",
                "leftoverCount",
                "undeclaredCount",
                "unmanagedCount",
              ])
                expect(document).not.toHaveProperty(oldKey);
              expect(document.items).toHaveLength(1);
              for (const item of document.items) {
                expect(Schema.decodeUnknownSync(ExtensionListItemSchema)(item)).toMatchObject({
                  type,
                  name: "example",
                  scope: "project",
                  management: "configured",
                  installed: true,
                  enabled: true,
                  source: { kind: "workspace" },
                });
                for (const oldKey of ["sourceType", "ref", "classification", "origins"])
                  expect(item).not.toHaveProperty(oldKey);
              }
            }
            expect(typed.items[0]?.fqn).toBe(root.items[0]?.fqn);
            expect(fixture.requests).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
  }

  for (const source of [
    { locator: "test:@acme/skills/review", kind: "registry" },
    { locator: "github:acme/tools//review", kind: "git" },
    { locator: "https://content.example.test/review/SKILL.md", kind: "http" },
    { locator: "./external/review", kind: "path" },
  ]) {
    it.effect(`describes the ${source.kind} source of an absent configured item`, () => {
      const fixture = makeInspectionFixture({
        settings: {
          defaultRegistry: "test",
          sources: [{ name: "test", type: "registry", location: inspectionRegistryUrl }],
          skills: { review: { source: source.locator, enabled: false } },
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const { document } = yield* listSkills({});
            expect(document.items).toEqual([
              expect.objectContaining({
                name: "review",
                installed: false,
                enabled: false,
                source: expect.objectContaining({ kind: source.kind, locator: source.locator }),
              }),
            ]);
            expect(fixture.requests).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
  }

  it("rejects the superseded classification wrapper in place of management", () => {
    expect(() =>
      Schema.decodeUnknownSync(ExtensionListItemSchema)({
        type: "skill",
        name: "review",
        scope: "project",
        classification: { kind: "lifecycle", lifecycle: "configured" },
        installed: false,
        enabled: true,
        source: {
          kind: "registry",
          locator: "@acme/skills/review",
          identity: "@acme/skills/review",
        },
        agentOutcomes: [],
      }),
    ).toThrow();
  });
});
