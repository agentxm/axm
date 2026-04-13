// TODO: (#51) Uses node:fs/node:os/node:path directly. Migrate to @effect/platform
// test utilities when available.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CodingAgentRepositoryLive } from "../../../agents/index.js";
import {
  computeSourceHash,
  decodeExtensionNameSync,
  decodeHandleSync,
  type ExtensionRef,
} from "../../../extensions/index.js";
import { normalizeHandle } from "../../../extensions/handle.js";
import {
  type SourceHostProvidersService,
  SourceHostProviders,
} from "../../../source-resolution/index.js";
import { buildRegistryCommandRef } from "../../../commands/index.js";
import { buildRegistrySkillRef } from "../../../skills/index.js";
import { decodeExactSemverVersionSync } from "../../../version-constraints/version-constraints.js";
import { diagnoseWorkspaceDoctor } from "../diagnose.js";
import type { Check } from "../types.js";
import {
  makeRegistryCommandLockEntry,
  makeRegistryExtensionPackLockEntry,
  makeRegistrySkillLockEntry,
  writeWorkspaceFiles,
} from "../../test-stubs.js";

const findCheck = (checks: ReadonlyArray<Check>, id: string): Check => {
  const match = checks.find((check) => check.id === id);
  if (match === undefined) {
    throw new Error(`expected a check with id "${id}"`);
  }
  return match;
};

describe("extensionsInstalledCheck", () => {
  let tempDir: string;
  let axmDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-doctor-extensions-installed-"));
    axmDir = path.join(tempDir, ".axm");
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const registrySources = [
    {
      name: "default",
      type: "registry" as const,
      location: new URL("https://registry.agentxm.ai"),
    },
  ];

  const registrySource = {
    type: "registry" as const,
    location: new URL("https://registry.agentxm.ai"),
    owner: Option.none(),
  };

  const makeCommandRef = (name = "formatter") =>
    buildRegistryCommandRef(
      decodeHandleSync("@acme"),
      decodeExtensionNameSync(name),
      decodeExactSemverVersionSync("1.0.0"),
      registrySource,
      [],
    );

  const makeSkillRef = (name = "code-review") =>
    buildRegistrySkillRef(
      decodeHandleSync("@acme"),
      decodeExtensionNameSync(name),
      decodeExactSemverVersionSync("1.0.0"),
      registrySource,
      [],
    );

  const makePackRef = (name = "starter"): ExtensionRef => ({
    type: "pack",
    refType: "registry",
    pack: {
      name: decodeExtensionNameSync(name),
      skills: {},
      commands: {},
      mcpServers: {},
      subagents: {},
    },
    source: registrySource,
    owner: decodeHandleSync("@acme"),
    name: decodeExtensionNameSync(name),
    version: decodeExactSemverVersionSync("1.0.0"),
    integrity: Option.none(),
    compatiblePackages: [],
  });

  const makeLayers = (refs: ReadonlyArray<ExtensionRef> = []) => {
    const providers: SourceHostProvidersService = {
      find: (_source, options) =>
        Effect.succeed(refs.filter((ref) => options.type === "*" || ref.type === options.type)),
      fetch: () => Effect.die("unused in extensions-installed tests"),
      cloneUrl: () => Option.none(),
      origin: () => "test",
    };

    return Layer.mergeAll(
      NodeServices.layer,
      CodingAgentRepositoryLive,
      Layer.succeed(SourceHostProviders, providers),
    );
  };

  const runDoctor = (refs: ReadonlyArray<ExtensionRef> = []) =>
    diagnoseWorkspaceDoctor({
      scope: "project",
      builtInSources: registrySources,
    }).pipe(Effect.provide(makeLayers(refs)));

  it.effect("flags bare-name declarations", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: [],
        packs: { starter: "starter-pack" },
      });

      const report = yield* runDoctor([makeCommandRef("formatter")]);
      const check = findCheck(report.checks, "extensions-installed");

      expect(check.status).toBe("fail");
      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-installed.declaration-bare-name",
            subject: { kind: "extension", ref: "pack:starter" },
          }),
        ]),
      );
    }),
  );

  it.effect("flags non-registry sources for registry-only extension types", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: [],
        commands: { formatter: "github:acme/formatter" },
      });

      const report = yield* runDoctor([makePackRef("starter")]);
      const check = findCheck(report.checks, "extensions-installed");

      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-installed.declaration-non-registry-source",
            subject: { kind: "extension", ref: "command:formatter" },
          }),
        ]),
      );
    }),
  );

  it.effect("flags duplicate declarations of the same registry extension", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: [],
        commands: {
          formatter: "@acme/commands/formatter",
          "formatter-copy": "@acme/commands/formatter@^2.0.0",
        },
      });

      const report = yield* runDoctor([makeSkillRef("code-review")]);
      const check = findCheck(report.checks, "extensions-installed");

      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-installed.declaration-duplicate",
            subject: { kind: "extension", ref: "command:formatter" },
          }),
          expect.objectContaining({
            id: "extensions-installed.declaration-duplicate",
            subject: { kind: "extension", ref: "command:formatter-copy" },
          }),
        ]),
      );
    }),
  );

  it.effect("flags installed versions that do not satisfy the declared constraint", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: [],
        commands: { formatter: "@acme/commands/formatter@^2.0.0" },
        lockfileCommands: {
          formatter: makeRegistryCommandLockEntry({
            owner: normalizeHandle("@acme"),
            name: "formatter",
          }),
        },
      });

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "extensions-installed");

      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-installed.version-unsatisfied",
            subject: { kind: "extension", ref: "command:formatter" },
          }),
        ]),
      );
    }),
  );

  it.effect("flags pack dependencies that are missing from installed lock entries", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: [],
        packs: { starter: "@acme/packs/starter" },
        lockfilePacks: {
          starter: makeRegistryExtensionPackLockEntry({
            owner: normalizeHandle("@acme"),
            name: "starter",
            resolvedCommands: {
              "@acme/commands/formatter": decodeExactSemverVersionSync("1.0.0"),
            },
          }),
        },
      });

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "extensions-installed");

      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-installed.declaration-pack-unknown-dep",
            subject: { kind: "extension", ref: "pack:starter" },
          }),
        ]),
      );
    }),
  );

  it.effect("flags retained pack members that no installed pack still declares", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: [],
        packs: { starter: "@acme/packs/starter" },
        lockfileCommands: {
          formatter: makeRegistryCommandLockEntry({
            owner: normalizeHandle("@acme"),
            name: "formatter",
            retainedByPack: true,
          }),
        },
        lockfilePacks: {
          starter: makeRegistryExtensionPackLockEntry({
            owner: normalizeHandle("@acme"),
            name: "starter",
          }),
        },
      });

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "extensions-installed");

      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-installed.pack-member-dropped",
            severity: "warn",
            subject: { kind: "extension", ref: "command:formatter" },
          }),
        ]),
      );
    }),
  );

  it.effect("flags skill source-hash mismatches when installed contents drift", () =>
    Effect.gen(function* () {
      const canonicalPath = path.join(
        tempDir,
        ".axm",
        "extensions",
        "@acme",
        "skills",
        "code-review",
      );
      fs.mkdirSync(canonicalPath, { recursive: true });
      fs.writeFileSync(path.join(canonicalPath, "SKILL.md"), "hello");

      writeWorkspaceFiles(axmDir, {
        agents: [],
        skills: { "code-review": "@acme/skills/code-review" },
        lockfileSkills: {
          "code-review": {
            ...makeRegistrySkillLockEntry({
              owner: normalizeHandle("@acme"),
              name: "code-review",
            }),
            sourceHash: computeSourceHash("not-the-installed-content"),
          },
        },
      });

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "extensions-installed");

      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-installed.integrity-mismatch",
            subject: { kind: "extension", ref: "skill:code-review" },
          }),
        ]),
      );
    }),
  );
});
