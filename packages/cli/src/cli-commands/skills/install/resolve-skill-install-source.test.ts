import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach } from "vitest";
import type { CliError } from "../../../cli-error/index.js";
import type { SourceHostConfig } from "../../../settings/index.js";
import { parseInputPattern, type InputParseResult } from "../../../sources/parser.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { resolveSkillInstallSource, resolveSkillUrl } from "./resolve-skill-install-source.js";

const makeWorkspace = (sources: ReadonlyArray<SourceHostConfig>): WorkspaceContextService => ({
  global: false,
  path: "/tmp/test-workspace",
  baseDir: "/tmp",
  nonInteractive: true,
  preview: false,
  resolvePlan: () => Effect.die("not implemented in test"),
  getConfiguredSources: () => Effect.succeed(sources),
  getConfiguredSourceByName: (name: string) =>
    Effect.succeed(Option.fromNullable(sources.find((s) => s.name === name))),
  getConfiguredRegistrySources: (_scope: Option.Option<string>) =>
    Effect.succeed(
      sources.filter(
        (s): s is Extract<SourceHostConfig, { type: "registry" }> => s.type === "registry",
      ),
    ),
  getConfiguredNamespace: () => Effect.succeed("@test") as Effect.Effect<string, CliError>,
  addConfiguredSource: () => Effect.void,
  getConfiguredSkills: () => Effect.succeed({}),
  getInstalledSkills: () => Effect.succeed({}),
  getConfiguredAgents: () => Effect.succeed([]),
  getLockedSkills: () => Effect.succeed({}),
  getLockedSkill: () => Effect.succeed(Option.none()),
  getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
  setSkill: () => Effect.void,
  setSkillLock: () => Effect.void,
  removeSkill: () => Effect.void,
  removeSkillFromSettings: () => Effect.void,
  updateSkillEntry: () => Effect.void,
  setSkillEntry: () => Effect.void,
  renameSkill: () => Effect.void,
  updateLockEntryAgents: () => Effect.void,
  addConfiguredAgent: () => Effect.void,
  getConfiguredPacks: () => Effect.succeed({}),
  getInstalledPacks: () => Effect.succeed({}),
  getLockedPacks: () => Effect.succeed({}),
  getLockedPack: () => Effect.succeed(Option.none()),
  setPack: () => Effect.void,
  removePack: () => Effect.void,
  getPackDir: () => Effect.succeed({ canonicalPath: "" }),
});

const createSkillIndex = (registryRoot: string, namespace: string, name: string) => {
  const skillDir = path.join(registryRoot, "extensions", namespace, "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "index.json"),
    JSON.stringify({
      name,
      namespace,
      type: "skill",
      versions: [
        {
          version: "1.0.0",
          published: "2025-01-01T00:00:00Z",
          agents: [],
          integrity: "sha512-AAAA==",
        },
      ],
    }),
  );
};

const provideTestLayers = (sources: ReadonlyArray<SourceHostConfig>) =>
  Layer.mergeAll(NodeContext.layer, Workspace.layer(makeWorkspace(sources)));

const parseInputOrThrow = (input: string): InputParseResult => {
  const parsed = parseInputPattern(input);
  if (Option.isNone(parsed)) {
    throw new Error(`Expected parseable input: ${input}`);
  }
  return parsed.value;
};

describe("resolveSkillInstallSource", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it.effect("selects the first registry that contains the requested namespace", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    createSkillIndex(registryB, "@acme", "my-skill");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(
        parseInputOrThrow("@acme/skills/my-skill"),
      ).pipe(Effect.provide(provideTestLayers(sources)));
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
      }
    });
  });

  it.effect("supports namespace-only input and resolves against a matching registry", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    createSkillIndex(registryB, "@acme", "my-skill");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("@acme")).pipe(
        Effect.provide(provideTestLayers(sources)),
      );
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
      }
    });
  });

  it.effect("resolves bare skill name using configured default namespace", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    createSkillIndex(registryB, "@test", "some-name");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("some-name")).pipe(
        Effect.provide(provideTestLayers(sources)),
      );
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
      }
    });
  });

  it.effect("fails when no configured registry contains the requested namespace", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const error = yield* resolveSkillInstallSource(
        parseInputOrThrow("@acme/skills/my-skill"),
      ).pipe(Effect.flip, Effect.provide(provideTestLayers(sources)));
      expect(error._tag).toBe("CliError");
      expect(error.what).toContain('configured registry sources contain namespace "@acme"');
    });
  });
});

describe("resolveSkillInstallSource — local path", () => {
  it.effect("resolves relative path to LocalSource", () => {
    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("./my-skill")).pipe(
        Effect.provide(provideTestLayers([])),
      );
      expect(resolved.type).toBe("local");
      expect("path" in resolved && resolved.path).toBe("./my-skill");
    });
  });

  it.effect("resolves absolute path to LocalSource", () => {
    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(
        parseInputOrThrow("/absolute/path/to/skill"),
      ).pipe(Effect.provide(provideTestLayers([])));
      expect(resolved.type).toBe("local");
      expect("path" in resolved && resolved.path).toBe("/absolute/path/to/skill");
    });
  });

  it.effect("resolves parent-relative path to LocalSource", () => {
    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("../parent-skill")).pipe(
        Effect.provide(provideTestLayers([])),
      );
      expect(resolved.type).toBe("local");
      expect("path" in resolved && resolved.path).toBe("../parent-skill");
    });
  });

  it.effect("resolves home-relative path to LocalSource", () => {
    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("~/home-skill")).pipe(
        Effect.provide(provideTestLayers([])),
      );
      expect(resolved.type).toBe("local");
      expect("path" in resolved && resolved.path).toBe("~/home-skill");
    });
  });
});

describe("resolveSkillUrl", () => {
  it.effect("resolves GitHub HTTPS URL to GitHubSource", () => {
    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillUrl(
        new URL("https://github.com/vercel-labs/agent-skills"),
        "https://github.com/vercel-labs/agent-skills",
      ).pipe(Effect.provide(provideTestLayers(sources)));

      expect(resolved.type).toBe("github");
      expect("owner" in resolved && resolved.owner).toBe("vercel-labs");
      expect("repo" in resolved && resolved.repo).toBe("agent-skills");
      expect("url" in resolved && (resolved.url as URL).href).toBe("https://github.com/");
    });
  });

  it.effect("resolves GitLab HTTPS URL to GitLabSource", () => {
    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillUrl(
        new URL("https://gitlab.com/team/skills"),
        "https://gitlab.com/team/skills",
      ).pipe(Effect.provide(provideTestLayers(sources)));

      expect(resolved.type).toBe("gitlab");
      expect("owner" in resolved && resolved.owner).toBe("team");
      expect("repo" in resolved && resolved.repo).toBe("skills");
      expect("url" in resolved && (resolved.url as URL).href).toBe("https://gitlab.com/");
    });
  });

  it.effect("resolves custom GitHub Enterprise URL via configured source", () => {
    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
      { name: "ghe", type: "github", url: new URL("https://ghe.corp.com") },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillUrl(
        new URL("https://ghe.corp.com/team/repo"),
        "https://ghe.corp.com/team/repo",
      ).pipe(Effect.provide(provideTestLayers(sources)));

      expect(resolved.type).toBe("github");
      expect("owner" in resolved && resolved.owner).toBe("team");
      expect("repo" in resolved && resolved.repo).toBe("repo");
      expect("url" in resolved && (resolved.url as URL).href).toBe("https://ghe.corp.com/");
    });
  });

  it.effect("fails with CliError when no source matches the URL hostname", () => {
    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
    ];

    return Effect.gen(function* () {
      const error = yield* resolveSkillUrl(
        new URL("https://unknown-host.com/owner/repo"),
        "https://unknown-host.com/owner/repo",
      ).pipe(Effect.flip, Effect.provide(provideTestLayers(sources)));

      expect(error._tag).toBe("CliError");
      expect(error.code).toBe("SOURCE_PARSE_FAILED");
    });
  });
});
