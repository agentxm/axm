import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { decodeMcpServerManifestAt, readMcpServerManifestAt } from "./manifest.js";

const validManifest = {
  owner: "@acme",
  type: "mcp-server",
  name: "context",
  version: "1.0.0",
  server: {
    name: "ai.acme/context",
    description: "Context",
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
};

const withManifestDirectory = <A, E, R>(use: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-mcp-manifest-test-" });
      return yield* use(root);
    }),
  ).pipe(Effect.provide(NodeServices.layer));

describe("MCP manifest reader", () => {
  it.effect("returns none only when the manifest is absent", () =>
    withManifestDirectory((root) =>
      Effect.gen(function* () {
        const result = yield* readMcpServerManifestAt(root);
        expect(Option.isNone(result)).toBe(true);
      }),
    ),
  );

  it.effect("reports invalid JSON with a typed failure", () =>
    withManifestDirectory((root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(path.join(root, "mcp.json"), "{");
        const result = yield* Effect.result(readMcpServerManifestAt(root));
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure._tag).toBe("McpConfigInvalid");
      }),
    ),
  );

  it.effect("reports schema failures with a typed failure", () =>
    withManifestDirectory((root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(path.join(root, "mcp.json"), JSON.stringify({ server: {} }));
        const result = yield* Effect.result(decodeMcpServerManifestAt(path.join(root, "mcp.json")));
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure._tag).toBe("McpConfigInvalid");
      }),
    ),
  );

  it.effect("decodes a valid manifest", () =>
    withManifestDirectory((root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(path.join(root, "mcp.json"), JSON.stringify(validManifest));
        const result = yield* readMcpServerManifestAt(root);
        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) expect(result.value.name).toBe("context");
      }),
    ),
  );
});
