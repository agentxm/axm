/**
 * Install argument grammar refusals.
 *
 * A local connection name only means something against a source, so `--as`
 * with no source is refused by the command adapter before any feature call.
 * The rules the lifecycle decides — name grammar, name ownership, and
 * constraint intersection — are specified at their owner, in
 * `cli/mcps/install/local-name-requests-are-validated-before-any-change`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import { getAppError, makeWorkspaceLifecycleTestContext } from "../../test-support/test-helpers.js";
import { handleInstall } from "./handler.js";

describe("install argument grammar", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "install-grammar-"));
    process.chdir(tempDir);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    fs.writeFileSync(path.join(tempDir, "axm.json"), JSON.stringify({ agents: [] }));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("refuses --as without a source before mutation", () => {
    const { provide } = makeWorkspaceLifecycleTestContext({ wsOptions: { projectRoot: tempDir } });
    const settingsBefore = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");
    const lockBefore = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8");

    return provide(
      Effect.gen(function* () {
        const failure = yield* handleInstall({
          type: Option.some("mcp-server"),
          source: Option.none(),
          selectors: { "mcp-server": [] },
          all: false,
          force: false,
          preview: false,
          env: [],
          localName: Option.some("work-context"),
          bundled: false,
        }).pipe(Effect.flip);

        expect(getAppError(failure).detail).toContain(
          "--as is only valid for an MCP server selected from a source",
        );
        expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(settingsBefore);
        expect(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8")).toBe(lockBefore);
      }),
    );
  });
});
