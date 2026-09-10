import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import { writeWorkspaceFiles } from "../../../test-stubs.js";
import { installBundledAxmSkill } from "./bundled-axm-skill.js";

describe("bundled AXM skill transaction", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundled-axm-skill-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeTestContext = () => {
    const context = makeWorkspaceHandlerTestContext({ flags: { nonInteractive: true } });
    return makeEffectProvide(Layer.mergeAll(context.fullLayer, CodingAgentRepositoryLive));
  };

  const initializeRegistryState = () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      agents: ["claude-code"],
      owner: "@agentxm",
      skills: {
        axm: "agentxm:@agentxm/skills/axm",
        reviewer: "agentxm:@acme/skills/reviewer",
      },
      lockfileSkills: {
        axm: {
          type: "registry",
          owner: "@agentxm",
          name: "axm",
          resolvedVersion: "0.28.3",
          integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
          sourceName: "agentxm",
          publisherBindingId: "hbnd_agentxm",
        },
        reviewer: {
          type: "registry",
          owner: "@acme",
          name: "reviewer",
          resolvedVersion: "1.0.0",
          integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
          sourceName: "agentxm",
          publisherBindingId: "hbnd_acme",
        },
      },
    });
  };

  it.effect("removes only the superseded official-skill resolution", () => {
    initializeRegistryState();
    const provide = makeTestContext();

    return provide(
      Effect.gen(function* () {
        yield* installBundledAxmSkill;

        const lock = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8");
        expect(lock).not.toContain("axm:");
        expect(lock).toContain("reviewer:");
        expect(JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"))).toMatchObject({
          skills: {
            axm: { source: "workspace", origin: "bundled" },
            reviewer: "agentxm:@acme/skills/reviewer",
          },
        });
      }),
    );
  });

  it.effect("restores settings and lock state when postcondition validation fails", () => {
    initializeRegistryState();
    const provide = makeTestContext();
    const settingsBefore = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");
    const lockBefore = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8");

    return provide(
      Effect.gen(function* () {
        const workspace = yield* WorkspaceMutations;
        const acceptedAxm = yield* workspace.getLockedSkill("axm");
        expect(Option.isSome(acceptedAxm)).toBe(true);
        const validationFailureWorkspace = {
          ...workspace,
          getLockedSkill: (name: string) =>
            name === "axm" ? Effect.succeed(acceptedAxm) : workspace.getLockedSkill(name),
        } satisfies typeof workspace;

        const exit = yield* installBundledAxmSkill.pipe(
          Effect.provideService(WorkspaceMutations, validationFailureWorkspace),
          Effect.exit,
        );

        expect(Exit.isFailure(exit)).toBe(true);
        expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(settingsBefore);
        expect(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8")).toBe(lockBefore);
        expect(
          fs.existsSync(
            path.join(tempDir, "agent_extensions", "agentxm", "@agentxm", "skills", "axm"),
          ),
        ).toBe(false);
      }),
    );
  });
});
