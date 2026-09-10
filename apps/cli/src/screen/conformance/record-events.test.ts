/**
 * Records authentic lifecycle event logs by driving real in-memory
 * operations through the CLI test context and snapshotting what the Screen
 * observed. The logs under `recorded/` are the conformance suite's replay
 * material; regenerate them by deleting a snapshot and rerunning.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";

import { OperationEventSchema, type OperationEvent } from "@agentxm/workspace-operations";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { SkillManagerLive } from "@agentxm/extension-lifecycle/live";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";

import { LifecycleFailureAdapterLive } from "../../feature-errors.js";
import { handleInstall } from "../../root/skills/install/handler.js";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";

const decodeLog = Schema.decodeUnknownSync(Schema.Array(OperationEventSchema));

/** Rebase wall-clock times on the first event so a recording is deterministic. */
const normalize = (events: ReadonlyArray<OperationEvent>): ReadonlyArray<OperationEvent> => {
  const base = events[0]?.atMs ?? 0;
  return events.map((event) => ({ ...event, atMs: event.atMs - base }));
};

const writeLocalSkillPackage = (root: string, name: string): string => {
  const packageRoot = path.join(root, "vendor", name);
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "skill.json"),
    `${JSON.stringify(
      { owner: "@acme", type: "skill", name, version: "1.0.0", description: `The ${name} skill.` },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "SKILL.md"),
    `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n`,
  );
  return packageRoot;
};

describe("recorded lifecycle event logs", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-conformance-record-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeHarness = () => {
    const context = makeWorkspaceHandlerTestContext({ flags: { nonInteractive: true } });
    const sourceProviders = Layer.provide(
      SourceHostProvidersLive,
      Layer.merge(context.baseLayer, context.wsLayer),
    );
    const skillManager = Layer.provide(
      SkillManagerLive,
      Layer.mergeAll(
        context.baseLayer,
        context.wsLayer,
        sourceProviders,
        CodingAgentRepositoryLive,
        LifecycleFailureAdapterLive,
      ),
    );
    const provide = makeEffectProvide(
      Layer.mergeAll(
        context.baseLayer,
        context.wsLayer,
        sourceProviders,
        CodingAgentRepositoryLive,
        LifecycleFailureAdapterLive,
        skillManager,
      ),
    );
    return { provide, events: context.rendererState.events };
  };

  const install = (source: string, preview: boolean) =>
    handleInstall(
      { source: Option.some(source), skills: [], all: false },
      { force: false, preview },
    );

  const record = (name: string, events: ReadonlyArray<OperationEvent>) =>
    Effect.promise(async () => {
      const normalized = normalize(events);
      expect(decodeLog(JSON.parse(JSON.stringify(normalized)))).toEqual(normalized);
      await expect(`${JSON.stringify(normalized, null, 2)}\n`).toMatchFileSnapshot(
        `./recorded/${name}.json`,
      );
    });

  it.effect("records an applied install of two local skills", () => {
    const harness = makeHarness();
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"], owner: "@axm" });
    const first = writeLocalSkillPackage(tempDir, "code-review");
    const second = writeLocalSkillPackage(tempDir, "deploy");
    return harness.provide(
      Effect.gen(function* () {
        yield* install(first, false);
        yield* install(second, false);
        const tags = harness.events.map((event) => event._tag);
        expect(tags.filter((tag) => tag === "OperationStarted")).toHaveLength(2);
        expect(tags.filter((tag) => tag === "OperationSettled")).toHaveLength(2);
        expect(harness.events.filter((event) => event._tag === "OperationSettled")).toEqual([
          expect.objectContaining({ outcome: "applied" }),
          expect.objectContaining({ outcome: "applied" }),
        ]);
        yield* record("install-apply", harness.events);
      }),
    );
  });

  it.effect("records a preview of the same install", () => {
    const harness = makeHarness();
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"], owner: "@axm" });
    const source = writeLocalSkillPackage(tempDir, "code-review");
    return harness.provide(
      Effect.gen(function* () {
        yield* install(source, true);
        expect(harness.events.at(-1)).toMatchObject({
          _tag: "OperationSettled",
          outcome: "previewed",
        });
        yield* record("install-preview", harness.events);
      }),
    );
  });

  it.effect("records a failing install of a source that does not exist", () => {
    const harness = makeHarness();
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"], owner: "@axm" });
    return harness.provide(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(install(path.join(tempDir, "vendor", "missing"), false));
        expect(exit._tag).toBe("Failure");
        expect(harness.events.at(-1)).toMatchObject({
          _tag: "OperationSettled",
          outcome: "failed",
        });
        yield* record("install-failed", harness.events);
      }),
    );
  });
});
