import { NativeEntryRemoval } from "@agentxm/workspace-kernel/locations";
import * as Layer from "effect/Layer";
import { afterEach, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Predicate from "effect/Predicate";
import { buildFixture, type FixtureSpec } from "@agentxm/workspace-kernel/workspace-state/testing";
import {
  LOCKFILE_VERSION,
  type Lockfile,
  type Settings,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  buildPackRuleContexts,
  buildSkillRuleContexts,
  isManifestJsonParseFailure,
  platformCanonicalLintConfig,
} from "@agentxm/extension-content/lint";
import { inspectKnowledgePackage } from "@agentxm/extension-content/knowledge";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { collectRenderedFindings, evaluateAllCatalogs } from "../../runner.js";
import { instructionsAgentSupportedRule } from "../workspace/instructions-agent-supported.js";
import { instructionsGitignoreCurrentRule } from "../workspace/instructions-gitignore-current.js";
import { instructionsSourcePresentRule } from "../workspace/instructions-source-present.js";
import { instructionsTargetCurrentRule } from "../workspace/instructions-target-current.js";
import { instructionsTargetStaleRule } from "../workspace/instructions-target-stale.js";
import { instructionsTargetUnownedRule } from "../workspace/instructions-target-unowned.js";
import { buildLintWorkspace } from "./lint-workspace.js";
import { lintSelectedSubjects } from "../../index.js";

const WORKSPACE_ROOT = "/workspace";
const USER_HOME = "/home/user";

const treeIntegrity = `sha256-tree-v2:${"0".repeat(64)}`;

const baseManifest = {
  owner: "@acme",
  version: "not-semver",
  description: "Fixture extension",
};

const manifestFixtures = {
  skill: {
    ...baseManifest,
    type: "skill",
    name: "bad-skill",
    unexpectedSkillKey: true,
  },
  subagent: {
    ...baseManifest,
    type: "subagent",
    name: "bad-subagent",
    unexpectedSubagentKey: true,
  },
  mcpServer: {
    ...baseManifest,
    type: "mcp-server",
    name: "bad-mcp",
    server: {
      name: "io.github.acme/bad-mcp",
      description: "Bad MCP server",
      version: "1.0.0",
    },
    unexpectedMcpServerKey: true,
  },
  pack: {
    ...baseManifest,
    type: "pack",
    name: "bad-pack",
    dependencies: {},
    packs: {},
  },
};

const settings = {
  owner: "@acme",
  skills: { "bad-skill": "@acme/skills/bad-skill@1.0.0" },
  subagents: { "bad-subagent": "@acme/subagents/bad-subagent@1.0.0" },
  mcpServers: { "bad-mcp": { source: "@acme/mcps/bad-mcp@1.0.0" } },
  packs: { "bad-pack": "@acme/packs/bad-pack@1.0.0" },
};

const lockfile = {
  lockfileVersion: 1,
  skills: {
    "bad-skill": {
      source: { type: "registry", url: "https://registry.agentxm.ai" },
      identity: { owner: "@acme", name: "bad-skill" },
      resolved: {
        version: "1.0.0",
        integrity: `sha512-${"A".repeat(86)}==`,
        publisherBindingId: "hbnd_test",
      },
      treeIntegrity,
    },
  },
  mcpServers: {
    "bad-mcp": {
      source: { type: "registry", url: "https://registry.agentxm.ai" },
      identity: { owner: "@acme", name: "bad-mcp" },
      resolved: {
        version: "1.0.0",
        integrity: `sha512-${"A".repeat(86)}==`,
        publisherBindingId: "hbnd_test",
      },
      treeIntegrity,
    },
  },
};

const fixture = (packJson: object | string): FixtureSpec => ({
  workspaceRoot: WORKSPACE_ROOT,
  userHome: USER_HOME,
  project: {
    settings: { _tag: "valid", contents: settings },
    lockfile: { _tag: "valid", contents: lockfile },
    axmExtensions: {
      "agentxm/@acme/skills/bad-skill/src/SKILL.md":
        "---\nname: bad-skill\ndescription: Bad skill\n---\n",
      "agentxm/@acme/skills/bad-skill/skill.json": {
        _tag: "valid",
        contents: manifestFixtures.skill,
      },
      "agentxm/@acme/subagents/bad-subagent/subagent.json": {
        _tag: "valid",
        contents: manifestFixtures.subagent,
      },
      "agentxm/@acme/subagents/bad-subagent/src/bad-subagent.md": "# Bad subagent\n",
      "agentxm/@acme/mcps/bad-mcp/mcp.json": {
        _tag: "valid",
        contents: manifestFixtures.mcpServer,
      },
      "agentxm/@acme/packs/bad-pack/pack.json":
        typeof packJson === "string"
          ? { _tag: "byteCorrupt", bytes: packJson }
          : { _tag: "valid", contents: packJson },
    },
  },
  user: {
    settings: { _tag: "absent" },
  },
});

const fixtureWithKnowledge = (): FixtureSpec => {
  const spec = fixture(manifestFixtures.pack);
  return {
    ...spec,
    project: {
      ...spec.project,
      settings: {
        _tag: "valid",
        contents: { ...settings, knowledge: { handbook: "@acme/knowledge/handbook@1.0.0" } },
      },
      axmExtensions: {
        ...spec.project?.axmExtensions,
        "agentxm/@acme/knowledge/handbook/knowledge.json": {
          _tag: "valid",
          contents: {
            owner: "@acme",
            type: "knowledge",
            name: "handbook",
            version: "1.0.0",
            description: "Fixture knowledge",
            format: { name: "okf", version: "0.2" },
            bundleRoot: "src",
          },
        },
        "agentxm/@acme/knowledge/handbook/src/index.md":
          '---\nokf_version: "0.2"\n---\n# Handbook\n',
      },
    },
  };
};

const expectRecord = (value: unknown): Readonly<Record<string, unknown>> => {
  if (!Predicate.isObject(value)) {
    throw new Error("Expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
};

const buildAndEvaluate = (
  spec: FixtureSpec,
  defersExtensionRules?: (type: string, name: string) => boolean,
) =>
  Effect.gen(function* () {
    const deps = yield* buildFixture(spec);
    const lintWorkspace = yield* buildLintWorkspace({
      nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
      platform: { fs: deps.fs, path: deps.path },
      workspaceRoot: deps.workspaceRoot,
      userHome: deps.userHome,
      scope: "project",
      ...(defersExtensionRules === undefined ? {} : { defersExtensionRules }),
    });
    const evaluations = yield* evaluateAllCatalogs({
      view: "filesystem",
      contexts: {
        skill: buildSkillRuleContexts(lintWorkspace.view),
        pack: buildPackRuleContexts(lintWorkspace.view),
        subagent: lintWorkspace.view.subagentContexts,
        "mcp-server": lintWorkspace.view.mcpServerContexts,
        hook: lintWorkspace.view.hookContexts,
        rule: lintWorkspace.view.ruleContexts,
        knowledge: lintWorkspace.view.knowledgeContexts,
        workspace: [lintWorkspace.rule],
      },
      config: platformCanonicalLintConfig,
    });
    return {
      view: lintWorkspace.view,
      manifests: yield* lintWorkspace.rule.installedExtensions?.manifests ?? Effect.succeed([]),
      rendered: collectRenderedFindings(evaluations),
    };
  });

const noNativeRemoval = Layer.succeed(NativeEntryRemoval, {
  unlink: () => Effect.die("Native removal must not escape the in-memory read model"),
  removeEmptyDirectory: () => Effect.die("Native removal must not escape the in-memory read model"),
});

it.layer(noNativeRemoval)("buildLintWorkspace manifest JSON population", (it) => {
  it.effect("evaluates selected package catalogs and reports the packages actually observed", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(fixtureWithKnowledge());
      const result = yield* lintSelectedSubjects({
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        platform: { fs: deps.fs, path: deps.path },
        workspaceRoot: deps.workspaceRoot,
        userHome: deps.userHome,
        scope: "project",
        subjects: [
          { type: "skill", name: "bad-skill" },
          { type: "pack", name: "bad-pack" },
        ],
        inspectKnowledge: () => Effect.die("Unselected content was inspected"),
      });
      expect(result.findings.some(({ ruleId }) => ruleId === "skill/manifest-schema-valid")).toBe(
        true,
      );
      expect(result.findings.every(({ group }) => group === "skill" || group === "pack")).toBe(
        true,
      );
      expect(result.observedPackages.map(({ type, name }) => ({ type, name }))).toEqual([
        { type: "skill", name: "bad-skill" },
        { type: "pack", name: "bad-pack" },
      ]);
    }),
  );
  it.effect("does not inspect content of packages outside the selected closure", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(fixtureWithKnowledge());
      const selected = yield* buildLintWorkspace({
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        platform: { fs: deps.fs, path: deps.path },
        workspaceRoot: deps.workspaceRoot,
        userHome: deps.userHome,
        scope: "project",
        selectsPackage: (type, name) => type === "skill" && name === "bad-skill",
        inspectKnowledge: () => Effect.die("Unselected Knowledge content was inspected"),
      });
      expect(selected.view.installedSkills[0]?.skillJson).toEqual(manifestFixtures.skill);
      expect(selected.view.installedPacks).toEqual([]);
      expect(selected.view.subagentContexts).toEqual([]);
      expect(selected.view.mcpServerContexts).toEqual([]);
      expect(selected.view.knowledgeContexts).toEqual([]);
      const manifests = yield* selected.rule.installedExtensions?.manifests ?? Effect.succeed([]);
      expect(manifests.map(({ extensionType, name }) => ({ extensionType, name }))).toEqual([
        { extensionType: "skill", name: "bad-skill" },
      ]);
    }),
  );

  it.effect("validates acquired AXM manifests without imposing content conformance", () =>
    Effect.gen(function* () {
      const { view, rendered } = yield* buildAndEvaluate(fixture(manifestFixtures.pack));
      const ruleIds = rendered.map((finding) => finding.finding.ruleId);

      expect(ruleIds).toContain("skill/manifest-schema-valid");
      expect(ruleIds).toContain("skill/manifest-keys-recognized");
      expect(view.installedSkills[0]?.skillJson).toEqual(manifestFixtures.skill);
      expect(ruleIds).toContain("subagent/manifest-schema-valid");
      expect(ruleIds).toContain("subagent/manifest-keys-recognized");
      expect(ruleIds).toContain("mcp-server/manifest-schema-valid");
      expect(ruleIds).toContain("mcp-server/manifest-keys-recognized");
      expect(ruleIds).toContain("pack/manifest-schema-valid");
      expect(ruleIds).toContain("pack/manifest-keys-recognized");

      const packJson = expectRecord(view.installedPacks[0]?.packJson);
      expect(packJson["packs"]).toEqual({});
    }),
  );

  it.effect("validates workspace-authored AXM manifests", () =>
    Effect.gen(function* () {
      const source = fixture(manifestFixtures.pack);
      const authored: FixtureSpec = {
        ...source,
        project: {
          ...source.project,
          settings: {
            _tag: "valid",
            contents: { ...settings, skills: { "bad-skill": { source: "workspace" } } },
          },
          axmExtensions: {
            ...source.project?.axmExtensions,
            "skills/bad-skill/src/SKILL.md": "---\nname: bad-skill\ndescription: Bad skill\n---\n",
            "skills/bad-skill/skill.json": { _tag: "valid", contents: manifestFixtures.skill },
          },
        },
      };
      const { rendered } = yield* buildAndEvaluate(authored);
      expect(rendered.map((entry) => entry.finding.ruleId)).toContain(
        "skill/manifest-schema-valid",
      );
    }),
  );

  it.effect(
    "withholds per-extension rule contexts from a deferred extension, not its manifest",
    () =>
      Effect.gen(function* () {
        const { rendered, manifests } = yield* buildAndEvaluate(
          fixture(manifestFixtures.pack),
          (type, name) => type === "skill" && name === "bad-skill",
        );
        const ruleIds = rendered.map((finding) => finding.finding.ruleId);

        expect(ruleIds.filter((ruleId) => ruleId.startsWith("skill/"))).toEqual([]);
        expect(ruleIds).toContain("subagent/manifest-schema-valid");
        expect(manifests).toContainEqual(
          expect.objectContaining({ extensionType: "skill", name: "bad-skill" }),
        );
      }),
  );

  it.effect("reports malformed installed manifest JSON through schema-valid rules", () =>
    Effect.gen(function* () {
      const { rendered } = yield* buildAndEvaluate(fixture("{ nope"));
      const malformedPackFinding = rendered.find(
        (entry) => entry.finding.ruleId === "pack/manifest-schema-valid",
      );

      expect(malformedPackFinding?.finding.message).toContain("invalid JSON");
    }),
  );

  it.effect("inspects each selected Knowledge bundle exactly once per lint workspace", () =>
    Effect.gen(function* () {
      let calls = 0;
      const deps = yield* buildFixture(fixtureWithKnowledge());
      const lintWorkspace = yield* buildLintWorkspace({
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        platform: { fs: deps.fs, path: deps.path },
        workspaceRoot: deps.workspaceRoot,
        userHome: deps.userHome,
        scope: "project",
        inspectKnowledge: () => {
          calls += 1;
          return Effect.succeed({
            inspection: { concepts: [], diagnostics: [], okfVersion: "0.2" },
          });
        },
      });

      expect(lintWorkspace.view.knowledgeContexts).toHaveLength(1);
      expect(lintWorkspace.view.knowledgeContexts[0]?.subject.inspection).toEqual({
        concepts: [],
        diagnostics: [],
        okfVersion: "0.2",
      });
      expect(calls).toBe(1);
    }),
  );

  it.effect("observes the instruction projection exactly once per lint workspace", () =>
    Effect.gen(function* () {
      const spec = fixture(manifestFixtures.pack);
      const deps = yield* buildFixture({
        ...spec,
        project: {
          ...spec.project,
          settings: {
            _tag: "valid",
            contents: {
              ...settings,
              agents: ["claude-code", "gemini-cli"],
              instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
            },
          },
        },
      });
      let rootListings = 0;
      // The fixture filesystem dies on methods it does not model; observation
      // probes links and symlink support, which must fail (typed), not die.
      const unsupported = (method: string, path: string) =>
        Effect.fail(
          PlatformError.systemError({
            _tag: "NotFound",
            module: "FileSystem",
            method,
            description: "No such file or directory",
            pathOrDescriptor: path,
          }),
        );
      const fs = {
        ...deps.fs,
        readDirectory: (...params: Parameters<typeof deps.fs.readDirectory>) => {
          if (params[0] === deps.workspaceRoot) rootListings += 1;
          return deps.fs.readDirectory(...params);
        },
        readLink: (path: string) => unsupported("readLink", path),
        makeTempDirectory: () => unsupported("makeTempDirectory", deps.workspaceRoot),
        makeDirectory: (path: string) => unsupported("makeDirectory", path),
        writeFileString: (path: string) => unsupported("writeFileString", path),
        symlink: (_target: string, path: string) => unsupported("symlink", path),
        remove: (path: string) => unsupported("remove", path),
      };
      const lintWorkspace = yield* buildLintWorkspace({
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        platform: { fs, path: deps.path },
        workspaceRoot: deps.workspaceRoot,
        userHome: deps.userHome,
        scope: "project",
      });

      // Building the workspace must not observe; the first rule that asks does,
      // and every later rule reads the same snapshot.
      rootListings = 0;
      const findings = yield* Effect.forEach(
        [
          instructionsSourcePresentRule,
          instructionsTargetCurrentRule,
          instructionsTargetUnownedRule,
          instructionsTargetStaleRule,
          instructionsAgentSupportedRule,
          instructionsGitignoreCurrentRule,
        ],
        (rule) => rule.check(lintWorkspace.rule),
        { concurrency: 1 },
      );

      expect(rootListings).toBe(1);
      expect(findings.flat().map((finding) => finding.ruleId)).not.toContain(
        "workspace/instructions-source-present",
      );
    }),
  );

  it.effect("decides against the document cells its caller supplies", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(fixture(manifestFixtures.pack));
      const settingsPath = deps.path.join(deps.workspaceRoot, "axm.json");
      const lockPath = deps.path.join(deps.workspaceRoot, "axm.lock");
      const documentAccesses: Array<string> = [];
      const touches = (path: string) => {
        if (path === settingsPath || path === lockPath) documentAccesses.push(path);
      };
      const fs = {
        ...deps.fs,
        access: (...params: Parameters<typeof deps.fs.access>) => {
          touches(params[0]);
          return deps.fs.access(...params);
        },
        exists: (path: string) => {
          touches(path);
          return deps.fs.exists(path);
        },
        stat: (path: string) => {
          touches(path);
          return deps.fs.stat(path);
        },
        readFile: (path: string) => {
          touches(path);
          return deps.fs.readFile(path);
        },
        readFileString: (...params: Parameters<typeof deps.fs.readFileString>) => {
          touches(params[0]);
          return deps.fs.readFileString(...params);
        },
        open: (...params: Parameters<typeof deps.fs.open>) => {
          touches(params[0]);
          return deps.fs.open(...params);
        },
      };
      // Values that differ from the documents on disk, so only the supplied
      // cells can produce them.
      const suppliedSettings: Settings = { defaultRegistry: "supplied" };
      const suppliedLockfile: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
      const suppliedSettingsRaw = { path: settingsPath, bytes: "{}" };
      const suppliedLockfileRaw = { path: lockPath, bytes: `version = ${LOCKFILE_VERSION}\n` };
      const lintWorkspace = yield* buildLintWorkspace({
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        platform: { fs, path: deps.path },
        workspaceRoot: deps.workspaceRoot,
        userHome: deps.userHome,
        scope: "project",
        stateLoaders: {
          settings: Effect.succeed(Option.some(suppliedSettings)),
          lockfile: Effect.succeed(Option.some(suppliedLockfile)),
          settingsRaw: Effect.succeed(Option.some(suppliedSettingsRaw)),
          lockfileRaw: Effect.succeed(Option.some(suppliedLockfileRaw)),
        },
      });
      const state = lintWorkspace.rule.workspace.state;
      expect(Option.getOrUndefined(yield* state.settings)).toBe(suppliedSettings);
      expect(Option.getOrUndefined(yield* state.lockfile)).toBe(suppliedLockfile);
      expect(Option.getOrUndefined(yield* state.raw("settings"))).toBe(suppliedSettingsRaw);
      expect(Option.getOrUndefined(yield* state.raw("lockfile"))).toBe(suppliedLockfileRaw);
      expect(documentAccesses).toEqual([]);
      // The supplied lockfile, not the one on disk, decides the installed rows.
      expect(lintWorkspace.view.installedSkills).toEqual([]);
    }),
  );
});

/**
 * An installed Knowledge bundle's rule subject holds its loose manifest JSON
 * and its package inspection. Reads of the manifest are counted at the
 * filesystem and parses at `JSON.parse` for exactly the manifest text; the
 * read model's own canonical scan reads and parses the manifest once to learn
 * the bundle's identity.
 */
const HANDBOOK_ROOT = `${WORKSPACE_ROOT}/agent_extensions/agentxm/@acme/knowledge/handbook`;
const HANDBOOK_MANIFEST = `${HANDBOOK_ROOT}/knowledge.json`;

const handbookManifest = {
  owner: "@acme",
  type: "knowledge",
  name: "handbook",
  version: "1.0.0",
  description: "Fixture knowledge",
  format: { name: "okf", version: "0.2" },
  bundleRoot: "src",
};

const handbookLock = {
  source: { type: "registry", url: "https://registry.agentxm.ai" },
  identity: { owner: "@acme", name: "handbook" },
  resolved: {
    version: "1.0.0",
    integrity: `sha512-${"A".repeat(86)}==`,
    publisherBindingId: "hbnd_test",
  },
  treeIntegrity,
};

/**
 * The Knowledge fixture with `knowledge.json` holding exactly `manifest`, or
 * absent, and locked so the bundle's root stays known.
 */
const knowledgeWithManifest = (manifest: string | { readonly _tag: "absent" }): FixtureSpec => {
  const spec = fixtureWithKnowledge();
  return {
    ...spec,
    project: {
      ...spec.project,
      lockfile: { _tag: "valid", contents: { ...lockfile, knowledge: { handbook: handbookLock } } },
      axmExtensions: {
        ...spec.project?.axmExtensions,
        "agentxm/@acme/knowledge/handbook/knowledge.json": manifest,
      },
    },
  };
};

/** Count `JSON.parse` calls over each exact text, from the moment it is called. */
const countParses = () => {
  const parse = vi.spyOn(JSON, "parse");
  return (text: string) => parse.mock.calls.filter(([input]) => input === text).length;
};

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Build the lint workspace over a recording filesystem with the default
 * package inspection, recording from the build onwards.
 */
const buildRecorded = (
  spec: FixtureSpec,
  selectsPackage?: (type: string, name: string) => boolean,
) =>
  Effect.gen(function* () {
    const deps = yield* buildFixture(spec);
    const text = deps.files.get(HANDBOOK_MANIFEST);
    const unshared = yield* inspectKnowledgePackage(HANDBOOK_ROOT).pipe(
      Effect.provideService(FileSystem.FileSystem, deps.fs),
      Effect.provideService(Path.Path, deps.path),
      Effect.option,
    );
    const { fileSystem, recording } = makeRecordingFileSystem(deps.fs);
    recording.reset();
    const parses = countParses();
    const lintWorkspace = yield* buildLintWorkspace({
      nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
      platform: { fs: fileSystem, path: deps.path },
      workspaceRoot: deps.workspaceRoot,
      userHome: deps.userHome,
      scope: "project",
      ...(selectsPackage === undefined ? {} : { selectsPackage }),
    });
    const contexts = lintWorkspace.view.knowledgeContexts;
    const manifestPath =
      contexts[0]?.packageRoot === undefined
        ? HANDBOOK_MANIFEST
        : deps.path.join(contexts[0].packageRoot, "knowledge.json");
    return {
      unshared,
      subjects: contexts.map((context) => context.subject),
      counts: recording.counts(manifestPath),
      parses: text === undefined ? 0 : parses(text),
    };
  });

it.layer(noNativeRemoval)("buildLintWorkspace Knowledge manifest reads", (it) => {
  it.effect("reads and decodes a bundle's manifest once for its subject and its inspection", () =>
    Effect.gen(function* () {
      const { unshared, subjects, counts, parses } = yield* buildRecorded(fixtureWithKnowledge());
      // One read for the canonical scan and one for the subject; the
      // inspection decodes the subject's text from the scan's parse.
      expect(counts).toEqual({ readFile: 2, access: 1 });
      expect(parses).toBe(2);
      expect(Option.isSome(unshared)).toBe(true);
      expect(subjects).toEqual([
        {
          knowledgeJson: handbookManifest,
          inspection: Option.getOrUndefined(unshared)?.inspection,
        },
      ]);
      expect(subjects[0]?.inspection?.diagnostics.map(({ code }) => code)).not.toContain(
        "missing-manifest-description",
      );
    }),
  );

  it.effect("still warns about an empty manifest description", () =>
    Effect.gen(function* () {
      const { unshared, subjects } = yield* buildRecorded(
        knowledgeWithManifest(JSON.stringify({ ...handbookManifest, description: "" })),
      );
      expect(subjects[0]?.inspection?.diagnostics.map(({ code }) => code)).toContain(
        "missing-manifest-description",
      );
      expect(subjects[0]?.inspection).toEqual(Option.getOrUndefined(unshared)?.inspection);
    }),
  );

  it.effect("keeps invalid manifest JSON visible and leaves the bundle uninspected", () =>
    Effect.gen(function* () {
      const { unshared, subjects, counts, parses } = yield* buildRecorded(
        knowledgeWithManifest("{ nope"),
      );
      expect(Option.isNone(unshared)).toBe(true);
      expect(subjects).toHaveLength(1);
      expect(isManifestJsonParseFailure(subjects[0]?.knowledgeJson)).toBe(true);
      expect(subjects[0]?.inspection).toBeUndefined();
      // The inspection decodes the subject's text, but a failed parse is
      // never shared: the scan, the subject and the inspection each parse.
      expect(counts).toEqual({ readFile: 2, access: 1 });
      expect(parses).toBe(3);
    }),
  );

  it.effect("lets the inspection probe an absent manifest for itself", () =>
    Effect.gen(function* () {
      // The subject's presence probe and the inspection's own read attempt.
      const { subjects, counts } = yield* buildRecorded(knowledgeWithManifest({ _tag: "absent" }));
      expect(subjects).toEqual([{ knowledgeJson: undefined }]);
      expect(counts).toEqual({ readFile: 1, access: 1 });
    }),
  );

  it.effect("adds no manifest read for an unselected bundle", () =>
    Effect.gen(function* () {
      const { subjects, counts, parses } = yield* buildRecorded(
        fixtureWithKnowledge(),
        (type) => type !== "knowledge",
      );
      expect(subjects).toEqual([]);
      // Only the canonical scan reads it.
      expect(counts).toEqual({ readFile: 1 });
      expect(parses).toBe(1);
    }),
  );
});
