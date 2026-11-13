import { fixtureFailure } from "./observability-contract.js";
/** Successful typed operations use real authored sources and the public file Registry fixture. */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeFileRegistry, type FileRegistry } from "@agentxm/registry-client/testing";
import { HookTestResultSchema } from "@agentxm/workspace-kernel/operations";
import { digest, normalizeObservation, projectComparisonField } from "./observability-process.js";
import { prepareRegistryLifecycleObservabilityFixtures } from "./observability-registry-lifecycle-fixtures.js";
import type {
  ObservabilityScenario,
  PrepareInvocation,
  WorkspaceTemplate,
} from "./observability-fixtures.js";

const kinds = ["mcps", "subagents", "rules", "hooks", "knowledge", "packs"] as const;
type Kind = (typeof kinds)[number];

const writeVersions = (
  registry: FileRegistry,
  kind: Kind,
  versions: ReadonlyArray<string>,
  name = "bench-" + kind,
) => {
  switch (kind) {
    case "mcps":
      return registry.writeMcp(
        name,
        versions.map((version) => ({ version })),
      );
    case "subagents":
      return registry.writeSubagent(
        name,
        versions.map((version) => ({ version, body: "Review " + version + "." })),
      );
    case "rules":
      return registry.writeRule(
        name,
        versions.map((version) => ({ version, body: "Guidance " + version + "." })),
      );
    case "hooks":
      return registry.writeHook(
        name,
        versions.map((version) => ({
          version,
          files: {
            "hook.json": JSON.stringify({
              owner: "@acme",
              type: "hook",
              name,
              version,
              configuration: { label: { type: "string", default: "original" } },
              implementations: [
                {
                  id: "native",
                  protocol: "claude-code",
                  bindings: [
                    {
                      id: "audit",
                      event: "PreToolUse",
                      handler: {
                        type: "command",
                        runtime: "bash",
                        entrypoint: "src/hook.sh",
                        args: [{ config: "label" }],
                      },
                    },
                  ],
                },
              ],
            }),
          },
        })),
      );
    case "knowledge":
      return registry.writeKnowledge(
        name,
        versions.map((version) => ({ version, body: "Benchmark knowledge " + version + "." })),
      );
    case "packs":
      return registry.writePack(
        name,
        versions.map((version) => ({ version, dependencies: {} })),
      );
  }
};

const write = (fixture: WorkspaceTemplate, relative: string, content: string) => {
  const target = path.join(fixture.workspace, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const decodeDocument = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);
const decodeRecord = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));

/** Native skill/subagent imports fingerprint an independently allocated OS-temp staging path. */
export const verifyStagedNativeImport = (
  kind: "skills" | "subagents",
  mode: "apply" | "preview",
  stdout: string,
) =>
  Effect.gen(function* () {
    const source = kind === "skills" ? "./native-skill" : "./native-reviewer.md";
    const unit = kind === "skills" ? "skill" : "subagent";
    const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(stdout);
    const document = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        ok: Schema.Literal(true),
        result: Schema.Struct({
          contract: Schema.Literal("plan-result-v4"),
          planName: Schema.Literal("Import native extension"),
          mode: Schema.Literal(mode),
          outcome: Schema.Literal(mode === "apply" ? "applied" : "previewed"),
          candidateId: Schema.String,
          counts: Schema.Struct({
            total: Schema.Literal(1),
            ready: Schema.Literal(mode === "preview" ? 1 : 0),
            committed: Schema.Literal(mode === "apply" ? 1 : 0),
            failed: Schema.Literal(0),
            blocked: Schema.Literal(0),
            rolledBack: Schema.Literal(0),
          }),
          units: Schema.Array(
            Schema.Struct({
              id: Schema.Literal(unit + ":imported"),
              label: Schema.Literal(`Import ${source} -> @acme/${kind}/imported`),
              state: Schema.Literal(mode === "apply" ? "committed" : "ready"),
            }),
          ),
        }),
      }),
    )(raw);
    if (document.result.units.length !== 1 || !/^[0-9a-f]{64}$/.test(document.result.candidateId))
      return yield* fixtureFailure(
        "Staged native import must report one expected unit and a SHA-256 candidate identity.",
      );
    return {
      assertions: [
        "Expected native import plan, unit, mode, outcome and SHA-256 candidate identity validated.",
        "Only this independently staged skill/subagent import's candidateId is compared as invocation-local: its material fingerprint includes the random axm-import-*/package path. Raw ID and every other output, input and state field remain retained and significant.",
      ],
      stdoutComparison: JSON.stringify(
        projectComparisonField(
          raw,
          ["result", "candidateId"],
          document.result.candidateId,
          "<independently-staged-native-import-candidate>",
        ),
      ),
    };
  });

const publishOutput = Schema.fromJsonString(
  Schema.Struct({
    ok: Schema.Literal(true),
    result: Schema.Struct({
      counts: Schema.Struct({
        published: Schema.Literal(1),
        alreadyPublished: Schema.Literal(0),
        failed: Schema.Literal(0),
      }),
    }),
  }),
);
const publicationVerification =
  (registry: FileRegistry): NonNullable<ObservabilityScenario["verify"]> =>
  ({ stdout, startedAtMillis, endedAtMillis }) =>
    Effect.gen(function* () {
      yield* Schema.decodeUnknownEffect(publishOutput)(stdout);
      const indexes = registry.storedFiles().filter((relative) => relative.endsWith("/index.json"));
      if (indexes.length !== 1)
        return yield* fixtureFailure("Publication must retain exactly one Registry index");
      for (const relative of indexes) {
        const index = decodeDocument(fs.readFileSync(path.join(registry.root, relative), "utf8"));
        const versions = yield* Schema.decodeUnknownEffect(
          Schema.Array(
            Schema.Struct({
              version: Schema.String,
              published: Schema.String,
              integrity: Schema.String,
            }),
          ),
        )(index["versions"]);
        const published = versions.find((version) => version.version === "0.1.0");
        if (
          published === undefined ||
          versions.length !== 2 ||
          !versions.some((version) => version.version === "0.0.1")
        )
          return yield* fixtureFailure("Publication must add 0.1.0 while retaining 0.0.1");
        const at = Date.parse(published.published);
        if (!Number.isFinite(at) || at < startedAtMillis || at > endedAtMillis)
          return yield* fixtureFailure("Published timestamp must belong to the observed command");
        const archive = fs.readFileSync(
          path.join(registry.root, path.dirname(relative), "0.1.0.zip"),
        );
        if (
          published.integrity !==
          "sha512-" + createHash("sha512").update(archive).digest("base64")
        )
          return yield* fixtureFailure(
            "Published integrity must match the independently read archive",
          );
      }
      return {
        assertions: [
          "One new 0.1.0 version is published while the 0.0.1 version remains",
          "Registry integrity matches independently read archive bytes",
          "Publication timestamp falls within the observed command",
        ],
      };
    });

/** Keep the prior version and publisher binding identical; retain raw publication time separately. */
const publicationState = (registry: FileRegistry) => {
  const initial = registry
    .storedFiles()
    .map((relative) => ({ relative, bytes: fs.readFileSync(path.join(registry.root, relative)) }));
  let started = 0;
  const snapshot = () =>
    registry.storedFiles().map((relative) => {
      const bytes = fs.readFileSync(path.join(registry.root, relative));
      return {
        path: relative,
        content: relative.endsWith(".json")
          ? decodeDocument(bytes.toString("utf8"))
          : createHash("sha256").update(bytes).digest("hex"),
      };
    });
  return {
    reset: Effect.sync(() => {
      fs.rmSync(registry.root, { recursive: true, force: true });
      for (const { relative, bytes } of initial) {
        const target = path.join(registry.root, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
      }
      started = Date.now();
    }),
    snapshot,
    comparison: () =>
      snapshot().map((file) => {
        if (typeof file.content === "string" || !Array.isArray(file.content["versions"]))
          return file;
        return {
          ...file,
          content: {
            ...file.content,
            versions: file.content["versions"].map((value: unknown) => {
              const version = decodeRecord(value);
              if (version["version"] !== "0.1.0") return version;
              const published = version["published"];
              const timestamp = typeof published === "string" ? Date.parse(published) : Number.NaN;
              if (!Number.isFinite(timestamp) || timestamp < started || timestamp > Date.now())
                throw fixtureFailure("Publication time is outside the measured sample interval");
              return { ...version, published: "<sample-publication-time>" };
            }),
          },
        };
      }),
    comparisonDescription:
      "Only the newly published 0.1.0 index version's published time is replaced after proving it falls within this sample; raw index contents and archive SHA-256 remain retained.",
  };
};

const condition = {
  source: "authored",
  extensions: 1,
  cache: "not-applicable",
  network: "not-applicable",
  archiveBodyDelayMillis: 0,
} as const;

export const prepareTypedObservabilityFixtures = Effect.fnUntraced(function* (options: {
  readonly root: string;
  readonly base: WorkspaceTemplate;
  readonly invoke: PrepareInvocation;
  readonly copy: (source: WorkspaceTemplate, destination: string) => WorkspaceTemplate;
}) {
  const { root, base, invoke, copy } = options;
  const scenarios: ObservabilityScenario[] = [];
  const clone = (name: string, source = base) => copy(source, path.join(root, name));
  const add = (
    name: string,
    command: string,
    args: ReadonlyArray<string>,
    template: WorkspaceTemplate,
    source: ObservabilityScenario["condition"]["source"] = "authored",
    extra: Pick<ObservabilityScenario, "prepare" | "external" | "workExpectations" | "verify"> = {},
  ) => {
    scenarios.push({
      id: "typed/" + name,
      command,
      args,
      template,
      condition: { ...condition, source },
      ...extra,
    });
  };

  for (const kind of kinds) {
    const registry = yield* Effect.acquireRelease(
      Effect.sync(() => makeFileRegistry({ root: path.join(root, kind + "-registry") })),
      (fixture) => Effect.sync(() => fixture.cleanup()),
    );
    writeVersions(registry, kind, ["1.0.0"]);
    const name = "bench-" + kind;
    const reference = "@acme/" + kind + "/" + name;
    const configured = clone(kind + "-configured");
    write(
      configured,
      "axm.json",
      JSON.stringify({
        owner: "@acme",
        agents: ["claude-code"],
        defaultRegistry: "test",
        minimumReleaseAge: "0s",
        sources: [registry.source],
      }) + "\n",
    );
    const installed = clone(kind + "-installed", configured);
    yield* invoke(installed, [kind, "install", reference, "--accept-execution-changes"]);
    const disabled = clone(kind + "-disabled", installed);
    yield* invoke(disabled, [kind, "disable", name]);
    writeVersions(registry, kind, ["1.0.0", "2.0.0"]);
    const sourceState = {
      reset: Effect.void,
      snapshot: () =>
        registry.storedFiles().map((relative) => ({
          path: relative,
          sha256: createHash("sha256")
            .update(fs.readFileSync(path.join(registry.root, relative)))
            .digest("hex"),
        })),
    };
    const addInstalled = (operation: string, args: ReadonlyArray<string>, template = installed) =>
      add(
        kind + "/" + operation,
        kind + " " + operation,
        args,
        kind === "hooks" ? configured : template,
        "registry",
        {
          external: sourceState,
          ...(kind !== "hooks"
            ? {}
            : {
                // Native Hook commands contain absolute package paths. Prepare them in the sample's
                // actual cwd with the baseline, before the runner snapshots or starts measurement.
                prepare: (fixture: WorkspaceTemplate, prepare: PrepareInvocation) =>
                  Effect.gen(function* () {
                    yield* prepare(fixture, [
                      "hooks",
                      "install",
                      reference + "@1.0.0",
                      "--accept-execution-changes",
                    ]);
                    if (operation === "enable") yield* prepare(fixture, ["hooks", "disable", name]);
                  }),
              }),
        },
      );
    add(
      kind + "/install",
      kind + " install",
      [kind, "install", reference, "--accept-execution-changes"],
      configured,
      "registry",
      { external: sourceState },
    );
    addInstalled("update", [
      kind,
      "update",
      name,
      "--accept-execution-changes",
      ...(kind === "hooks" ? ["--source", reference + "@2.0.0"] : []),
    ]);
    for (const operation of ["uninstall", "show", "disable"])
      addInstalled(operation, [kind, operation, name]);
    addInstalled("enable", [kind, "enable", name, "--accept-execution-changes"], disabled);
    addInstalled("list", [kind, "list"]);

    const authored = clone(kind + "-authored");
    const create = [
      kind,
      "new",
      "bench-authored",
      "--description",
      "Synthetic benchmark extension.",
    ];
    add(kind + "/new", kind + " new", create, base);
    yield* invoke(authored, create);
    const publication = clone(kind + "-publication", authored);
    const manifestName = {
      mcps: "mcp",
      subagents: "subagent",
      rules: "rule",
      hooks: "hook",
      knowledge: "knowledge",
      packs: "pack",
    }[kind];
    const manifestPath = kind + "/bench-authored/" + manifestName + ".json";
    write(
      publication,
      manifestPath,
      JSON.stringify({
        ...decodeDocument(fs.readFileSync(path.join(publication.workspace, manifestPath), "utf8")),
        version: "0.1.0",
      }),
    );
    const publicationRegistry = yield* Effect.acquireRelease(
      Effect.sync(() =>
        makeFileRegistry({ root: path.join(root, kind + "-publication-registry") }),
      ),
      (fixture) => Effect.sync(() => fixture.cleanup()),
    );
    writeVersions(publicationRegistry, kind, ["0.0.1"], "bench-authored");
    const settings = decodeDocument(
      fs.readFileSync(path.join(publication.workspace, "axm.json"), "utf8"),
    );
    write(
      publication,
      "axm.json",
      JSON.stringify({
        ...settings,
        sources: [publicationRegistry.source],
        defaultRegistry: "test",
      }),
    );
    if (kind === "mcps")
      write(
        publication,
        "mcps/bench-authored/mcp.json",
        JSON.stringify({
          owner: "@acme",
          type: "mcp-server",
          name: "bench-authored",
          version: "0.1.0",
          server: {
            name: "ai.agentxm.bench/bench-authored",
            description: "Synthetic benchmark MCP server.",
            version: "0.1.0",
            packages: [
              {
                registryType: "npm",
                identifier: "@acme/bench-authored",
                version: "0.1.0",
                transport: { type: "stdio" },
              },
            ],
          },
        }),
      );
    scenarios.push({
      id: "typed/" + kind + "/publish",
      command: kind + " publish",
      args: [
        kind,
        "publish",
        "@acme/" + kind + "/bench-authored",
        "--registry",
        "test",
        "--accept-warnings",
      ],
      template: publication,
      condition,
      environment: { AXM_TOKEN: "synthetic-benchmark-token" },
      external: publicationState(publicationRegistry),
      verify: publicationVerification(publicationRegistry),
    });
    if (kind === "hooks") {
      addInstalled("configure", [
        "hooks",
        "configure",
        name,
        "--configuration",
        '{"label":"replacement"}',
        "--accept-execution-changes",
      ]);
      const hookTest = clone("hooks-test-recorded", authored);
      const hookRecords = path.join(root, "hook-test-processes.jsonl");
      const hookScript = path.join(hookTest.workspace, "hooks/bench-authored/src/hook.js");
      const hookSource = fs.readFileSync(hookScript, "utf8");
      fs.writeFileSync(
        hookScript,
        hookSource.replace(
          "async function main() {",
          "async function main() {\n" +
            "  require('node:fs').appendFileSync(" +
            JSON.stringify(hookRecords) +
            ", JSON.stringify({event:process.argv[2]}) + '\\n');",
        ),
      );
      const recordedHooks = () =>
        fs
          .readFileSync(hookRecords, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) =>
            Schema.decodeUnknownSync(
              Schema.fromJsonString(Schema.Struct({ event: Schema.Literal("SessionStart") })),
            )(line),
          );
      add(
        "hooks/test",
        "hooks test",
        ["hooks", "test", "hooks/bench-authored"],
        hookTest,
        "authored",
        {
          external: {
            reset: Effect.sync(() => fs.writeFileSync(hookRecords, "")),
            snapshot: recordedHooks,
          },
          workExpectations: () =>
            ["axm.process.run", "axm.process.spawn"].map((kind) => ({
              kind,
              count: recordedHooks().length,
              executed: recordedHooks().length,
            })),
          verify: ({ fixture, stdout, startedAtMillis, endedAtMillis }) =>
            Effect.gen(function* () {
              if (recordedHooks().length !== 2)
                return yield* fixtureFailure(
                  "Hook testing must execute both independently recorded fixture processes.",
                );
              const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
                stdout,
              );
              const document = yield* Schema.decodeUnknownEffect(
                Schema.Struct({ ok: Schema.Literal(true), result: HookTestResultSchema }),
              )(raw);
              const result = document.result;
              if (
                !result.passed ||
                result.fixtures.length !== 2 ||
                result.fixtures.some((row) => row.outcome !== "passed") ||
                !Number.isFinite(result.startedAt) ||
                !Number.isFinite(result.completedAt) ||
                result.startedAt < startedAtMillis ||
                result.completedAt > endedAtMillis ||
                result.startedAt > result.completedAt
              )
                return yield* fixtureFailure(
                  "Hook output must confirm both fixture outcomes within the independently observed invocation.",
                );
              const relativeReceipt = path.relative(fixture.workspace, result.receiptPath);
              if (!/^\.axm\/hook-tests\/[0-9a-f]{64}\.json$/.test(relativeReceipt))
                return yield* fixtureFailure(
                  "Hook receipt must be the bounded workspace-owned result file.",
                );
              const rawReceipt = yield* Schema.decodeUnknownEffect(
                Schema.fromJsonString(Schema.Unknown),
              )(fs.readFileSync(result.receiptPath, "utf8"));
              const receipt = yield* Schema.decodeUnknownEffect(HookTestResultSchema)(rawReceipt);
              if (JSON.stringify(receipt) !== JSON.stringify(result))
                return yield* fixtureFailure(
                  "Stored Hook receipt differs from the emitted execution result.",
                );
              const projectedOutput = projectComparisonField(
                projectComparisonField(
                  raw,
                  ["result", "startedAt"],
                  result.startedAt,
                  "<hook-started-during-invocation>",
                ),
                ["result", "completedAt"],
                result.completedAt,
                "<hook-completed-during-invocation>",
              );
              const projectedReceipt = projectComparisonField(
                projectComparisonField(
                  rawReceipt,
                  ["startedAt"],
                  result.startedAt,
                  "<hook-started-during-invocation>",
                ),
                ["completedAt"],
                result.completedAt,
                "<hook-completed-during-invocation>",
              );
              return {
                assertions: [
                  "Both native Hook fixture processes actually ran and recorded the expected event independently of telemetry.",
                  "Only schema-validated Hook startedAt/completedAt instants inside the invocation are projected; original output and receipt remain retained.",
                ],
                stdoutComparison: JSON.stringify(projectedOutput),
                fileComparisons: [
                  {
                    container: "workspace" as const,
                    path: relativeReceipt,
                    sha256: digest(
                      JSON.stringify(
                        normalizeObservation(projectedReceipt, [fixture.workspace, fixture.home]),
                      ),
                    ),
                    reason:
                      "Exact Hook execution receipt startedAt/completedAt timestamps validated against the observed invocation.",
                  },
                ],
              };
            }),
        },
      );
      add(
        "hooks/export",
        "hooks export",
        ["hooks", "export", "hooks/bench-authored", "native-export", "--implementation", "native"],
        authored,
      );
    }
    if (kind === "packs") {
      const member = clone("packs-with-member", authored);
      yield* invoke(member, [
        "skills",
        "new",
        "bench-member",
        "--description",
        "Synthetic pack member.",
      ]);
      add(
        "packs/add",
        "packs add",
        ["packs", "add", "bench-authored", "@acme/skills/bench-member"],
        member,
      );
      const populated = clone("packs-populated", member);
      yield* invoke(populated, ["packs", "add", "bench-authored", "@acme/skills/bench-member"]);
      add(
        "packs/remove",
        "packs remove",
        ["packs", "remove", "bench-authored", "@acme/skills/bench-member"],
        populated,
      );
      const active = clone("packs-active", populated);
      yield* invoke(active, ["packs", "enable", "bench-authored"]);
      add("packs/unpack", "packs unpack", ["packs", "unpack", "bench-authored"], active);
    }
    if (kind === "knowledge") {
      const corpus = clone("knowledge-corpus", authored);
      write(
        corpus,
        "knowledge/bench-authored/src/index.md",
        '---\nokf_version: "0.2"\ndescription: Synthetic benchmark concepts.\n---\n\n# Benchmark knowledge\n\n- [Architecture](architecture.md): Benchmark architecture guidance.\n',
      );
      write(
        corpus,
        "knowledge/bench-authored/src/architecture.md",
        "---\nid: architecture\ntype: concept\ndescription: Benchmark architecture guidance.\n---\n\n# Architecture\n\nRead evidence before changing behavior.\n",
      );
      yield* invoke(corpus, ["knowledge", "enable", "bench-authored"]);
      const reference = "@acme/knowledge/bench-authored#architecture";
      for (const [operation, operands] of [
        ["resolve", [reference]],
        ["query", ["architecture"]],
        ["get", [reference]],
        ["related", [reference]],
        ["capabilities", []],
      ] as const)
        add(
          "knowledge/concepts-" + operation,
          "knowledge concepts " + operation,
          ["knowledge", "concepts", operation, ...operands],
          corpus,
        );
      add("knowledge/lint", "knowledge lint", ["knowledge", "lint", "bench-authored"], corpus);
      // Adoption records a real foreign edit without replacing the supplied region body.
      const adoption = clone("instructions-adopt", corpus);
      write(
        adoption,
        "AGENTS.md",
        "<!-- axm:knowledge -->\nExisting benchmark region.\n<!-- /axm:knowledge -->\n",
      );
      add(
        "instructions/adopt",
        "instructions adopt",
        ["instructions", "adopt", "knowledge"],
        adoption,
      );
    }
    if (kind === "rules") {
      const demotion = clone("demote", configured);
      yield* invoke(demotion, ["rules", "new", name, "--description", "Synthetic authored rule."]);
      add("demote", "demote", ["demote", reference, reference, "--yes"], demotion, "registry");
      const migrationRegistry = yield* Effect.acquireRelease(
        Effect.sync(() => makeFileRegistry({ root: path.join(root, "migration-registry") })),
        (fixture) => Effect.sync(() => fixture.cleanup()),
      );
      migrationRegistry.writeRule("obsolete", [
        { version: "1.0.0", body: "Legacy benchmark guidance." },
      ]);
      const migration = clone("migration");
      write(
        migration,
        "axm.json",
        JSON.stringify({
          owner: "@acme",
          agents: ["claude-code"],
          sources: [migrationRegistry.source],
          defaultRegistry: "test",
          minimumReleaseAge: "0s",
        }),
      );
      yield* invoke(migration, ["rules", "install", "@acme/rules/obsolete"]);
      const index = path.join(
        migrationRegistry.root,
        "extensions",
        "@acme",
        "rules",
        "obsolete",
        "index.json",
      );
      fs.writeFileSync(
        index,
        JSON.stringify({
          ...decodeDocument(fs.readFileSync(index, "utf8")),
          deprecation: {
            deprecatedAt: "2026-03-01T00:00:00.000Z",
            reason: "obsolete",
            message: "Remove obsolete benchmark guidance.",
          },
        }),
      );
      add("migrate", "migrate", ["migrate", "@acme/rules/obsolete"], migration, "registry");
    }
  }

  const publishedSkill = clone("skills-publication");
  yield* invoke(publishedSkill, [
    "skills",
    "new",
    "bench-authored",
    "--description",
    "Synthetic published skill.",
  ]);
  const skillManifest = "skills/bench-authored/skill.json";
  write(
    publishedSkill,
    skillManifest,
    JSON.stringify({
      ...decodeDocument(
        fs.readFileSync(path.join(publishedSkill.workspace, skillManifest), "utf8"),
      ),
      version: "0.1.0",
    }),
  );
  const skillRegistry = yield* Effect.acquireRelease(
    Effect.sync(() => makeFileRegistry({ root: path.join(root, "skills-publication-registry") })),
    (fixture) => Effect.sync(() => fixture.cleanup()),
  );
  skillRegistry.writeSkill("bench-authored", [
    { version: "0.0.1", body: "Previous published skill." },
  ]);
  const skillSettings = decodeDocument(
    fs.readFileSync(path.join(publishedSkill.workspace, "axm.json"), "utf8"),
  );
  write(
    publishedSkill,
    "axm.json",
    JSON.stringify({ ...skillSettings, sources: [skillRegistry.source], defaultRegistry: "test" }),
  );
  const skillPublication = publicationState(skillRegistry);
  for (const prefix of [["skills", "publish"], ["publish"]])
    scenarios.push({
      id: "typed/" + prefix.join("/"),
      command: prefix.join(" "),
      args: [...prefix, "@acme/skills/bench-authored", "--registry", "test", "--accept-warnings"],
      template: publishedSkill,
      condition,
      environment: { AXM_TOKEN: "synthetic-benchmark-token" },
      external: skillPublication,
      verify: publicationVerification(skillRegistry),
    });

  const visibility = clone("visibility", publishedSkill);
  write(
    visibility,
    skillManifest,
    JSON.stringify({
      ...decodeDocument(fs.readFileSync(path.join(visibility.workspace, skillManifest), "utf8")),
      publish: { visibility: "private" },
    }),
  );
  for (const operation of ["status", "set", "reconcile"])
    scenarios.push({
      id: "typed/visibility/" + operation,
      command: "visibility " + operation,
      args: [
        "visibility",
        operation,
        "@acme/skills/bench-authored",
        ...(operation === "set" ? ["private"] : []),
        "--registry",
        "test",
      ],
      template: visibility,
      condition,
      environment: { AXM_TOKEN: "synthetic-benchmark-token" },
      external: skillPublication,
      verify: ({ stdout }) =>
        Effect.gen(function* () {
          const output = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(
              Schema.Struct({
                ok: Schema.Literal(true),
                result: Schema.Record(Schema.String, Schema.Unknown),
              }),
            ),
          )(stdout);
          const index = decodeDocument(
            fs.readFileSync(
              path.join(
                skillRegistry.root,
                "extensions",
                "@acme",
                "skills",
                "bench-authored",
                "index.json",
              ),
              "utf8",
            ),
          );
          if (operation === "status") {
            if (index["visibility"] !== undefined && index["visibility"] !== "public")
              return yield* fixtureFailure(
                "Visibility status unexpectedly mutated the public Registry index",
              );
            const actual = decodeRecord(output.result["actual"]);
            if (actual["value"] !== "public")
              return yield* fixtureFailure(
                "Visibility status did not report independent Registry state",
              );
          } else if (
            index["visibility"] !== "private" ||
            output.result["disposition"] !== "changed" ||
            output.result["after"] !== "private"
          )
            return yield* fixtureFailure(
              "Visibility mutation did not change the independent Registry index",
            );
          return {
            assertions: [
              operation === "status"
                ? "Read-only visibility result matches the public Registry index"
                : "Acknowledged visibility transition matches independently read private Registry index",
            ],
          };
        }),
    });

  const skill = clone("skills-native");
  write(
    skill,
    "native-skill/SKILL.md",
    "---\nname: native-skill\ndescription: Synthetic imported skill.\n---\n\n# Native skill\n\nReview evidence.\n",
  );
  add(
    "skills/import",
    "skills import",
    ["skills", "import", "./native-skill", "@acme/skills/imported"],
    skill,
    "authored",
    { verify: ({ stdout }) => verifyStagedNativeImport("skills", "apply", stdout) },
  );

  const subagent = clone("subagents-native");
  write(
    subagent,
    "native-reviewer.md",
    "---\nname: native-reviewer\ndescription: Review evidence\nmodel: fast\n---\n\nReview carefully.\n",
  );
  add(
    "subagents/import",
    "subagents import",
    [
      "subagents",
      "import",
      "./native-reviewer.md",
      "@acme/subagents/imported",
      "--source-agent",
      "claude-code",
    ],
    subagent,
    "authored",
    { verify: ({ stdout }) => verifyStagedNativeImport("subagents", "apply", stdout) },
  );

  const hook = clone("hooks-native");
  write(
    hook,
    "native/hooks.json",
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "bash src/audit.sh", timeout: 5 }],
          },
        ],
      },
    }),
  );
  write(hook, "native/src/audit.sh", "#!/usr/bin/env bash\nexit 0\n");
  add(
    "hooks/import",
    "hooks import",
    ["hooks", "import", "native", "@acme/hooks/imported", "--protocol", "claude-code"],
    hook,
  );

  const mcp = clone("mcps-native");
  write(
    mcp,
    ".mcp.json",
    JSON.stringify({
      mcpServers: { context: { type: "http", url: "https://mcp.example.test/context" } },
    }),
  );
  add("mcps/import", "mcps import", ["mcps", "import", "context", "@acme/mcps/imported"], mcp);
  add("mcps/adopt", "mcps adopt", ["mcps", "adopt", "--name", "context"], mcp);
  add(
    "mcps/add",
    "mcps add",
    [
      "mcps",
      "add",
      "context",
      "--url",
      "https://mcp.example.test/context",
      "--accept-execution-changes",
    ],
    base,
  );

  const handoff = clone("skills-handoff");
  const content = "---\nname: review\ndescription: Synthetic handoff guidance.\n---\n\n# Review\n";
  write(handoff, "upstream/review/SKILL.md", content);
  write(handoff, ".agents/skills/review/SKILL.md", content);
  fs.mkdirSync(path.join(handoff.workspace, ".claude", "skills"), { recursive: true });
  fs.symlinkSync(
    "../../.agents/skills/review",
    path.join(handoff.workspace, ".claude", "skills", "review"),
    "dir",
  );
  write(
    handoff,
    "skills-lock.json",
    JSON.stringify({
      version: 1,
      skills: {
        review: {
          source: path.join(handoff.workspace, "upstream", "review"),
          sourceType: "local",
          computedHash: createHash("sha256").update("SKILL.md").update(content).digest("hex"),
        },
      },
    }),
  );
  add(
    "skills/handoff",
    "skills handoff",
    ["skills", "handoff", "--skill", "review"],
    handoff,
    "path",
  );
  scenarios.push(...(yield* prepareRegistryLifecycleObservabilityFixtures({ root, base, copy })));
  return scenarios;
});
