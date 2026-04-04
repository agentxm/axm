/**
 * Unit tests for the skills update handler.
 *
 * Tests error recovery and constrained registry updates.
 */

import { execSync, type ExecSyncOptions } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { REGISTRY_EXTENSIONS_DIR } from "@axm.sh/core/unstable/extensions";
import { PACK_MANIFEST_FILENAME } from "@axm.sh/core/unstable/packs";
import { SourceHostProvidersLive } from "@axm.sh/core/unstable/source-resolution";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import { handleUpdate, type UpdateHandlerArgs } from "./handler.js";
import {
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  stringProperty,
} from "../../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    skills?: Record<string, string>;
    skillLocks?: Record<string, unknown>;
    packLocks?: Record<string, unknown>;
    sources?: ReadonlyArray<Record<string, unknown>>;
    agents?: string[];
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = {
    agents: opts?.agents ?? ["claude-code"],
  };
  if (opts?.skills) settings["skills"] = opts.skills;
  if (opts?.sources) settings["sources"] = opts.sources;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  const lockfile: Record<string, unknown> = {
    lockfileVersion: 1,
    skills: opts?.skillLocks ?? {},
  };
  if (opts?.packLocks) {
    lockfile["packs"] = opts.packLocks;
  }
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

const defaultArgs = (overrides: Partial<UpdateHandlerArgs> = {}): UpdateHandlerArgs => ({
  source: Option.none(),
  agents: [],
  skills: [],
  force: false,
  yes: false,
  preview: false,
  ...overrides,
});

const createTestZip = (fileName: string, content: string): Uint8Array => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-update-zip-"));
  try {
    fs.writeFileSync(path.join(dir, fileName), content);
    const opts: ExecSyncOptions = { stdio: "pipe" };
    execSync(`cd "${dir}" && zip -q archive.zip "${fileName}"`, opts);
    return fs.readFileSync(path.join(dir, "archive.zip"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const computeIntegrity = (data: Uint8Array): string =>
  `sha512-${createHash("sha512").update(data).digest("base64")}`;

const makeRegistryLockEntry = (
  owner: string,
  name: string,
  resolvedVersion: string,
  agents: string[] = ["claude-code"],
) => ({
  type: "registry",
  owner,
  name,
  resolvedVersion,
  integrity: `sha512-${resolvedVersion}`,
  sourceName: "local-reg",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makePackLockEntry = (owner: string, name: string) => ({
  type: "registry",
  owner,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-pack",
  sourceName: "local-reg",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resolvedSkills: {},
  resolvedCommands: {},
  resolvedMcpServers: {},
});

const writeRegistrySkill = ({
  registryRoot,
  owner,
  name,
  versions,
}: {
  readonly registryRoot: string;
  readonly owner: string;
  readonly name: string;
  readonly versions: ReadonlyArray<{
    readonly version: string;
    readonly skillBody: string;
  }>;
}) => {
  const dir = path.join(registryRoot, "extensions", owner, "skills", name);
  fs.mkdirSync(dir, { recursive: true });

  const versionEntries = versions.map(({ version, skillBody }) => {
    const archive = createTestZip("SKILL.md", skillBody);
    fs.writeFileSync(path.join(dir, `${version}.zip`), archive);
    return {
      version,
      published: "2026-01-01T00:00:00Z",
      integrity: computeIntegrity(archive),
    };
  });

  fs.writeFileSync(
    path.join(dir, "index.json"),
    JSON.stringify(
      {
        owner,
        type: "skill",
        name,
        description: "Registry test skill",
        versions: versionEntries,
      },
      null,
      2,
    ),
  );
};

const writeInstalledPackManifest = ({
  workspaceRoot,
  owner,
  name,
  skills,
}: {
  readonly workspaceRoot: string;
  readonly owner: string;
  readonly name: string;
  readonly skills: Record<string, string>;
}) => {
  const dir = path.join(workspaceRoot, REGISTRY_EXTENSIONS_DIR, owner, "packs", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, PACK_MANIFEST_FILENAME),
    JSON.stringify(
      {
        owner,
        type: "pack",
        name,
        version: "1.0.0",
        skills,
      },
      null,
      2,
    ),
  );
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("update.handler — error recovery", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-update-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
    });
    const SPLayer = Layer.provide(
      SourceHostProvidersLive,
      Layer.merge(handlerTestContext.baseLayer, handlerTestContext.wsLayer),
    );
    const FullLayer = Layer.mergeAll(
      handlerTestContext.baseLayer,
      handlerTestContext.wsLayer,
      SPLayer,
      CodingAgentRepositoryLive,
    );
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  it.effect("emits warning when skill source resolution fails and reports UPDATE_FAILED", () => {
    const { provide, logs } = makeLayers();
    // Set up a workspace with one skill pointing to a nonexistent local path.
    // resolveSource will parse this as a local source, but sources.find will
    // fail because the directory does not exist — triggering the catch path.
    initWorkspace(path.join(tempDir, ".axm"), {
      skills: {
        "broken-skill": "/tmp/nonexistent-source-dir-that-does-not-exist",
      },
    });

    return provide(
      Effect.gen(function* () {
        const error = yield* handleUpdate(defaultArgs()).pipe(Effect.flip);

        // The catch path should have emitted a warning for the failed resolution
        expect(logs.warn.some((m: string) => m.includes('Failed to resolve "broken-skill"'))).toBe(
          true,
        );

        // Since all resolutions failed, the handler should fail with UPDATE_FAILED
        expect(getAppError(error).code).toBe("UPDATE_FAILED");
      }),
    );
  });

  it.effect(
    "updates registry skills using the stored user constraint and preserves it in settings",
    () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");
      writeRegistrySkill({
        registryRoot,
        owner: "@acme",
        name: "code-review",
        versions: [
          { version: "2.0.0", skillBody: "# code-review v2" },
          { version: "1.3.0", skillBody: "# code-review v1.3" },
          { version: "1.0.0", skillBody: "# code-review v1.0" },
        ],
      });

      initWorkspace(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        sources: [
          {
            name: "local-reg",
            type: "registry",
            location: pathToFileURL(registryRoot).href,
          },
        ],
        skills: {
          "code-review": "@acme/skills/code-review@^1.0.0",
        },
        skillLocks: {
          "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs());

          const settings = expectRecord(
            JSON.parse(fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8")),
            "Expected settings object",
          );
          const skills = expectRecord(settings["skills"], "Expected settings.skills");
          expect(skills["code-review"]).toBe("@acme/skills/code-review@^1.0.0");

          const lockfile = expectRecord(
            YAML.parse(fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8")),
            "Expected lockfile object",
          );
          const lockedSkills = expectRecord(lockfile["skills"], "Expected lockfile.skills");
          const lockedSkill = expectRecord(
            lockedSkills["code-review"],
            "Expected code-review lock entry",
          );
          expect(stringProperty(lockedSkill, "resolvedVersion")).toBe("1.3.0");
        }),
      );
    },
  );

  it.effect("warns when a pack constraint holds back a wildcard registry update", () => {
    const { provide, logs } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "code-review",
      versions: [
        { version: "2.0.0", skillBody: "# code-review v2" },
        { version: "1.3.0", skillBody: "# code-review v1.3" },
        { version: "1.0.0", skillBody: "# code-review v1.0" },
      ],
    });

    initWorkspace(path.join(tempDir, ".axm"), {
      agents: ["claude-code"],
      sources: [
        {
          name: "local-reg",
          type: "registry",
          location: pathToFileURL(registryRoot).href,
        },
      ],
      skills: {
        "code-review": "@acme/skills/code-review",
      },
      skillLocks: {
        "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
      },
      packLocks: {
        "frontend-pack": makePackLockEntry("@acme", "frontend-pack"),
      },
    });
    writeInstalledPackManifest({
      workspaceRoot: tempDir,
      owner: "@acme",
      name: "frontend-pack",
      skills: {
        "@acme/skills/code-review": "^1.0.0",
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs());

        const lockfile = expectRecord(
          YAML.parse(fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8")),
          "Expected lockfile object",
        );
        const lockedSkills = expectRecord(lockfile["skills"], "Expected lockfile.skills");
        const lockedSkill = expectRecord(
          lockedSkills["code-review"],
          "Expected code-review lock entry",
        );
        expect(stringProperty(lockedSkill, "resolvedVersion")).toBe("1.3.0");
        expect(
          logs.warn.some(
            (message: string) =>
              message.includes("@acme/skills/code-review held at 1.3.0") &&
              message.includes('pack "frontend-pack"') &&
              message.includes("^1.0.0") &&
              message.includes("latest is 2.0.0"),
          ),
        ).toBe(true);
      }),
    );
  });
});
