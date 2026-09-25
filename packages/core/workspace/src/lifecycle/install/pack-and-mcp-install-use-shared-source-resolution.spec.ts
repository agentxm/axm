import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { deriveOperationOutcome } from "../../transitions/planning/index.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
  type InstallWorld,
} from "./test-helpers.js";

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
          // A disk-sourced MCP server's accepted row is not reachable from
          // its desired node, so the repeat re-acquires the package and
          // reports the copy it made; `cli/install/reinstall-is-idempotent`
          // covers the Registry route.
          expect(deriveOperationOutcome(yield* applyInstall(request))).toBe("applied");
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
});
