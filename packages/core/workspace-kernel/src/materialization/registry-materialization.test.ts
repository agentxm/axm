import { zipSync } from "fflate";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { sha512Integrity } from "@agentxm/host-primitives";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  makeFileRegistry,
  OfflineHttpClient,
  RegistryClientFactoryTest,
} from "@agentxm/registry-client/testing";
import { materializeRegistryPackageWithTreeIntegrity } from "./index.js";

const platform = Layer.provideMerge(
  RegistryClientFactoryTest(OfflineHttpClient),
  NodeServices.layer,
);

describe("Registry package payload fidelity", () => {
  it.effect("retains executable modes, empty directories, and contained links", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() => makeFileRegistry()),
        (registry) => Effect.sync(() => registry.cleanup()),
      );
      registry.writeSkill("review", [{ version: "1.0.0", body: "Review" }]);
      const archivePath = registry.storedFiles().find((file) => file.endsWith("1.0.0.zip"));
      if (archivePath === undefined) return yield* Effect.die(new Error("Fixture archive missing"));
      const encode = (text: string) => new TextEncoder().encode(text);
      const archive = zipSync({
        "skill.json": encode('{"owner":"@acme","type":"skill","name":"review","version":"1.0.0"}'),
        "src/SKILL.md": encode("# Review\r\n"),
        "src/run": [encode("#!/bin/sh\necho review\n"), { os: 3, attrs: 0o100755 << 16 }],
        "src/run-link": [encode("run"), { os: 3, attrs: 0o120777 << 16 }],
        "src/cycle": [encode("."), { os: 3, attrs: 0o120777 << 16 }],
        "src/a": [encode("b"), { os: 3, attrs: 0o120777 << 16 }],
        "src/b": [encode("a"), { os: 3, attrs: 0o120777 << 16 }],
        "src/empty/": new Uint8Array(),
      });
      yield* fs.writeFile(path.join(registry.root, archivePath), archive);
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "axm-registry-payload-" });
      const destinationPath = path.join(baseDir, "package");
      const result = yield* materializeRegistryPackageWithTreeIntegrity({
        baseDir,
        destinationPath,
        transient: true,
        sourceLocation: new URL(registry.url),
        owner: decodeHandleSync("@acme"),
        type: "skill",
        name: decodeExtensionNameSync("review"),
        version: decodeVersionSync("1.0.0"),
        integrity: Option.some(sha512Integrity(archive)),
        publisherBindingId: "hbnd_test",
        messages: { integrityMismatchDetail: "Fixture integrity" },
      });
      expect(result.canonicalPath).toBe(destinationPath);
      expect(yield* fs.readFileString(path.join(destinationPath, "src/SKILL.md"))).toBe(
        "# Review\r\n",
      );
      expect((yield* fs.stat(path.join(destinationPath, "src/run"))).mode & 0o111).toBe(0o111);
      expect(yield* fs.readLink(path.join(destinationPath, "src/run-link"))).toBe("run");
      expect(yield* fs.readLink(path.join(destinationPath, "src/cycle"))).toBe(".");
      expect(yield* fs.readLink(path.join(destinationPath, "src/a"))).toBe("b");
      expect(yield* fs.readLink(path.join(destinationPath, "src/b"))).toBe("a");
      expect(yield* fs.readDirectory(path.join(destinationPath, "src/empty"))).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
