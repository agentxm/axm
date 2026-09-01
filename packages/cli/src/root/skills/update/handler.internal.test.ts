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
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import * as Option from "effect/Option";
import semver from "semver";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  ACQUIRED_EXTENSIONS_DIR,
  computePackManifestContentIdentity,
} from "@agentxm/workspace-state";
import { PACK_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { SourceHostProvidersLive } from "@agentxm/extension-management/unstable/source-resolution";
import { CodingAgentRepositoryLive } from "@agentxm/extension-management/unstable/extension-workspace";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/extension-management/unstable/skills";
import { handleUpdate, type UpdateHandlerArgs } from "./handler.js";
import { AXM_SKILL_VERSION } from "../../../__generated__/bundled-axm-skill.js";
import { LIST_INSTALLED_SKILLS } from "../../suggested-actions.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
  stringProperty,
} from "../../../test-helpers.js";
import { writeWorkspaceFiles } from "../../../test-stubs.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    skills?: Record<string, unknown>;
    skillLocks?: Record<string, unknown>;
    packLocks?: Record<string, unknown>;
    packs?: Record<string, unknown>;
    sources?: ReadonlyArray<Record<string, unknown>>;
    agents?: string[];
  },
) => {
  writeWorkspaceFiles(axmDir, {
    agents: opts?.agents,
    skills: opts?.skills,
    packs: opts?.packs,
    sources: opts?.sources,
    lockfileSkills: opts?.skillLocks,
    lockfilePacks: opts?.packLocks,
  });
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

const createTestZip = (
  fileName: string,
  content: string,
  rootFiles: Readonly<Record<string, string>> = {},
): Uint8Array => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-update-zip-"));
  try {
    const sourceDir = path.join(dir, "src");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, fileName), content);
    for (const [name, rootContent] of Object.entries(rootFiles)) {
      fs.writeFileSync(path.join(dir, name), rootContent);
    }
    const opts: ExecSyncOptions = { stdio: "pipe" };
    execSync(`cd "${dir}" && zip -qr archive.zip src ${Object.keys(rootFiles).join(" ")}`, opts);
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
  _agents: string[] = ["claude-code"],
  publisherBindingId?: string,
) => ({
  type: "registry",
  owner,
  name,
  resolvedVersion,
  integrity: `sha512-${resolvedVersion}`,
  sourceName: "local-reg",
  publisherBindingId: publisherBindingId ?? "hbnd_test",
});

const makePackLockEntry = (
  owner: string,
  name: string,
  dependencies: Readonly<Record<string, string>>,
) => ({
  type: "registry",
  owner,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-pack",
  sourceName: "local-reg",
  publisherBindingId: "hbnd_test",
  manifestContentIdentity: computePackManifestContentIdentity({
    owner,
    type: "pack",
    name,
    version: "1.0.0",
    dependencies,
  }),
});

const writeRegistrySkill = ({
  registryRoot,
  owner,
  name,
  versions,
  publisherBindingId,
}: {
  readonly registryRoot: string;
  readonly owner: string;
  readonly name: string;
  readonly versions: ReadonlyArray<{
    readonly version: string;
    readonly skillBody: string;
    readonly officialManifest?: boolean;
  }>;
  readonly publisherBindingId?: string;
}) => {
  const dir = path.join(registryRoot, "extensions", owner, "skills", name);
  fs.mkdirSync(dir, { recursive: true });

  const versionEntries = versions.map(({ version, skillBody, officialManifest }) => {
    const archive = createTestZip(
      "SKILL.md",
      skillBody,
      officialManifest === true
        ? {
            "skill.json": JSON.stringify({
              owner: "@agentxm",
              type: "skill",
              name: "axm",
              version,
            }),
          }
        : {},
    );
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
        publisherBindingId: publisherBindingId ?? "hbnd_test",
        deprecation: null,
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
  dependencies,
}: {
  readonly workspaceRoot: string;
  readonly owner: string;
  readonly name: string;
  readonly dependencies: Record<string, string>;
}) => {
  const dir = path.join(workspaceRoot, ACQUIRED_EXTENSIONS_DIR, "local-reg", owner, "packs", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, PACK_MANIFEST_FILENAME),
    JSON.stringify(
      {
        owner,
        type: "pack",
        name,
        version: "1.0.0",
        dependencies,
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

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
      ...opts,
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
      makeAxmSkillCompatibilityPolicyLayer(AXM_SKILL_VERSION),
    );
    const baseProvide = makeEffectProvide(FullLayer);
    // Registry fixtures are published at 2026-01-01; advance the virtual clock
    // past publish + minimumReleaseAge so release-age filtering sees them as mature.
    const provide: typeof baseProvide = (effect) =>
      baseProvide(
        Effect.andThen(
          TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe("2026-06-01T00:00:00Z"))),
          () => effect,
        ),
      );

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  it.effect("reports no-op when no skills are installed", () => {
    const { provide, logs, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs());

        expect(logs.success).toContain("No skills installed.");
        expect(rendererState.suggestions).toEqual([LIST_INSTALLED_SKILLS]);
      }),
    );
  });

  it.effect("reports disabled-only skill updates as no-op without skip logs", () => {
    const { provide, logs, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      skills: {
        "code-review": { source: "@acme/skills/code-review", enabled: false },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs());

        expect(logs.info).toEqual([]);
        expect(logs.success).toContain("No skills installed.");
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Update skills",
          message: "No skills installed.",
        });
      }),
    );
  });

  it.effect("reports disabled-only skill updates as JSON no-op without logs", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    initWorkspace(path.join(tempDir, ".axm"), {
      skills: {
        "code-review": { source: "@acme/skills/code-review", enabled: false },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs());

        expect(logs.info).toEqual([]);
        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Update skills",
          message: "No skills installed.",
        });
      }),
    );
  });

  it.effect("surfaces disabled skills as structured skip context during mixed updates", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    const registryRoot = path.join(tempDir, "registry");
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "code-review",
      versions: [
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
        "code-review": "local-reg:@acme/skills/code-review",
        "my-skill": { source: "@acme/skills/my-skill", enabled: false },
      },
      skillLocks: {
        "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs());

        expect(logs.warn).toEqual([]);
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Update skills",
          totalSteps: 2,
          appliedCount: 1,
        });
        expect(planResultUnits(result)).toEqual([
          expect.objectContaining({
            label: "Skip my-skill",
            state: "skipped",
            message: "Skipping my-skill: disabled",
          }),
          expect.objectContaining({ label: "code-review", state: "committed" }),
        ]);
      }),
    );
  });

  it.effect("reports network error without raw warning when skill source resolution fails", () => {
    const { provide, logs } = makeLayers();
    // Set up a workspace with one skill pointing to a nonexistent local path.
    // resolveSource will parse this as a local source, but sources.find will
    // fail because the directory does not exist — triggering the catch path.
    initWorkspace(path.join(tempDir, ".axm"), {
      skills: {
        "broken-skill": "./nonexistent-source-dir-that-does-not-exist",
      },
      skillLocks: {
        "broken-skill": {
          type: "local",
          path: "nonexistent-source-dir-that-does-not-exist",
          contentIdentity: "missing-local-content",
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        const error = yield* handleUpdate(
          defaultArgs({ source: Option.some("broken-skill") }),
        ).pipe(Effect.flip);

        expect(logs.warn).toEqual([]);

        // Since all resolutions failed, the handler should fail with UPDATE_FAILED
        expect(getAppError(error).code).toBe("network");
      }),
    );
  });

  it.effect("updates a registry skill when positional source matches its installed name", () => {
    const { provide, logs } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "code-review",
      versions: [
        { version: "2.0.0", skillBody: "# code-review v2" },
        { version: "1.0.0", skillBody: "# code-review v1" },
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
        "code-review": "local-reg:@acme/skills/code-review",
      },
      skillLocks: {
        "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs({ source: Option.some("code-review"), preview: true }));

        expect(logs.info.some((message) => message.includes("Would update 1 skill"))).toBe(true);
        expect(logs.warn).toEqual([]);
      }),
    );
  });

  it.effect("refuses an unattended update across a publisher epoch", () => {
    const { provide } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "code-review",
      publisherBindingId: "hbnd_new",
      versions: [
        { version: "2.0.0", skillBody: "# code-review v2" },
        { version: "1.0.0", skillBody: "# code-review v1" },
      ],
    });
    initWorkspace(path.join(tempDir, ".axm"), {
      sources: [
        {
          name: "local-reg",
          type: "registry",
          location: pathToFileURL(registryRoot).href,
        },
      ],
      skills: { "code-review": "local-reg:@acme/skills/code-review" },
      skillLocks: {
        "code-review": makeRegistryLockEntry(
          "@acme",
          "code-review",
          "1.0.0",
          ["claude-code"],
          "hbnd_old",
        ),
      },
    });

    return provide(
      Effect.gen(function* () {
        const error = yield* Effect.flip(handleUpdate(defaultArgs({ yes: true })));
        expect(error).toMatchObject({ detail: expect.stringContaining("publisher epoch changed") });
        expect(error).toMatchObject({ detail: expect.stringContaining("hbnd_old") });
        expect(error).toMatchObject({ detail: expect.stringContaining("hbnd_new") });
      }),
    );
  });

  it.effect("surfaces publisher epoch changes in an interactive preview", () => {
    const { provide, logs } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "code-review",
      publisherBindingId: "hbnd_new",
      versions: [
        { version: "2.0.0", skillBody: "# code-review v2" },
        { version: "1.0.0", skillBody: "# code-review v1" },
      ],
    });
    initWorkspace(path.join(tempDir, ".axm"), {
      sources: [
        {
          name: "local-reg",
          type: "registry",
          location: pathToFileURL(registryRoot).href,
        },
      ],
      skills: { "code-review": "local-reg:@acme/skills/code-review" },
      skillLocks: {
        "code-review": makeRegistryLockEntry(
          "@acme",
          "code-review",
          "1.0.0",
          ["claude-code"],
          "hbnd_old",
        ),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs({ preview: true }));
        // The warning rides its unit's planned row, not a bespoke section.
        expect(logs.success.some((message) => message.includes("Publisher identity changed"))).toBe(
          true,
        );
      }),
    );
  });

  it.effect("reports no-op when positional source matches no installed skill or source", () => {
    const { provide, logs, rendererState } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "code-review",
      versions: [{ version: "1.0.0", skillBody: "# code-review v1" }],
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
        "code-review": "local-reg:@acme/skills/code-review",
      },
      skillLocks: {
        "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs({ source: Option.some("missing") }));

        expect(logs.success).toContain('No installed skill matched "missing" as a name or source.');
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Update skills",
          message: 'No installed skill matched "missing" as a name or source.',
        });
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
          "code-review": "local-reg:@acme/skills/code-review@^1.0.0",
        },
        skillLocks: {
          "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs());

          const settings = expectRecord(
            JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8")),
            "Expected settings object",
          );
          const skills = expectRecord(settings["skills"], "Expected settings.skills");
          expect(skills["code-review"]).toBe("local-reg:@acme/skills/code-review@^1.0.0");

          const lockfile = expectRecord(
            YAML.parse(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8")),
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

  it.effect("updates the official AXM skill to the newest compatible release", () => {
    const { provide } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    const newerIncompatibleVersion = semver.inc(AXM_SKILL_VERSION, "patch") ?? "999.0.0";
    const skillBody = (version: string) =>
      `---\nname: axm\ndescription: AXM guidance\nmetadata:\n  axm.sh/cli-version: "${version}"\n  axm.sh/cli-version-range: "${version}"\n---\n`;
    writeRegistrySkill({
      registryRoot,
      owner: "@agentxm",
      name: "axm",
      versions: [
        {
          version: newerIncompatibleVersion,
          skillBody: skillBody(newerIncompatibleVersion),
          officialManifest: true,
        },
        {
          version: AXM_SKILL_VERSION,
          skillBody: skillBody(AXM_SKILL_VERSION),
          officialManifest: true,
        },
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
      skills: { axm: "local-reg:@agentxm/skills/axm" },
      skillLocks: {
        axm: makeRegistryLockEntry("@agentxm", "axm", "0.0.0"),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs());
        const lockfile = expectRecord(
          YAML.parse(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8")),
          "Expected lockfile object",
        );
        const lockedSkills = expectRecord(lockfile["skills"], "Expected lockfile.skills");
        const lockedSkill = expectRecord(lockedSkills["axm"], "Expected AXM skill lock entry");
        expect(stringProperty(lockedSkill, "resolvedVersion")).toBe(AXM_SKILL_VERSION);
      }),
    );
  });

  it.effect("surfaces pack constraint holdback as structured update context", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
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
    writeInstalledPackManifest({
      workspaceRoot: tempDir,
      owner: "@acme",
      name: "frontend-pack",
      dependencies: {
        "@acme/skills/code-review": "^1.0.0",
      },
    });
    const packDependencies = { "@acme/skills/code-review": "^1.0.0" };

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
        "code-review": "local-reg:@acme/skills/code-review",
      },
      packs: {
        "frontend-pack": "local-reg:@acme/packs/frontend-pack",
      },
      skillLocks: {
        "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
      },
      packLocks: {
        "frontend-pack": makePackLockEntry("@acme", "frontend-pack", packDependencies),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs());

        const lockfile = expectRecord(
          YAML.parse(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8")),
          "Expected lockfile object",
        );
        const lockedSkills = expectRecord(lockfile["skills"], "Expected lockfile.skills");
        const lockedSkill = expectRecord(
          lockedSkills["code-review"],
          "Expected code-review lock entry",
        );
        expect(stringProperty(lockedSkill, "resolvedVersion")).toBe("1.3.0");
        expect(logs.warn).toEqual([]);
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Update skills",
        });
        expect(result).toMatchObject({
          units: [
            {
              label: "code-review",
              state: "committed",
              message: expect.stringContaining("@acme/skills/code-review held at 1.3.0"),
            },
          ],
        });
      }),
    );
  });
});

// -----------------------------------------------------------------------------
// Preview flag
// -----------------------------------------------------------------------------

describe("update.handler — preview flag", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-update-preview-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
      ...opts,
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
      makeAxmSkillCompatibilityPolicyLayer(AXM_SKILL_VERSION),
    );
    const baseProvide = makeEffectProvide(FullLayer);
    // Registry fixtures are published at 2026-01-01; advance the virtual clock
    // past publish + minimumReleaseAge so release-age filtering sees them as mature.
    const provide: typeof baseProvide = (effect) =>
      baseProvide(
        Effect.andThen(
          TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe("2026-06-01T00:00:00Z"))),
          () => effect,
        ),
      );

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  it.effect("previews single skill update without modifying files or lockfile", () => {
    const { provide, logs } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "code-review",
      versions: [
        { version: "2.0.0", skillBody: "# code-review v2" },
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
        "code-review": "local-reg:@acme/skills/code-review@^1.0.0",
      },
      skillLocks: {
        "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs({ preview: true }));

        // Lockfile should still have original version (preview = no side effects)
        const lockfile = expectRecord(
          YAML.parse(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8")),
          "Expected lockfile object",
        );
        const lockedSkills = expectRecord(lockfile["skills"], "Expected lockfile.skills");
        const lockedSkill = expectRecord(
          lockedSkills["code-review"],
          "Expected code-review lock entry",
        );
        expect(stringProperty(lockedSkill, "resolvedVersion")).toBe("1.0.0");

        // Settings should be unchanged
        const settings = expectRecord(
          JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8")),
          "Expected settings object",
        );
        const skills = expectRecord(settings["skills"], "Expected settings.skills");
        expect(skills["code-review"]).toBe("local-reg:@acme/skills/code-review@^1.0.0");

        // Preview outcome should be displayed
        expect(logs.info.some((m) => m.includes("Would update 1 skill"))).toBe(true);
      }),
    );
  });

  it.effect("previews batch update without modifying files or lockfile", () => {
    const { provide, logs } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "code-review",
      versions: [
        { version: "2.0.0", skillBody: "# code-review v2" },
        { version: "1.0.0", skillBody: "# code-review v1.0" },
      ],
    });
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "testing",
      versions: [
        { version: "3.0.0", skillBody: "# testing v3" },
        { version: "1.0.0", skillBody: "# testing v1.0" },
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
        "code-review": "local-reg:@acme/skills/code-review",
        testing: "@acme/skills/testing",
      },
      skillLocks: {
        "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
        testing: makeRegistryLockEntry("@acme", "testing", "1.0.0"),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs({ preview: true }));

        // Both skills should still have original versions (preview = no side effects)
        const lockfile = expectRecord(
          YAML.parse(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8")),
          "Expected lockfile object",
        );
        const lockedSkills = expectRecord(lockfile["skills"], "Expected lockfile.skills");

        const lockedCodeReview = expectRecord(
          lockedSkills["code-review"],
          "Expected code-review lock entry",
        );
        expect(stringProperty(lockedCodeReview, "resolvedVersion")).toBe("1.0.0");

        const lockedTesting = expectRecord(lockedSkills["testing"], "Expected testing lock entry");
        expect(stringProperty(lockedTesting, "resolvedVersion")).toBe("1.0.0");

        // Preview outcome should be displayed
        expect(logs.info.some((m) => m.includes("Would update 2 skills"))).toBe(true);
      }),
    );
  });

  it.effect("emits skipped unresolved skills as plan steps without warning logs", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    const registryRoot = path.join(tempDir, "registry");
    writeRegistrySkill({
      registryRoot,
      owner: "@acme",
      name: "code-review",
      versions: [
        { version: "2.0.0", skillBody: "# code-review v2" },
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
        "code-review": "local-reg:@acme/skills/code-review",
        missing: "@acme/skills/missing",
      },
      skillLocks: {
        "code-review": makeRegistryLockEntry("@acme", "code-review", "1.0.0"),
        missing: makeRegistryLockEntry("@acme", "missing", "1.0.0"),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleUpdate(defaultArgs({ preview: true }));

        expect(logs.warn).toEqual([]);
        const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
          planName: "Update skills",
          totalSteps: 2,
        });
        expect(planResultUnits(result)).toEqual([
          expect.objectContaining({ label: "Skip missing", state: "ready" }),
          expect.objectContaining({ label: "code-review", state: "ready" }),
        ]);
      }),
    );
  });
});
