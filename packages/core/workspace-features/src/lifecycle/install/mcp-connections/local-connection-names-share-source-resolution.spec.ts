import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as Schema from "effect/Schema";
import { LockfileSchema } from "@agentxm/workspace-kernel/workspace-state";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { defineSpecification } from "@agentxm/specification-metadata";

import { readSettings } from "../test-helpers.js";
import { serveBareRepository } from "../../../testing/git-repositories.js";
import { applyUpdate, configuredUpdateRequest, expectResolved } from "../../update/test-helpers.js";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/install/local-connection-names-share-source-resolution",
  title: "One registry MCP source supports multiple independently named local connections",
  statement:
    "Installing a Registry, Git, or local-path MCP server under a local name with --as shall add one connection per name, sharing one accepted resolution per source, and shall use each local name verbatim as the agent-native key; updating or reinstalling any of those connections shall match its own accepted source rather than conflict with it.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Install locally named MCP connections", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const setup = (): InstallWorld => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    world.registry.writeMcp("context", [{ version: "1.0.0" }]);
    return world;
  };

  /** The request `axm mcps install <source> --as <name>` builds. */
  const install = (source: string, localName: string) =>
    applyInstall(
      installRequest({
        type: "mcp-server",
        subject: { kind: "source", source },
        localName,
      }),
    );

  it.effect("records two local settings entries and one accepted source resolution", () => {
    const { workspace } = setup();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* install("@acme/mcps/context", "work-context");
          yield* install("@acme/mcps/context", "personal-context");

          expect(readSettings(workspace)).toMatchObject({
            mcpServers: {
              "work-context": { source: "test:@acme/mcps/context" },
              "personal-context": { source: "test:@acme/mcps/context" },
            },
          });
          const lockfile = Schema.decodeUnknownSync(LockfileSchema)(
            YAML.parse(workspace.readFile("axm-lock.yaml")),
          );
          expect(lockfile).toMatchObject({ lockfileVersion: 12 });
          if (typeof lockfile !== "object" || lockfile === null || !("mcpServers" in lockfile)) {
            throw new Error("Expected an MCP resolution map");
          }
          expect(Object.keys(lockfile.mcpServers ?? {})).toHaveLength(1);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("resolves a new connection within the range a Pack requires of its source", () => {
    const { workspace, registry } = setup();
    registry.writeMcp("context", [{ version: "1.0.0" }, { version: "2.0.0" }]);
    registry.writePack("toolkit", [
      { version: "1.0.0", dependencies: { "@acme/mcps/context": "^1.0.0" } },
    ]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: "@acme/packs/toolkit" },
            }),
          );

          yield* install("@acme/mcps/context", "personal-context");

          expect(readSettings(workspace)).toMatchObject({
            mcpServers: { "personal-context": { source: "test:@acme/mcps/context" } },
          });
          const lockfile = Schema.decodeUnknownSync(LockfileSchema)(
            YAML.parse(workspace.readFile("axm-lock.yaml")),
          );
          if (typeof lockfile !== "object" || lockfile === null || !("mcpServers" in lockfile)) {
            throw new Error("Expected an MCP resolution map");
          }
          // The Pack's member and the new connection share one resolution the Pack admits.
          expect(Object.values(lockfile.mcpServers ?? {})).toEqual([
            expect.objectContaining({ resolved: expect.objectContaining({ version: "1.0.0" }) }),
          ]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("uses each local name verbatim as the agent-native MCP key", () => {
    const { workspace } = setup();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* install("@acme/mcps/context", "work-context");
          yield* install("@acme/mcps/context", "personal-context");

          const projection: unknown = JSON.parse(workspace.readFile(".mcp.json"));
          expect(projection).toMatchObject({
            mcpServers: {
              "work-context": expect.anything(),
              "personal-context": expect.anything(),
            },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  const contextManifest = `${JSON.stringify(
    {
      owner: "@acme",
      type: "mcp-server",
      name: "context",
      version: "1.0.0",
      server: {
        name: "ai.agentxm.spec/context",
        description: "The context MCP server.",
        version: "1.0.0",
        packages: [
          {
            registryType: "npm",
            identifier: "@acme/context",
            version: "1.0.0",
            transport: { type: "stdio" },
          },
        ],
      },
    },
    null,
    2,
  )}\n`;

  it.effect.each(["path", "git"] as const)(
    "shares one %s source between two connections and reinstalls one against its own accepted source",
    (transport) =>
      Effect.gen(function* () {
        const { workspace } = setup();
        const sourceRoot = nodePath.join(workspace.root, "vendor", "context");
        fs.mkdirSync(sourceRoot, { recursive: true });
        fs.writeFileSync(nodePath.join(sourceRoot, "mcp.json"), contextManifest);
        const source =
          transport === "path"
            ? "./vendor/context"
            : yield* Effect.acquireRelease(
                Effect.promise(() => {
                  const git = (args: ReadonlyArray<string>) =>
                    execFileSync("git", args, { cwd: sourceRoot, stdio: "ignore" });
                  git(["init", "--quiet", "--initial-branch=main"]);
                  git(["config", "user.email", "test@example.com"]);
                  git(["config", "user.name", "Test"]);
                  git(["add", "."]);
                  git(["commit", "--quiet", "-m", "accepted context"]);
                  return serveBareRepository({
                    root: workspace.root,
                    source: sourceRoot,
                    name: "context",
                  });
                }),
                (served) => Effect.sync(() => served.stop()),
              ).pipe(Effect.map((served) => served.url));

        yield* workspace.provide(
          Effect.gen(function* () {
            yield* install(source, "work-context");
            yield* install(source, "personal-context");
            const resolutions = (): ReadonlyArray<string> =>
              Object.keys(
                Schema.decodeUnknownSync(LockfileSchema)(
                  YAML.parse(workspace.readFile("axm-lock.yaml")),
                ).mcpServers ?? {},
              );
            expect(resolutions()).toEqual([
              expect.stringMatching(new RegExp(`^${transport}:.*:@acme/mcps/context$`, "u")),
            ]);
            const lockBefore = workspace.readFile("axm-lock.yaml");

            // The reinstall matches the connection's own accepted source.
            const reinstalled = expectResolved(
              yield* applyUpdate(
                configuredUpdateRequest({
                  type: "mcp-server",
                  nameFilters: ["work-context"],
                  reinstall: true,
                }),
              ),
            );
            expect(
              reinstalled.units.filter((unit) => unit.state === "failed"),
              JSON.stringify(reinstalled),
            ).toEqual([]);
            expect(deriveOperationOutcome(reinstalled)).not.toBe("blocked");
            expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
          }),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    { timeout: 30_000 },
  );
});
