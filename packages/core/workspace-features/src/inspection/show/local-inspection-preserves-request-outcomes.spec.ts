import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as fs from "node:fs";
import { defineSpecification } from "@agentxm/specification-metadata";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { makeRegistrySkillLockEntry } from "@agentxm/workspace-kernel/workspace-state/testing";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { LocalInspection, LocalInspectionDocumentSchema, ListExtensions } from "../index.js";
import { makeAuthoredExtensionFixture, makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/show/preserves-request-outcomes",
  title: "Local inspection preserves each exact request and deduplicates subjects",
  statement:
    "AXM shall resolve exact local inspection requests only in the selected scope and types, retain successful answers and each unresolved request in input order, and inspect repeated matching subjects once. An identifiable local declaration whose source authority is unresolved shall remain inspectable with unknown editing authority and no invented edit address. Per-agent facts inherit the enclosing subject's type and local name without repeating them; configuration, projection, readiness and runtime evidence remain explicit.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Production workspace queries observe isolated native filesystem fixtures; these examples do not establish process-level parser or exit behavior.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Exact local inspection", () => {
  it.effect("keeps editing authority unknown for an unaccepted path Pack declaration", () => {
    const fixture = makeInspectionFixture({
      settings: { packs: { team: { source: "./external-pack" } } },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const before = fixture.snapshot();
          const result = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["team"] },
            types: ["pack"],
          });
          expect(result.requests[0]?.code).toBe(0);
          expect(result.items).toHaveLength(1);
          expect(result.items[0]).toMatchObject({
            identity: { type: "pack", name: "team", source: { authority: "unknown" } },
            editing: { kind: "unknown", reason: "Source authority has not been established." },
            accepted: { state: "absent" },
            observed: { state: "unverified", coverage: { state: "partial" } },
            desired: { state: "unknown", coverage: { state: "partial" } },
          });
          expect(result.items[0]?.identity.fqn).toBeUndefined();
          expect(result.items[0]?.editing.address).toBeUndefined();
          expect(result.items[0]?.observed.path).toBeUndefined();
          expect(result.observationDiagnostics).toContainEqual(
            expect.objectContaining({ code: "pack-identity-mismatch" }),
          );
          expect(fixture.requests).toEqual([]);
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
  it.effect("reports bundled authority without presenting a workspace edit owner", () => {
    const fixture = makeInspectionFixture({
      settings: { skills: { axm: { source: "workspace", origin: "bundled" } } },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["@agentxm/skills/axm"] },
          });
          expect(result.requests[0]?.code).toBe(0);
          expect(result.items[0]).toMatchObject({
            identity: { source: { authority: "bundled" } },
            editing: { kind: "bundled" },
            accepted: { state: "not-applicable" },
            observed: { state: "absent" },
            desired: { direct: true },
          });
          expect(result.items[0]?.editing.address).toBeUndefined();
          expect(fixture.requests).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
  for (const scope of ["project", "user"] as const) {
    it.effect(`keeps ${scope} identities within the explicitly selected scope`, () => {
      const connection = { transport: "stdio", command: "node", args: ["server.js"] };
      const fixture = makeInspectionFixture({
        scope,
        settings: { mcpServers: { selected: { connection } } },
      });
      const otherSettings =
        scope === "project"
          ? `${fixture.home}/.axm/workspace/axm.json`
          : `${fixture.root}/axm.json`;
      fs.writeFileSync(
        otherSettings,
        JSON.stringify({ agents: [], mcpServers: { other: { connection } } }),
      );
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* LocalInspection.query({
              selection: { kind: "identities", identities: ["selected", "other"] },
              types: ["mcp-server"],
            });
            expect(result.scope).toBe(scope);
            expect(result.requests.map((request) => request.code)).toEqual([0, 3]);
            expect(result.items[0]?.identity.scope).toBe(scope);
            expect(result.items[0]?.editing.address?.path).toBe(
              `${fixture.workspaceRoot}/axm.json`,
            );
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
  }
  it.effect("preserves a partial batch and repeated requests without repeated subjects", () => {
    const fixture = makeAuthoredExtensionFixture("skill");
    return fixture
      .provide(
        Effect.gen(function* () {
          const before = fixture.snapshot();
          const result = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["example", "absent", "example"] },
            types: ["skill"],
          });
          expect(
            result.requests.map((request) => [request.input, request.resolution, request.code]),
          ).toEqual([
            ["example", "resolved", 0],
            ["absent", "not-found", 3],
            ["example", "resolved", 0],
          ]);
          expect(result.items).toHaveLength(1);
          expect(result.items[0]?.requestRefs).toEqual(["request-1", "request-3"]);
          expect(result.items[0]?.identity).toMatchObject({ type: "skill", name: "example" });
          expect(result.items[0]?.agentOutcomes).toEqual(
            expect.arrayContaining([expect.objectContaining({ agentId: "claude-code" })]),
          );
          for (const outcome of result.items[0]?.agentOutcomes ?? []) {
            expect(outcome).not.toHaveProperty("extensionType");
            expect(outcome).not.toHaveProperty("name");
          }
          expect(result.items[0]).toMatchObject({
            editing: {
              kind: "authored-source",
              address: { path: `${fixture.root}/skills/example` },
            },
            desired: { state: "reached", direct: true },
            accepted: { state: "not-applicable" },
            observed: { state: "present" },
            retention: {
              reasons: expect.arrayContaining([
                expect.objectContaining({ kind: "authored-content" }),
                expect.objectContaining({ kind: "direct-declaration" }),
              ]),
            },
            runtime: { state: "not-checked" },
          });
          expect(Schema.decodeUnknownSync(LocalInspectionDocumentSchema)(result)).toEqual(result);
          const bulk = yield* LocalInspection.query({
            selection: { kind: "all" },
            types: ["skill"],
          });
          expect(bulk.requests[0]?.code).toBe(0);
          expect(bulk.items).toHaveLength(1);
          expect(bulk.items[0]?.editing).toEqual(result.items[0]?.editing);
          expect(bulk.items[0]?.desired).toEqual(result.items[0]?.desired);
          expect(bulk.items[0]?.observed).toEqual(result.items[0]?.observed);
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("returns no matches for an identity in another selected type", () => {
    const fixture = makeAuthoredExtensionFixture("skill");
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["example"] },
            types: ["rule"],
          });
          expect(result.requests[0]?.code).toBe(3);
          expect(result.items).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("returns an empty successful bulk query before setup", () => {
    const fixture = makeInspectionFixture();
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: { kind: "all" },
            types: ["rule"],
          });
          expect(result.requests[0]?.code).toBe(0);
          expect(result.items).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("requires source qualification when one FQN exists at two Registry authorities", () => {
    const fixture = makeInspectionFixture({
      settings: {
        sources: [
          { name: "internal", type: "registry", location: "https://internal.example.test" },
          { name: "public", type: "registry", location: "https://public.example.test" },
        ],
        mcpServers: {
          private: { source: "internal:@acme/mcps/context" },
          public: { source: "public:@acme/mcps/context" },
        },
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: {
              kind: "identities",
              identities: ["@acme/mcps/context", "internal:@acme/mcps/context"],
            },
          });
          expect(result.requests.map((request) => request.code)).toEqual([6, 0]);
          expect(result.requests[0]?.candidateRefs).toHaveLength(2);
          expect(result.items).toHaveLength(1);
          expect(result.items[0]?.identity).toMatchObject({
            name: "private",
            fqn: "@acme/mcps/context",
            source: {
              authority: "registry",
              sourceName: "internal",
              endpoint: "https://internal.example.test",
            },
          });
          expect(fixture.requests).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("does not assign the representative declaration to a competing source claim", () => {
    const fixture = makeInspectionFixture({
      settings: {
        owner: "@acme",
        defaultRegistry: "internal",
        sources: [
          { name: "internal", type: "registry", location: "https://internal.example.test" },
          { name: "public", type: "registry", location: "https://public.example.test" },
        ],
        skills: { review: { source: "public:@acme/skills/review" } },
        packs: { team: { source: "workspace" } },
      },
      lockfile: {
        skills: {
          review: makeRegistrySkillLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "review",
            endpoint: decodeRegistryEndpointSync("https://internal.example.test"),
          }),
        },
      },
      files: {
        "packs/team/pack.json": JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "team",
          version: "1.0.0",
          description: "Team bundle",
          dependencies: {
            "@acme/skills/review": {
              versionRange: "*",
              source: { type: "registry", url: "https://internal.example.test" },
            },
          },
        }),
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: {
              kind: "identities",
              identities: [
                "@acme/skills/review",
                "internal:@acme/skills/review",
                "public:@acme/skills/review",
              ],
            },
            types: ["skill"],
          });
          expect(result.requests.map((request) => request.code)).toEqual([6, 0, 0]);
          const internal = result.items.find(
            (item) => item.identity.source.endpoint === "https://internal.example.test",
          );
          const direct = result.items.find(
            (item) => item.identity.source.endpoint === "https://public.example.test",
          );
          expect(internal?.desired).toMatchObject({
            state: "unknown",
            direct: false,
            declarations: [],
            coverage: { state: "partial" },
          });
          expect(internal?.nativeLocationRefs).toEqual([]);
          expect(internal?.accepted).toMatchObject({
            state: "present",
            version: "1.0.0",
            source: { endpoint: "https://internal.example.test" },
          });
          expect(internal?.observed.state).toBe("absent");
          expect(direct?.desired).toMatchObject({
            direct: true,
            declarations: [expect.objectContaining({ source: "public:@acme/skills/review" })],
          });
          const inventory = yield* ListExtensions.query({ filter: "all", types: ["skill"] });
          const bulk = yield* LocalInspection.query({
            selection: { kind: "all" },
            types: ["skill"],
          });
          expect(bulk.items.map((item) => [item.identity.type, item.identity.name])).toEqual(
            inventory.document.items.map((item) => [item.type, item.name]),
          );
          expect(bulk.items).toHaveLength(1);
          expect(bulk.items[0]?.identity.source.endpoint).toBe("https://public.example.test");
          expect(bulk.observationDiagnostics).toContainEqual(
            expect.objectContaining({ code: "projection-collision" }),
          );
          const pack = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["team"] },
            types: ["pack"],
          });
          const member = pack.items[0]?.pack?.members[0];
          expect(member).toMatchObject({
            resolution: { status: "unresolved", reason: "conflicted-source" },
            reachability: null,
            sourceIdentity: { authority: "registry", endpoint: "https://internal.example.test" },
          });
          expect(
            pack.supportingSubjects.find((subject) => subject.id === member?.subjectRef)?.identity
              .source,
          ).toMatchObject({ authority: "registry", endpoint: "https://internal.example.test" });
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect(
    "reports colliding bare names without discarding an independently resolved request",
    () => {
      const fixture = makeInspectionFixture({
        settings: {
          skills: { review: { source: "@acme/skills/review" } },
          rules: { review: { source: "@acme/rules/review" } },
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* LocalInspection.query({
              selection: { kind: "identities", identities: ["review", "@acme/skills/review"] },
            });
            expect(result.requests.map((request) => request.code)).toEqual([6, 0]);
            expect(result.items.map((item) => item.identity.type)).toEqual(["skill"]);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
});
