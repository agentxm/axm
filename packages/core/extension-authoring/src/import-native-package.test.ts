import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { NativeImportUnsupported } from "@agentxm/extension-workspace";

import { extensionName, handle } from "./test-helpers.js";
import { importNativeExtensionPackage } from "./import-native-package.js";

describe("importNativeExtensionPackage", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-import-native-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("rejects extension types without a native package-conversion contract", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        importNativeExtensionPackage({
          sourcePath: root,
          targetDir: path.join(root, "rule-package"),
          target: { owner: handle("@acme"), type: "rule", name: extensionName("policy") },
        }),
      ).pipe(Effect.provide(NodeServices.layer));

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(NativeImportUnsupported);
        expect(result.failure instanceof NativeImportUnsupported ? result.failure.type : "").toBe(
          "rule",
        );
      }
      expect(fs.existsSync(path.join(root, "rule-package"))).toBe(false);
    }),
  );
});
