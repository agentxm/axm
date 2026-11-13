import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  makeRegistrySkillLockEntry,
  makeRegistryMcpServerLockEntry,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { LocalInspection } from "../index.js";
import { inspectionRegistryUrl, makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/show/explains-independent-retention",
  title: "Local inspection distinguishes desired routes, shared consumers, and accepted records",
  statement:
    "Local inspection shall report every established direct and Pack retention route and shared package consumer independently, without treating an accepted-only record as desired or physically present.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Real workspace readers join isolated authored Pack manifests, declarations and accepted rows; examples observe emitted facts without reconstructing private lock keys.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Independent retention", () => {
  it.effect(
    "retains unreachable Hook code referenced by native configuration without claiming ownership or runtime health",
    () => {
      const fixture = makeInspectionFixture({
        settings: {
          defaultRegistry: "test",
          sources: [{ name: "test", type: "registry", location: inspectionRegistryUrl }],
        },
        lockfile: {
          hooks: {
            audit: makeRegistrySkillLockEntry({
              owner: decodeHandleSync("@acme"),
              name: "audit",
              endpoint: decodeRegistryEndpointSync(inspectionRegistryUrl),
            }),
          },
        },
      });
      const packageRoot = `agent_extensions/${new URL(inspectionRegistryUrl).hostname}/@acme/hooks/audit`;
      fixture.writeFile(`${packageRoot}/src/check.sh`, "exit 0\n");
      fixture.writeFile(
        ".claude/settings.json",
        JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `sh -c '${fixture.root}/${packageRoot}/src/check.sh && echo done'`,
                  },
                ],
              },
            ],
          },
        }),
      );
      fixture.writeFile(
        ".mcp.json",
        JSON.stringify({
          mcpServers: {
            foreign: { command: "bash", args: [`${fixture.root}/${packageRoot}/src/check.sh`] },
          },
        }),
      );
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* LocalInspection.query({
              selection: { kind: "identities", identities: ["audit"] },
              types: ["hook"],
            });
            const item = result.items[0];
            expect(item).toMatchObject({
              desired: { state: "not-reached" },
              accepted: { state: "present" },
              observed: { state: "present" },
              runtime: { state: "not-checked" },
            });
            expect(item?.retention.reasons.map((reason) => reason.kind).sort()).toEqual([
              "native-reference",
              "possible-native-reference",
            ]);
            for (const reason of item?.retention.reasons ?? []) {
              const evidence = result.nativeLocations.find(
                (unit) => unit.id === reason.locationRef,
              );
              expect(evidence?.ownership).toBe("unverified");
              expect(
                result.nativeReaderDeclarations.find(
                  (declaration) => declaration.id === evidence?.readerDeclarationRef,
                )?.potentialReaders,
              ).toContain("claude-code");
            }
            expect(result.nativeLocations).toContainEqual(
              expect.objectContaining({
                address: {
                  kind: "key-path",
                  path: `${fixture.root}/.mcp.json`,
                  keys: ["mcpServers", "foreign"],
                },
              }),
            );
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.requests).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
  it.effect("reports one direct declaration and both Pack routes", () => {
    const pack = (name: string) =>
      JSON.stringify({
        owner: "@acme",
        name,
        type: "pack",
        version: "1.0.0",
        description: name,
        dependencies: { "@acme/skills/review": "*" },
      });
    const fixture = makeInspectionFixture({
      settings: {
        owner: "@acme",
        defaultRegistry: "test",
        sources: [{ name: "test", type: "registry", location: inspectionRegistryUrl }],
        skills: { review: { source: "test:@acme/skills/review" } },
        packs: { team: { source: "workspace" }, audit: { source: "workspace" } },
      },
      files: { "packs/team/pack.json": pack("team"), "packs/audit/pack.json": pack("audit") },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["review"] },
            types: ["skill"],
          });
          const item = result.items[0];
          expect(item?.desired).toMatchObject({
            state: "reached",
            direct: true,
            packOrigins: ["@acme/packs/audit", "@acme/packs/team"],
          });
          expect(item?.retention.reasons.map((reason) => reason.kind).sort()).toEqual([
            "direct-declaration",
            "pack-route",
            "pack-route",
          ]);
          expect(result.supportingSubjects.map((subject) => subject.identity.fqn).sort()).toEqual([
            "@acme/packs/audit",
            "@acme/packs/team",
          ]);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("does not infer desired reachability or presence from an accepted-only record", () => {
    const fixture = makeInspectionFixture({
      settings: {},
      lockfile: {
        skills: {
          retained: makeRegistrySkillLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "retained",
            endpoint: decodeRegistryEndpointSync(inspectionRegistryUrl),
          }),
        },
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["retained"] },
            types: ["skill"],
          });
          expect(result.items[0]).toMatchObject({
            desired: { state: "not-reached", direct: false },
            accepted: { state: "present" },
            observed: { state: "absent" },
            editing: { kind: "authoring-transition-required" },
          });
          const bulk = yield* LocalInspection.query({
            selection: { kind: "all" },
            types: ["skill"],
          });
          expect(bulk.items).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("keeps both MCP aliases and identifies their shared package", () => {
    const fixture = makeInspectionFixture({
      settings: {
        defaultRegistry: "test",
        sources: [{ name: "test", type: "registry", location: inspectionRegistryUrl }],
        mcpServers: {
          work: { source: "test:@acme/mcps/context" },
          personal: { source: "test:@acme/mcps/context" },
        },
      },
      lockfile: {
        mcpServers: {
          [`registry:${encodeURIComponent(inspectionRegistryUrl)}:@acme/mcps/context`]:
            makeRegistryMcpServerLockEntry({
              owner: decodeHandleSync("@acme"),
              name: "context",
              endpoint: decodeRegistryEndpointSync(inspectionRegistryUrl),
            }),
        },
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["test:@acme/mcps/context"] },
          });
          expect(result.requests[0]?.code).toBe(0);
          expect(result.items.map((item) => item.identity.name).sort()).toEqual([
            "personal",
            "work",
          ]);
          for (const item of result.items)
            expect(item.retention.reasons).toContainEqual(
              expect.objectContaining({
                kind: "shared-package-consumer",
                contributorRef: result.items.find((other) => other.id !== item.id)?.id,
              }),
            );
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
