import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-stubs.js";
import { expectPublishResult, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handlePublishMcpServer } from "./publish.js";

const createManagedMcpServer = (baseDir: string, owner: string, name: string) => {
  const extensionDir = path.join(baseDir, ".axm", "extensions", owner, "mcps", name);
  const srcDir = path.join(extensionDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(extensionDir, "mcp.json"),
    JSON.stringify(
      {
        owner,
        type: "mcp-server",
        name,
        version: "1.0.0",
        server: {
          name: `io.github.test/${name}`,
          description: `MCP server ${name}`,
          version: "1.0.0",
          packages: [
            {
              registryType: "npm",
              identifier: `@test/${name}`,
              version: "1.0.0",
              transport: { type: "stdio" },
            },
          ],
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(srcDir, "README.md"), `# ${name}\n`);
};

describe("mcps publish output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcps-publish-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("emits publish plan JSON in machine mode without human success logs", () => {
    const { provide, logs, rendererState } = makeWorkspaceHandlerTestContext({
      machine: true,
    });
    const registryRoot = path.join(tempDir, "registry");
    fs.mkdirSync(registryRoot, { recursive: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      owner: "@test",
      sources: [{ name: "local", type: "registry", location: new URL(`file://${registryRoot}`) }],
    });
    createManagedMcpServer(tempDir, "@test", "machine-mcp");

    return provide(
      Effect.gen(function* () {
        yield* handlePublishMcpServer({
          name: "@test/mcps/machine-mcp",
          registry: "local",
          yes: true,
          preview: false,
        });

        expect(logs.success).toEqual([]);
        const result = expectPublishResult(rendererState.results[0]?.data, {
          mode: "apply",
          count: 1,
        });
        expect(result).toMatchObject({
          results: [
            {
              owner: "@test",
              type: "mcp-server",
              name: "machine-mcp",
              version: "1.0.0",
              action: "publish",
              status: "success",
              message: "Published @test/mcps/machine-mcp@1.0.0",
            },
          ],
        });
        expect(rendererState.suggestions).toEqual([
          {
            description: "View published metadata",
            cmd: "axm view @test/mcps/machine-mcp",
          },
        ]);
      }),
    );
  });
});
