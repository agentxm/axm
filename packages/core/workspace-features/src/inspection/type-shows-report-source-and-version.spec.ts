import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ManifestIdentitySchema } from "@agentxm/extension-content";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeFileRegistry } from "@agentxm/registry-client/testing";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { McpSourceKey } from "@agentxm/workspace-kernel/workspace-state";
import { makeRegistryMcpServerLockEntry } from "@agentxm/workspace-kernel/workspace-state/testing";
import { LocalInspection } from "./index.js";
import {
  AUTHORING_TYPES,
  authoredManifestPath,
  makeAuthoredExtensionFixture,
  type AuthoringType,
  inspectionRegistryUrl,
  makeInspectionFixture,
} from "./testing.js";
import {
  installRegistrySkill,
  makeInstalledWorkspace,
} from "./test-support/installed-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/type-shows-report-source-and-version",
  title: "Type inspection distinguishes source and observed version",
  statement:
    "When inspecting one configured skill, MCP server, subagent, rule, hook, or Knowledge bundle, AXM shall report its local identity, activation, source, and accepted version separately from the matching observed manifest version.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundaryRationale:
    "Production workspace services execute over native temporary files and directories; the default examples observe their state and outcomes without a separate CLI process.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/shared/extension-show.test.ts",
    "packages/core/workspace-features/src/inspection/show/local-inspection.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Packs report membership rather than a single source; `packs show` covers them. */
const shownTypes: ReadonlyArray<Exclude<AuthoringType, "pack">> = AUTHORING_TYPES.filter(
  (type): type is Exclude<AuthoringType, "pack"> => type !== "pack",
);

describe("Installed extension detail", () => {
  // No resolution exists for an authored package, so the version reported must
  // come from the manifest on disk. The expectation reads that manifest back
  // rather than restating a literal, so a report that stopped consulting it
  // fails here instead of agreeing with the fixture.
  for (const type of shownTypes)
    it.effect(`authored ${type}`, () => {
      const fixture = makeAuthoredExtensionFixture(type);
      const manifest = Schema.decodeUnknownSync(ManifestIdentitySchema)(
        JSON.parse(fixture.readFile(authoredManifestPath(type, "example"))),
      );
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* LocalInspection.query({
              selection: { kind: "identities", identities: ["example"] },
              types: [type],
            });
            expect(result.items[0]).toMatchObject({
              identity: {
                type,
                name: "example",
                scope: "project",
                source: { authority: "workspace" },
              },
              desired: { enabled: true },
              accepted: { state: "not-applicable" },
              observed: { manifestVersion: manifest.version },
            });
            expect(Array.isArray(result.items[0]?.agentOutcomes)).toBe(true);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });

  // A sourced MCP connection is shown under its local name, while its
  // accepted resolution is recorded once under the source it resolves to.
  it.effect("reports a sourced MCP connection's accepted version under its local name", () => {
    const authority = decodeRegistryEndpointSync(inspectionRegistryUrl);
    const fixture = makeInspectionFixture({
      settings: {
        agents: [],
        defaultRegistry: "test",
        sources: [{ name: "test", type: "registry", location: inspectionRegistryUrl }],
        mcpServers: { context: { source: "@acme/mcps/context@^1.0.0", enabled: true } },
      },
      lockfile: {
        mcpServers: {
          [McpSourceKey.encode({
            kind: "registry",
            endpoint: authority,
            owner: "@acme",
            name: "context",
          })]: makeRegistryMcpServerLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "context",
            resolvedVersion: decodeVersionSync("1.2.0"),
            endpoint: authority,
          }),
        },
      },
      files: {
        "agent_extensions/registry.agentxm.ai/@acme/mcps/context/mcp.json": JSON.stringify({
          owner: "@acme",
          type: "mcp-server",
          name: "context",
          version: "1.2.0",
          server: {
            name: "io.github.acme/context",
            description: "Context server",
            version: "1.2.0",
            remotes: [{ type: "streamable-http", url: "https://mcp.acme.test/context" }],
          },
        }),
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["context"] },
            types: ["mcp-server"],
          });
          expect(result.items[0]).toMatchObject({
            identity: { name: "context", source: { locator: "@acme/mcps/context@^1.0.0" } },
            accepted: { state: "present", version: "1.2.0" },
          });
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  // The arrangement is an installation, not a lockfile written by hand: the
  // source and version below are what installing recorded, so this example
  // fails if a shown extension ever stops reporting what it was installed from.
  it.effect("reports an installation's accepted version", () => {
    const registry = makeFileRegistry();
    registry.writeSkill("review", [{ version: "1.2.3", body: "Review instructions." }]);
    const workspace = makeInstalledWorkspace({ sources: [registry.source] });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installRegistrySkill({ name: "review", source: "test:@acme/skills/review" });
          const result = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["review"] },
            types: ["skill"],
          });
          expect(result.items[0]).toMatchObject({
            identity: { name: "review", source: { locator: "test:@acme/skills/review" } },
            accepted: { state: "present", version: "1.2.3" },
          });
        }),
      )
      .pipe(
        Effect.ensuring(
          Effect.sync(() => {
            workspace.cleanup();
            registry.cleanup();
          }),
        ),
      );
  });
});
