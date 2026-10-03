import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import {
  ListExtensions,
  ShowExtension,
  listMcpServers,
} from "@agentxm/workspace-features/inspection";
import { makeWorkspaceLifecycleTestContext } from "../../test-support/test-helpers.js";

it.effect("reuses the native inventory observation for detailed MCP query results", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-native-query-")));
  const nativePath = path.join(root, ".mcp.json");
  let reads = 0;
  const fileSystemLayer = Layer.effect(
    FileSystem.FileSystem,
    Effect.map(
      FileSystem.FileSystem,
      (base) =>
        ({
          ...base,
          readFileString: (file, ...options) =>
            Effect.gen(function* () {
              if (file === nativePath) reads += 1;
              return yield* base.readFileString(file, ...options);
            }),
        }) satisfies FileSystem.FileSystem,
    ),
  );
  const fixture = makeWorkspaceLifecycleTestContext({
    wsOptions: { projectRoot: root },
    fileSystemLayer,
  });
  fs.writeFileSync(
    path.join(root, "axm.json"),
    JSON.stringify({
      agents: ["claude-code"],
      mcpServers: {
        context: {
          connection: { transport: "stdio", command: "node", args: ["server.js"], env: {} },
          enabled: true,
        },
      },
    }),
  );
  fs.writeFileSync(
    nativePath,
    JSON.stringify({ mcpServers: { context: { command: "node", args: ["server.js"] } } }),
  );
  return fixture
    .provide(
      Effect.gen(function* () {
        reads = 0;
        yield* ListExtensions.query({ filter: "all", type: "mcp-server" });
        const inventoryReads = reads;
        expect(inventoryReads).toBeGreaterThan(0);
        reads = 0;
        yield* ShowExtension.query({ type: "mcp-server", name: "context" });
        expect(reads).toBe(inventoryReads);
        reads = 0;
        yield* listMcpServers();
        expect(reads).toBe(inventoryReads);
      }),
    )
    .pipe(Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))));
});
