import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, expect, layer } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeUpdateCheckCache } from "./index.js";

layer(NodeServices.layer, { excludeTestServices: true })("validated update-cache adapter", (it) => {
  let tempDir: string;
  let cachePath: string;
  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "update-check-test-"));
    cachePath = nodePath.join(tempDir, "nested", "update-check.json");
  });
  afterEach(() => nodeFs.rmSync(tempDir, { recursive: true, force: true }));

  const cache = Effect.gen(function* () {
    return makeUpdateCheckCache(cachePath, yield* FileSystem.FileSystem, yield* Path.Path);
  });

  it.effect("returns no snapshot for missing, malformed, superseded, or unstable cache data", () =>
    Effect.gen(function* () {
      const store = yield* cache;
      expect(yield* store.read()).toEqual(Option.none());
      nodeFs.mkdirSync(nodePath.dirname(cachePath), { recursive: true });
      const now = DateTime.formatIso(yield* DateTime.now);
      for (const content of [
        "not json",
        JSON.stringify({ latestVersion: "1.2.3", checkedAt: now }),
        JSON.stringify({
          schema: "axm.update-check-cache/v2",
          channel: "stable",
          document: { version: "1.2.3" },
          etag: null,
          validatedAt: now,
        }),
        JSON.stringify({
          schema: "axm.update-check-cache/v3",
          source: "github-latest",
          version: "1.2.3-beta.1",
          validatedAt: now,
        }),
      ]) {
        nodeFs.writeFileSync(cachePath, content);
        expect(yield* store.read()).toEqual(Option.none());
      }
    }),
  );

  it.effect("round-trips the owner's snapshot while keeping physical schema fields private", () =>
    Effect.gen(function* () {
      const store = yield* cache;
      const snapshot = { version: "1.2.3", validatedAt: yield* DateTime.now };
      yield* store.write(snapshot);
      expect(yield* store.read()).toEqual(Option.some(snapshot));
      expect(JSON.parse(nodeFs.readFileSync(cachePath, "utf8"))).toMatchObject({
        schema: "axm.update-check-cache/v3",
        source: "github-latest",
        version: "1.2.3",
      });
      expect(nodeFs.readdirSync(nodePath.dirname(cachePath))).toEqual(["update-check.json"]);
    }),
  );

  it.effect("reports storage failure through the owner-defined error", () =>
    Effect.gen(function* () {
      nodeFs.writeFileSync(nodePath.dirname(cachePath), "a file blocks directory creation");
      const store = yield* cache;
      const error = yield* Effect.flip(
        store.write({ version: "1.2.3", validatedAt: yield* DateTime.now }),
      );
      expect(error._tag).toBe("UpdateCheckUnavailable");
      expect(error.operation).toBe("cache-write");
    }),
  );
});
