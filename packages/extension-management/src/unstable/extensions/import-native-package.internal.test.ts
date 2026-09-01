import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { toAppError } from "../app-error/conversions.js";

import { extensionName, handle } from "../test-helpers.js";
import { importNativeExtensionPackage } from "./import-native-package.js";

describe("importNativeExtensionPackage", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-import-native-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("converts a native skill into a managed package with rewritten identity", () =>
    Effect.gen(function* () {
      const source = path.join(root, "native");
      const target = path.join(root, "managed");
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(
        path.join(source, "SKILL.md"),
        "---\nname: old-name\ndescription: Review code\n---\n\nInstructions.\n",
      );

      yield* importNativeExtensionPackage({
        sourcePath: source,
        targetDir: target,
        target: { owner: handle("@acme"), type: "skill", name: extensionName("review") },
      }).pipe(Effect.provide(NodeServices.layer));

      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(target, "skill.json"), "utf8"),
      );
      const body = fs.readFileSync(path.join(target, "src", "SKILL.md"), "utf8");
      expect(manifest).toMatchObject({
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "0.1.0",
      });
      expect(body).toContain("name: review");
    }),
  );

  it.effect("rejects managed AXM packages and directs callers to fork", () =>
    Effect.gen(function* () {
      fs.writeFileSync(path.join(root, "skill.json"), "{}");
      const result = yield* Effect.result(
        importNativeExtensionPackage({
          sourcePath: root,
          targetDir: path.join(root, "target"),
          target: { owner: handle("@acme"), type: "skill", name: extensionName("review") },
        }),
      ).pipe(Effect.provide(NodeServices.layer));

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(toAppError(result.failure).detail).toContain("use fork");
    }),
  );

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
      if (Result.isFailure(result))
        expect(toAppError(result.failure).detail).toContain("not supported for rule");
      expect(fs.existsSync(path.join(root, "rule-package"))).toBe(false);
    }),
  );

  it.effect("imports native subagent Markdown without changing the source", () =>
    Effect.gen(function* () {
      const subagentSource = path.join(root, "reviewer.md");
      const subagentBody = "---\nname: old-reviewer\nmodel: fast\n---\n\nReview carefully.\n";
      fs.writeFileSync(subagentSource, subagentBody);

      yield* importNativeExtensionPackage({
        sourcePath: subagentSource,
        targetDir: path.join(root, "subagent-package"),
        target: { owner: handle("@acme"), type: "subagent", name: extensionName("reviewer") },
      }).pipe(Effect.provide(NodeServices.layer));
      expect(fs.readFileSync(subagentSource, "utf8")).toBe(subagentBody);
      expect(
        fs.readFileSync(path.join(root, "subagent-package", "src", "reviewer.md"), "utf8"),
      ).toContain("name: reviewer");
    }),
  );
});
