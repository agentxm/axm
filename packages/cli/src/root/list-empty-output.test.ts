import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../test-stubs.js";
import { expectNoPlanEnvelope, makeWorkspaceHandlerTestContext } from "../test-helpers.js";
import { handleListFiles } from "./files/list.js";
import { handleListHook } from "./hooks/list.js";
import { handleListMcpServers } from "./mcps/list.js";

describe("list command empty output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "list-empty-output-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const runEmptyList = <R>(handler: Effect.Effect<void, unknown, R>) => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handler;

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
        });
        expect(rendererState.logs).toEqual([]);
        expect(rendererState.suggestions).toEqual([]);
      }),
    );
  };

  it.effect("emits a single empty files list payload", () => runEmptyList(handleListFiles()));

  it.effect("emits a single empty hooks list payload", () => runEmptyList(handleListHook()));

  it.effect("emits a single empty MCP server list payload", () =>
    runEmptyList(handleListMcpServers({ includeIgnored: false })),
  );

  it.effect("emits files rows in machine mode without a plan envelope", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      files: {
        "workspace-baseline": {
          source: "@acme/files/workspace-baseline",
          enabled: false,
        },
      },
      lockfileFiles: {
        "workspace-baseline": {
          type: "registry",
          owner: "@acme",
          name: "workspace-baseline",
          resolvedVersion: "1.0.0",
          integrity: "sha512-AAAA==",
          sourceName: "default",
          publisherBindingId: "hbnd_test",
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListFiles();

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              name: "workspace-baseline",
              activation: "disabled",
              source: "@acme/files/workspace-baseline",
              locked: true,
              classification: { kind: "lifecycle", lifecycle: "configured" },
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });

  it.effect("emits hooks rows in machine mode without a plan envelope", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      hooks: {
        "tool-audit": {
          source: "@acme/hooks/tool-audit",
          enabled: true,
        },
      },
      lockfileHooks: {
        "tool-audit": {
          type: "registry",
          owner: "@acme",
          name: "tool-audit",
          resolvedVersion: "1.0.0",
          integrity: "sha512-AAAA==",
          sourceName: "default",
          publisherBindingId: "hbnd_test",
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListHook();

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              name: "tool-audit",
              activation: "enabled",
              source: "@acme/hooks/tool-audit",
              locked: true,
              classification: { kind: "lifecycle", lifecycle: "configured" },
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });

  it.effect("emits MCP server rows in machine mode without a plan envelope", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      mcps: {
        context: "@acme/mcps/context",
      },
    });
    fs.writeFileSync(
      path.join(tempDir, ".axm", "axm-lock.yaml"),
      YAML.stringify({
        lockfileVersion: 3,
        skills: {},
        mcpServers: {
          context: {
            type: "registry",
            owner: "@acme",
            name: "context",
            resolvedVersion: "2.3.4",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      }),
    );

    return provide(
      Effect.gen(function* () {
        yield* handleListMcpServers({ includeIgnored: false });

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              name: "context",
              activation: "enabled",
              version: "2.3.4",
              status: "enabled",
              classification: { kind: "lifecycle", lifecycle: "configured" },
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });
});
