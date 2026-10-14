import { LockfileSchema } from "@agentxm/workspace-kernel/workspace-state";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import * as Schema from "effect/Schema";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import {
  computeMaterializedTreeIntegrity,
  computePackManifestContentIdentity,
  McpSourceKey,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  makeRegistryMcpServerLockEntry,
  makeRegistryPackLockEntry,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { ShowPack } from "./show-pack.js";
import {
  inspectionRegistryUrl,
  makeAcceptedPackFixture,
  makeAuthoredPackFixture,
  makeInspectionFixture,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/packs/show/reports-authored-membership-and-observed-state",
  title: "Pack inspection reports declared members and observed state",
  statement:
    "When inspecting a configured pack, AXM shall report the pack\u2019s source authority, canonical manifest, and, for each declared member, its authored declaration (constraint and explicit Registry endpoint or inherited source), the local names it is held under, the source identity it is bound to, its resolution status (accepted, authored, or unresolved with a reason), and its desired reachability judged from the canonical observation of the member: satisfying when the member is desired and its accepted or authored version is inside this pack\u2019s range, excluded when that version is outside it, and missing when no desired route reaches it; inspection shall never invent an accepted resolution or expose a resolution key.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/workspace-features/src/inspection/packs/show-pack.ts",
    "apps/cli-e2e/src/scope-consistency.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack state inspection", () => {
  for (const target of ["toolkit", "@acme/packs/toolkit"])
    it.effect(target, () => {
      const fixture = makeAuthoredPackFixture({
        dependencies: {
          "@acme/skills/review": ">=1.2.3",
          "@acme/skills/test-helper": ">=1.2.3",
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = fixture.snapshot();
            const result = yield* ShowPack.query({ target });
            expect(result).toMatchObject({
              scope: "project",
              pack: "@acme/packs/toolkit",
              sourceAuthority: "workspace",
              manifestVersion: "0.0.1",
              acceptedResolution: "authored",
              desiredDependencies: expect.arrayContaining([
                expect.objectContaining({
                  fqn: "@acme/skills/review",
                  declaration: { constraint: ">=1.2.3", endpoint: null },
                  localNames: ["review"],
                  reachability: "satisfying",
                }),
                expect.objectContaining({
                  fqn: "@acme/skills/test-helper",
                  declaration: { constraint: ">=1.2.3", endpoint: null },
                  localNames: ["test-helper"],
                  reachability: "satisfying",
                }),
              ]),
            });
            expect(result.canonicalPath).toBe(`${fixture.root}/packs/toolkit/pack.json`);
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });

  it.effect("reports a member the pack's own range excludes, with the version it judged", () => {
    const fixture = makeInspectionFixture({
      settings: {
        agents: [],
        owner: "@acme",
        packs: { toolkit: { source: "workspace", enabled: true } },
        skills: { review: { source: "workspace", enabled: true } },
      },
      files: {
        "packs/toolkit/pack.json": JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "toolkit",
          version: "0.0.1",
          dependencies: { "@acme/skills/review": ">=2.0.0" },
        }),
        "skills/review/skill.json": JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.5.0",
        }),
        "skills/review/src/SKILL.md": "---\nname: review\ndescription: Review\n---\n# review\n",
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* ShowPack.query({ target: "toolkit" });
          expect(result.desiredDependencies).toEqual([
            {
              fqn: "@acme/skills/review",
              declaration: { constraint: ">=2.0.0", endpoint: null },
              localNames: ["review"],
              sourceIdentity: {
                authority: "workspace",
                fqn: "@acme/skills/review",
                endpoint: null,
                locator: null,
              },
              resolution: { status: "authored" },
              version: "1.5.0",
              reachability: "excluded",
            },
          ]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect.each([
    { declared: "inherited", declaration: "^1.0.0", endpoint: null },
    {
      declared: "explicit",
      declaration: {
        versionRange: "^1.0.0",
        source: { type: "registry", url: inspectionRegistryUrl },
      },
      endpoint: inspectionRegistryUrl,
    },
  ] as const)(
    "reports a Pack-declared $declared Registry MCP member, its connections, and an unresolved member",
    ({ declaration, endpoint: declaredEndpoint }) => {
      const endpoint = decodeRegistryEndpointSync(inspectionRegistryUrl);
      const owner = decodeHandleSync("@acme");
      const manifest = {
        owner: "@acme",
        type: "pack",
        name: "toolkit",
        version: "2.3.4",
        dependencies: { "@acme/mcps/context": declaration, "@acme/skills/missing": "^1.0.0" },
      };
      // An MCP source's accepted row is keyed by its resolution key, derived
      // from the member's bound identity; inspection never shows the key.
      const resolutionKey = McpSourceKey.encode({
        kind: "registry",
        endpoint,
        owner,
        name: "context",
      });
      const fixture = makeInspectionFixture({
        settings: {
          agents: [],
          defaultRegistry: "test",
          sources: [{ name: "test", type: "registry", location: inspectionRegistryUrl }],
          packs: { toolkit: { source: "@acme/packs/toolkit@2.3.4", enabled: true } },
          // A second local connection to the same source shares its resolution.
          mcpServers: {
            "work-context": {
              source: "test:@acme/mcps/context@^1.0.0",
              distribution: {
                kind: "remote",
                transport: "streamable-http",
                url: "https://mcp.acme.test/mcp",
              },
            },
          },
        },
        lockfile: {
          packs: {
            toolkit: makeRegistryPackLockEntry({
              owner,
              name: "toolkit",
              resolvedVersion: decodeVersionSync("2.3.4"),
              endpoint,
              dependencies: Schema.decodeUnknownSync(PackManifestSchema)(manifest).dependencies,
              sourceHash: computePackManifestContentIdentity(
                Schema.decodeUnknownSync(PackManifestSchema)(manifest),
              ),
            }),
          },
          mcpServers: {
            [resolutionKey]: makeRegistryMcpServerLockEntry({ owner, name: "context", endpoint }),
          },
        },
        files: {
          [`agent_extensions/${new URL(inspectionRegistryUrl).hostname}/@acme/packs/toolkit/pack.json`]:
            JSON.stringify(manifest),
          [`agent_extensions/${new URL(inspectionRegistryUrl).hostname}/@acme/mcps/context/mcp.json`]:
            JSON.stringify({
              owner: "@acme",
              type: "mcp-server",
              name: "context",
              version: "1.0.0",
              server: { name: "io.acme/context", description: "Context server", version: "1.0.0" },
            }),
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            // Accept the materialized MCP package exactly as written.
            const treeIntegrity = yield* computeMaterializedTreeIntegrity(
              `${fixture.root}/agent_extensions/${new URL(inspectionRegistryUrl).hostname}/@acme/mcps/context`,
            );
            const lockfile = Schema.decodeUnknownSync(LockfileSchema)(
              JSON.parse(fixture.readFile("axm-lock.yaml")),
            );
            const accepted = lockfile.mcpServers?.[resolutionKey];
            if (accepted === undefined) throw new Error("Expected accepted MCP");
            fixture.writeFile(
              "axm-lock.yaml",
              JSON.stringify(
                Schema.encodeSync(LockfileSchema)({
                  ...lockfile,
                  mcpServers: { [resolutionKey]: { ...accepted, treeIntegrity } },
                }),
              ),
            );
            const lockBefore = fixture.readFile("axm-lock.yaml");

            const result = yield* ShowPack.query({ target: "toolkit" });
            expect(result.desiredDependencies).toEqual([
              {
                fqn: "@acme/mcps/context",
                declaration: { constraint: "^1.0.0", endpoint: declaredEndpoint },
                localNames: ["context", "work-context"],
                sourceIdentity: {
                  authority: "registry",
                  fqn: "@acme/mcps/context",
                  endpoint: inspectionRegistryUrl,
                  locator: null,
                },
                resolution: { status: "accepted" },
                version: "1.0.0",
                reachability: "satisfying",
              },
              {
                fqn: "@acme/skills/missing",
                declaration: { constraint: "^1.0.0", endpoint: null },
                localNames: ["missing"],
                sourceIdentity: {
                  authority: "registry",
                  fqn: "@acme/skills/missing",
                  endpoint: inspectionRegistryUrl,
                  locator: null,
                },
                resolution: { status: "unresolved", reason: "not-accepted" },
                version: null,
                reachability: "satisfying",
              },
            ]);
            expect(JSON.stringify(result)).not.toContain(resolutionKey);
            // Inspection invents no accepted row.
            expect(fixture.readFile("axm-lock.yaml")).toBe(lockBefore);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );

  it.effect("reports a Registry pack's accepted resolution", () => {
    const fixture = makeAcceptedPackFixture();
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* ShowPack.query({ target: "@acme/packs/toolkit" });
          expect(result).toMatchObject({
            pack: "@acme/packs/toolkit",
            sourceAuthority: "registry",
            acceptedResolution: "accepted",
            manifestVersion: "2.3.4",
            desiredDependencies: [],
          });
          expect(result.canonicalPath).toBe(
            `${fixture.root}/agent_extensions/${new URL(inspectionRegistryUrl).hostname}/@acme/packs/toolkit/pack.json`,
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
