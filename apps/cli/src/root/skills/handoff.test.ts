/**
 * Handler-level evidence for `axm skills handoff`: the handler reads the
 * configured agents only to check an explicit `--agent` selection, so a
 * request without one leaves the workspace settings to the handoff
 * preparation's own read.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";

import { classifyError } from "../../cli-runtime/index.js";
import { getAppError, makeWorkspaceLifecycleTestContext } from "../../test-support/test-helpers.js";
import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import { handleHandoff } from "./handoff.js";

const body = "---\nname: review\n---\n# Review\n";

/** A verified Skills-manager installation of `review` from a local source. */
const writeManagedInstallation = (root: string): void => {
  const source = path.join(root, "upstream", "review");
  const canonical = path.join(root, ".agents", "skills", "review");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(canonical, { recursive: true });
  fs.writeFileSync(path.join(source, "SKILL.md"), body);
  fs.writeFileSync(path.join(canonical, "SKILL.md"), body);
  fs.writeFileSync(
    path.join(root, "skills-lock.json"),
    JSON.stringify({
      version: 1,
      skills: {
        review: {
          source,
          sourceType: "local",
          computedHash: createHash("sha256").update("SKILL.md").update(body).digest("hex"),
        },
      },
    }),
  );
};

describe("skills handoff handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skills-handoff-test-")));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const preview = (agents: ReadonlyArray<string>) =>
    handleHandoff({ skills: ["review"], all: false, agents, preview: true });

  const settingsParses = (facts: ReadonlyArray<{ readonly kind: string }>) =>
    facts.filter((fact) => fact.kind === "axm.parse.settings").length;

  it.effect("without --agent reads the workspace settings once, inside preparation", () => {
    const { provide, rendererState } = makeWorkspaceLifecycleTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"] });
    writeManagedInstallation(tempDir);
    const observations = workObservations(false);
    return provide(
      Effect.gen(function* () {
        yield* preview([]).pipe(observations.provide);
        expect(rendererState.results).toHaveLength(1);
        expect(settingsParses(observations.facts)).toBe(1);
      }),
    );
  });

  it.effect("with a matching --agent keeps the membership check's own read", () => {
    const { provide, rendererState } = makeWorkspaceLifecycleTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"] });
    writeManagedInstallation(tempDir);
    const observations = workObservations(false);
    return provide(
      Effect.gen(function* () {
        yield* preview(["claude-code"]).pipe(observations.provide);
        expect(rendererState.results).toHaveLength(1);
        expect(settingsParses(observations.facts)).toBe(2);
      }),
    );
  });

  it.effect("with a different --agent set refuses before preparation", () => {
    const { provide, rendererState } = makeWorkspaceLifecycleTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"] });
    writeManagedInstallation(tempDir);
    const observations = workObservations(false);
    return provide(
      Effect.gen(function* () {
        const failure = yield* preview(["codex"]).pipe(observations.provide, Effect.flip);
        const appError = getAppError(failure);
        expect(appError.code).toBe("usage");
        expect(appError.detail).toBe(
          "--agent initializes workspace destinations; the existing workspace has a different configured agent set",
        );
        expect(settingsParses(observations.facts)).toBe(1);
        expect(rendererState.results).toEqual([]);
      }),
    );
  });

  it.effect("without --agent reports unreadable settings as the same error", () => {
    const { provide } = makeWorkspaceLifecycleTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"] });
    writeManagedInstallation(tempDir);
    return provide(
      Effect.gen(function* () {
        // The composed services read the settings once; corrupt them afterwards.
        fs.writeFileSync(path.join(tempDir, "axm.json"), "{ not json");
        const failure = yield* preview([]).pipe(Effect.flip);
        const options = { verbose: false, debug: false };
        const settingsPath = path.join(tempDir, "axm.json");
        const detail = `Workspace settings at ${settingsPath} are not valid JSON`;
        const suggestion = "Fix the JSON syntax in the settings file, then re-run.";
        const rendered = classifyError(failure, "text", options);
        expect(rendered.stderr?.map((entry) => entry.replace(/\s+/gu, " ").trim())).toEqual([
          `✖ Invalid request validation · exit 9 ${detail} --debug shows the cause. Next ${suggestion.slice(0, -1)}`,
        ]);
        expect(rendered).toMatchObject({
          exitCode: 9,
          stderrDoc: [
            {
              _tag: "callout",
              tone: "error",
              title: "Invalid request",
              aside: [{ text: "validation" }, { text: "exit 9" }],
              children: [
                { _tag: "paragraph", text: detail },
                { _tag: "paragraph", tone: "dim", text: "--debug shows the cause." },
              ],
            },
            { _tag: "next", actions: [{ description: suggestion }] },
          ],
        });
        expect(classifyError(failure, "json", options)).toEqual({
          exitCode: 9,
          stderr: [
            JSON.stringify({ type: "suggestion", description: suggestion }),
            JSON.stringify({ type: "error", code: "validation", message: detail }),
          ],
          stdout: `${JSON.stringify({
            ok: false,
            code: "validation",
            title: "Invalid request",
            detail,
            suggestions: [{ description: suggestion }],
          })}\n`,
        });
      }),
    );
  });
});
