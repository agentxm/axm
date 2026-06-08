import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import { expectNoPlanEnvelope, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleHookInfo } from "./info.js";

const writeHookManifest = (hookDir: string): void => {
  fs.mkdirSync(hookDir, { recursive: true });
  fs.writeFileSync(
    path.join(hookDir, "hook.json"),
    JSON.stringify(
      {
        owner: "@acme",
        type: "hook",
        name: "shell-audit",
        version: "0.1.0",
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [
          {
            on: "tool.pre",
            match: {
              tools: ["shell.exec"],
            },
          },
        ],
      },
      null,
      2,
    ),
  );
};

describe("hooks-info.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-info-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("emits hook portability rows in machine mode", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    const hookDir = path.join(tempDir, ".axm", "extensions", "@acme", "hooks", "shell-audit");
    writeHookManifest(hookDir);

    return provide(
      Effect.gen(function* () {
        yield* handleHookInfo(hookDir);

        expect(rendererState.results[0]?.data).toMatchObject({
          items: expect.arrayContaining([
            {
              agent: "Claude Code",
              status: "installable",
              reason: "All bindings are supported.",
            },
            {
              agent: "Codex",
              status: "installable",
              reason: "All bindings are supported.",
            },
            {
              agent: "Gemini CLI",
              status: "installable",
              reason: "All bindings are supported.",
            },
          ]),
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });
});
