import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  extensionTypes,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { readExtensionManifest } from "./manifest-file.js";
import { manifestFilenameForType } from "./manifest-policy.js";

const manifests = {
  skill: { owner: "@acme", type: "skill", name: "review", version: "1.0.0" },
  "mcp-server": {
    owner: "@acme",
    type: "mcp-server",
    name: "browser",
    version: "1.0.0",
    server: { name: "io.agentxm/browser", description: "Browser MCP", version: "1.0.0" },
  },
  subagent: { owner: "@acme", type: "subagent", name: "researcher", version: "1.0.0" },
  pack: { owner: "@acme", type: "pack", name: "starter", version: "1.0.0", dependencies: {} },
  rule: { owner: "@acme", type: "rule", name: "policy", version: "1.0.0" },
  hook: {
    owner: "@acme",
    type: "hook",
    name: "audit",
    version: "1.0.0",
    runtime: "bash",
    entrypoint: "src/hook.sh",
    bindings: [{ on: "turn.end", requires: { decision: { kind: "block" } } }],
  },
  knowledge: {
    owner: "@acme",
    type: "knowledge",
    name: "handbook",
    version: "1.0.0",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  },
} satisfies Record<ExtensionType, object>;

layer(NodeServices.layer, { excludeTestServices: true })("readExtensionManifest", (it) => {
  it.effect("reads and validates every manifest kind", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();

      for (const type of extensionTypes) {
        const directory = path.join(root, type);
        yield* fs.makeDirectory(directory);
        const fileName = manifestFilenameForType(type);
        yield* fs.writeFileString(path.join(directory, fileName), JSON.stringify(manifests[type]));

        const result = yield* readExtensionManifest(directory, type);
        expect(result.fileName).toBe(fileName);
        expect(result.path).toBe(path.join(directory, fileName));
        expect(result.identity.type).toBe(type);
        expect(result.identity.owner).toBe("@acme");
      }
    }).pipe(Effect.scoped),
  );

  it.effect("distinguishes missing, unreadable, and invalid JSON manifests", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const missing = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(missing.code).toBe("manifest_missing");

      const manifestPath = path.join(root, "skill.json");
      yield* fs.makeDirectory(manifestPath);
      const unreadable = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(unreadable.code).toBe("manifest_unreadable");
      expect(unreadable.cause).toBeDefined();

      yield* fs.remove(manifestPath, { recursive: true });
      yield* fs.writeFileString(manifestPath, "{not json");
      const invalid = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(invalid.code).toBe("manifest_invalid_json");
    }).pipe(Effect.scoped),
  );

  it.effect("rejects schema-invalid and mismatched declared types", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const manifestPath = path.join(root, "skill.json");
      yield* fs.writeFileString(
        manifestPath,
        JSON.stringify({ owner: "@acme", type: "skill", version: "1.0.0" }),
      );
      const missingName = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(missingName.code).toBe("manifest_schema_invalid");
      expect(missingName.details).toBeDefined();

      yield* fs.writeFileString(
        manifestPath,
        JSON.stringify({ owner: "@acme", type: "subagent", name: "review", version: "1.0.0" }),
      );
      const wrongType = yield* Effect.flip(readExtensionManifest(root, "skill"));
      expect(wrongType.code).toBe("manifest_schema_invalid");
    }).pipe(Effect.scoped),
  );

  it.effect("fills only an absent owner from the caller's default", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const manifestPath = path.join(root, "skill.json");
      yield* fs.writeFileString(
        manifestPath,
        JSON.stringify({ type: "skill", name: "review", version: "1.0.0" }),
      );
      const defaultOwner = decodeHandleSync("@acme");
      const filled = yield* readExtensionManifest(root, "skill", { defaultOwner });
      expect(filled.identity.owner).toBe("@acme");
      expect(filled.raw).toMatchObject({ owner: "@acme" });

      yield* fs.writeFileString(manifestPath, JSON.stringify(manifests.skill));
      const preserved = yield* readExtensionManifest(root, "skill", {
        defaultOwner: decodeHandleSync("@other"),
      });
      expect(preserved.identity.owner).toBe("@acme");
    }).pipe(Effect.scoped),
  );
});
