import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { LockfileSchema, parseLockfileToml } from "@agentxm/workspace-kernel/workspace-state";
import { readSettings } from "./test-helpers.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "install/pack-and-mcp-use-shared-source-resolution",
  title: "Pack and MCP installs use the shared source grammar",
  statement:
    "Pack and MCP server install shall resolve Registry, Git, and path locators through the shared source resolver, shall persist accepted external source authority, and shall reject unsupported per-type settings sources during schema parsing.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "The examples execute real local package discovery, planning, materialization, settings writes, lock writes, postconditions, and repeated MCP source admission through the public install use case.",
  methods: ["example", "invariant"],
  derivedFrom: [
    "extension-installability/source-family-policy-is-total",
    "extension-discovery/all-manifest-kinds-from-git-and-path",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack and MCP shared source resolution", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = (): InstallWorld => {
    const created = makeInstallWorld({ settings: { agents: [] } });
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("installs and repeats an MCP server from a local package path", () => {
    const created = world();
    const source = nodePath.join(created.workspace.root, "fixtures", "local-server");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(
      nodePath.join(source, "mcp.json"),
      JSON.stringify({
        owner: "@acme",
        type: "mcp-server",
        name: "local-server",
        version: "1.0.0",
        server: {
          name: "io.acme/local-server",
          description: "A local MCP server",
          version: "1.0.0",
          remotes: [{ type: "streamable-http", url: "https://example.com/mcp" }],
        },
      }),
    );

    return created.workspace
      .provide(
        Effect.gen(function* () {
          const request = installRequest({
            type: "mcp-server",
            subject: { kind: "source", source },
          });
          expect(deriveOperationOutcome(yield* applyInstall(request))).toBe("applied");
          // The repeat re-acquires the package from disk, but an identical
          // tree is not a change (see `cli/install/reinstall-is-idempotent`).
          const repeated = yield* applyInstall(request);
          expect(deriveOperationOutcome(repeated), JSON.stringify(repeated)).toBe("no-op");
          expect(JSON.stringify(readSettings(created.workspace))).toContain(
            "fixtures/local-server",
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("installs a pack from a local package path", () => {
    const created = world();
    const source = nodePath.join(created.workspace.root, "fixtures", "local-pack");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(
      nodePath.join(source, "pack.json"),
      JSON.stringify({
        owner: "@acme",
        type: "pack",
        name: "local-pack",
        version: "1.0.0",
        description: "A local pack",
        dependencies: {},
      }),
    );

    return created.workspace
      .provide(
        Effect.gen(function* () {
          const resolution = yield* applyInstall(
            installRequest({ type: "pack", subject: { kind: "source", source } }),
          );
          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(JSON.stringify(readSettings(created.workspace))).toContain("fixtures/local-pack");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "shares one accepted resolution between an explicit Pack member and a settings connection",
    () => {
      const created = world();
      created.registry.writeMcp("context", [{ version: "1.0.0" }]);
      const source = nodePath.join(created.workspace.root, "fixtures", "toolkit");
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(
        nodePath.join(source, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "toolkit",
          version: "1.0.0",
          description: "A local pack naming its member's Registry",
          dependencies: {
            // The member names the Registry by its endpoint, spelled with a
            // trailing slash, rather than inheriting the Pack's source.
            "@acme/mcps/context": {
              source: { type: "registry", url: `${created.registry.url}/` },
              versionRange: "^1.0.0",
            },
          },
        }),
      );

      return created.workspace
        .provide(
          Effect.gen(function* () {
            const resolutions = (): ReadonlyArray<string> =>
              Object.keys(
                Schema.decodeUnknownSync(LockfileSchema)(
                  parseLockfileToml(created.workspace.readFile("axm.lock")),
                ).mcpServers ?? {},
              );
            const accepted = `registry:${encodeURIComponent(created.registry.endpoint.href)}:@acme/mcps/context`;
            const pack = yield* applyInstall(
              installRequest({ type: "pack", subject: { kind: "source", source } }),
            );
            expect(deriveOperationOutcome(pack), JSON.stringify(pack)).toBe("applied");
            expect(resolutions()).toEqual([accepted]);

            // The settings declaration reaches the same Registry through its
            // configured source name, and shares the member's resolution.
            const connection = yield* applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: "test:@acme/mcps/context" },
                localName: "personal-context",
              }),
            );
            expect(deriveOperationOutcome(connection), JSON.stringify(connection)).toBe("applied");
            expect(JSON.stringify(readSettings(created.workspace))).toContain("personal-context");
            expect(resolutions()).toEqual([accepted]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
