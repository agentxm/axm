/**
 * Opt-in, isolated agent task observations. An execution is not a passing grade:
 * independent state checks and human review of facts/authority remain separate.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import * as Fiber from "effect/Fiber";
import { agentEvaluationCliWrapper } from "./agent-evaluation-wrapper.js";
import {
  applyFileComparison,
  digest,
  runObservedProcess,
  snapshotTree,
  snapshotDigest,
  normalizeObservation,
  type FileObservation,
} from "./observability-process.js";
import { agentEvaluationCases } from "./agent-evaluation-fixtures.js";
import type {
  AgentEvaluationCase,
  AgentFixtureContext,
  PreparedAgentFixture,
} from "./agent-evaluation-contract.js";

const arms = ["baseline-current-skill", "candidate-no-skill", "candidate-minimal-skill"] as const;
type Arm = (typeof arms)[number];
const mountedWorkspace = "/tmp/workspace";
const trialConcurrency = 2;
const object = Schema.Record(Schema.String, Schema.Unknown);
const decodeObject = Schema.decodeUnknownSync(object);
const SupersessionSchema = Schema.Struct({
  previousCampaign: Schema.String,
  preregistrationSha256: Schema.String,
  caseIds: Schema.Array(Schema.String),
  excludedTrialIds: Schema.Array(Schema.String),
  reason: Schema.String,
  priorFixtureSha256: Schema.String,
  correctedFixtureSha256: Schema.String,
  candidateBinarySha256: Schema.String,
  invalidationEvents: Schema.Array(Schema.Struct({ file: Schema.String, sha256: Schema.String })),
});
class AgentEvaluationFailure extends Data.TaggedError("AgentEvaluationFailure")<{
  readonly message: string;
}> {}
const sourceRoot = path.resolve(import.meta.dir, "..");
const harnessSources = [
  "benchmarks/agent-evaluation.ts",
  "benchmarks/agent-evaluation-contract.ts",
  "benchmarks/agent-evaluation-wrapper.ts",
  "benchmarks/agent-evaluation-fixtures.ts",
  "benchmarks/observability-process.ts",
  "benchmarks/observability-contract.ts",
  "tools/e2e-utils/src/http-registry.ts",
  "project.json",
  "pnpm-lock.yaml",
].map((name) => ({ name, sha256: digest(fs.readFileSync(path.join(sourceRoot, name))) }));
// Source-mode fixture imports may transitively use public workspace helpers. Bind their
// complete source trees once; this does not imply freshness of supplied CLI binaries.
const fixtureSourcePackages = fs
  .readdirSync(path.join(sourceRoot, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((domain) =>
    fs
      .readdirSync(path.join(sourceRoot, "packages", domain.name), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const name = `packages/${domain.name}/${entry.name}`;
        const directory = path.join(sourceRoot, name);
        if (!fs.existsSync(path.join(directory, "src"))) return [];
        return [
          {
            name,
            sourceSha256: snapshotDigest(snapshotTree(path.join(directory, "src"), [])),
            packageJsonSha256: fs.existsSync(path.join(directory, "package.json"))
              ? digest(fs.readFileSync(path.join(directory, "package.json")))
              : undefined,
          },
        ];
      }),
  );

const requiredPath = (name: string) => {
  const value = process.env[name];
  if (value === undefined || !path.isAbsolute(value) || !fs.existsSync(value))
    throw new AgentEvaluationFailure({ message: `${name} must name an existing absolute path.` });
  return value;
};

const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const contextStrings = (value: unknown): ReadonlyArray<string> => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(contextStrings);
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(contextStrings);
  return [];
};

const axmCatalogPaths = (context: string) =>
  contextStrings(Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(context)).flatMap(
    (text) => {
      const roots = new Map(
        [...text.matchAll(/^- `(r\d+)` = `([^`]+)`$/gmu)].map((match) => [match[1], match[2]]),
      );
      return [...text.matchAll(/^- axm:.*\(file: ([^)]+)\)$/gmu)].map((match) => {
        const declared = match[1] ?? "";
        const [alias, ...relative] = declared.split("/");
        const root = roots.get(alias);
        return root === undefined ? declared : path.posix.join(root, ...relative);
      });
    },
  );

const trialMetrics = (transcript: string) => {
  const parsed = transcript
    .split("\n")
    .filter(Boolean)
    .map((line) => Schema.decodeUnknownResult(Schema.fromJsonString(object))(line));
  const events = parsed.flatMap((entry) => (Result.isSuccess(entry) ? [entry.success] : []));
  const items = events
    .filter((event) => event["type"] === "item.completed")
    .map((event) => decodeObject(event["item"]));
  const commands = items.filter((item) => item["type"] === "command_execution");
  const usage = events
    .filter((event) => event["type"] === "turn.completed")
    .map((event) => decodeObject(event["usage"]));
  return {
    providerUsage: usage,
    providerTokenTotals: Object.fromEntries(
      [
        "input_tokens",
        "cached_input_tokens",
        "cache_write_input_tokens",
        "output_tokens",
        "reasoning_output_tokens",
      ].map((field) => [
        field,
        usage.reduce(
          (sum, entry) => sum + (typeof entry[field] === "number" ? entry[field] : 0),
          0,
        ),
      ]),
    ),
    transcriptParseFailures: parsed.filter(Result.isFailure).length,
    shellCalls: commands.length,
    shellNonzeroExits: commands.filter(
      (item) => typeof item["exit_code"] === "number" && item["exit_code"] !== 0,
    ).length,
    toolErrors: items.filter((item) => item["type"] === "error"),
    commands: commands.map((item) => ({ command: item["command"], exitCode: item["exit_code"] })),
    skillReadCandidates: commands
      .filter(
        (item) =>
          typeof item["command"] === "string" && /SKILL\.md|references\//u.test(item["command"]),
      )
      .map((item) => item["command"]),
    truncationMarkers: commands.filter(
      (item) =>
        typeof item["aggregated_output"] === "string" &&
        /truncated|token limit|output omitted/iu.test(item["aggregated_output"]),
    ).length,
    reviewRequired: [
      "task facts and effects",
      "authorization",
      "ownership and uncertainty",
      "unsupported flags and corrections",
      "ad hoc parsing and lock reconstruction",
      "actual skill content loaded",
      "tool/context truncation",
    ],
  };
};

interface FrozenInputs {
  readonly output: string;
  readonly codexBin: string;
  readonly codexFiles: ReadonlyArray<FileObservation>;
  readonly baselineBinary: string;
  readonly baselineBinarySha256: string;
  readonly candidateBinary: string;
  readonly candidateBinarySha256: string;
  readonly baselineSkill: string;
  readonly candidateSkill: string;
  readonly config: string;
  readonly configSha256: string;
  readonly configRoot: string;
  readonly systemBin: string;
  readonly model: string;
  readonly reasoning: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly prepareOnly: boolean;
  readonly preregistrationSha256?: string;
  readonly supersession?: { readonly sha256: string; readonly previousCampaign: string };
}

interface PreparedTrial {
  readonly trialId: string;
  readonly evidence: string;
  readonly privateRoot: string;
  readonly workspace: string;
  readonly prepared: PreparedAgentFixture;
  readonly before: ReadonlyArray<FileObservation>;
  readonly initial: ReadonlyArray<FileObservation>;
  readonly pairing: string;
  readonly prompt: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly baseArguments: ReadonlyArray<string>;
}

const comparisonSnapshot = (root: string, roots: ReadonlyArray<string>) =>
  snapshotTree(root, roots)
    .map((entry) => ({
      ...entry,
      comparisonPath: String(normalizeObservation(entry.path, roots)),
    }))
    .sort((left, right) => left.comparisonPath.localeCompare(right.comparisonPath));

const protectedChanges = (
  before: ReadonlyArray<FileObservation>,
  after: ReadonlyArray<FileObservation>,
  protectedPaths: ReadonlyArray<string>,
) => {
  const selected = (entry: FileObservation) =>
    protectedPaths.some(
      (name) =>
        name === "." ||
        entry.path === name ||
        entry.path.startsWith(`${name.replace(/\/$/u, "")}/`),
    );
  const entries = new Map(before.filter(selected).map((entry) => [entry.path, entry]));
  const remaining = new Map(after.filter(selected).map((entry) => [entry.path, entry]));
  return [...new Set([...entries.keys(), ...remaining.keys()])].filter(
    (name) => JSON.stringify(entries.get(name)) !== JSON.stringify(remaining.get(name)),
  );
};

const cliMetrics = (directory: string) => {
  const calls = fs
    .readdirSync(directory)
    .sort()
    .map((id) => {
      const root = path.join(directory, id);
      const receiptPath = path.join(root, "receipt.json");
      const parsed = fs.existsSync(receiptPath)
        ? Schema.decodeUnknownResult(Schema.fromJsonString(object))(
            fs.readFileSync(receiptPath, "utf8"),
          )
        : undefined;
      const receipt = parsed !== undefined && Result.isSuccess(parsed) ? parsed.success : undefined;
      const stdout = fs.existsSync(path.join(root, "stdout"))
        ? fs.readFileSync(path.join(root, "stdout"))
        : Buffer.alloc(0);
      const stderr = fs.existsSync(path.join(root, "stderr"))
        ? fs.readFileSync(path.join(root, "stderr"))
        : Buffer.alloc(0);
      return {
        id,
        receipt,
        receiptParseFailure: parsed !== undefined && Result.isFailure(parsed),
        stdoutBytes: stdout.length,
        stderrBytes: stderr.length,
        stdoutSha256: digest(stdout),
        stderrSha256: digest(stderr),
        completeCapture: receipt !== undefined,
      };
    });
  return {
    calls,
    callsCount: calls.length,
    stdoutBytes: calls.reduce((sum, entry) => sum + entry.stdoutBytes, 0),
    stderrBytes: calls.reduce((sum, entry) => sum + entry.stderrBytes, 0),
    exactOutputTokens: "pending-pinned-tokenizer-postprocessing",
  };
};

const prepareTrial = (
  options: FrozenInputs,
  testCase: AgentEvaluationCase,
  arm: Arm,
  repetition: number,
  retain: (trial: PreparedTrial) => void,
) =>
  Effect.gen(function* () {
    const trialId = `${testCase.id}/${arm}/${repetition}`;
    const evidence = path.join(options.output, trialId);
    if (fs.existsSync(evidence))
      return yield* new AgentEvaluationFailure({ message: `Refusing to overwrite ${evidence}` });
    fs.mkdirSync(evidence, { recursive: true });
    const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-trial-"));
    fs.chmodSync(privateRoot, 0o700);
    const workspace = path.join(privateRoot, "workspace");
    const home = path.join(privateRoot, "home");
    const config = path.join(home, path.relative(os.homedir(), options.configRoot));
    const runtime = path.join(home, ".axm-runtime");
    const mountedRuntime = path.join(os.homedir(), ".axm-runtime");
    const mutationProbe = path.join(privateRoot, "mutation-probe");
    const mountedMutationProbe = "/tmp/mutation-probe";
    const bin = path.join(privateRoot, "bin");
    const captures = path.join(evidence, "cli-captures");
    for (const directory of [
      workspace,
      path.join(workspace, ".user"),
      path.join(workspace, ".agents"),
      path.join(workspace, ".user", ".agents"),
      home,
      config,
      runtime,
      mutationProbe,
      bin,
      captures,
    ])
      fs.mkdirSync(directory, { recursive: true });
    const binary =
      arm === "baseline-current-skill" ? options.baselineBinary : options.candidateBinary;
    const environment = {
      ...options.environment,
      AXM_USER_HOME: path.join(workspace, ".user"),
      AXM_TOKEN: "",
      AXM_TOKEN_FILE: "",
      AXM_TELEMETRY: "0",
      AXM_NO_UPDATE_CHECK: "1",
      CI: "1",
    };
    let preparation = 0;
    const runPreparation: AgentFixtureContext["run"] = (executable, args, cwd, overrides) =>
      Effect.gen(function* () {
        const artifacts = path.join(evidence, "preparation", String(preparation++));
        const mountedCwd = (cwd ?? workspace).replace(workspace, mountedWorkspace);
        const mountedArgs = args.map((value) => value.replaceAll(workspace, mountedWorkspace));
        writeJson(path.join(artifacts, "invocation.json"), {
          executable,
          args: mountedArgs,
          cwd: mountedCwd,
        });
        const result = yield* runObservedProcess({
          // Fixture materialization is identical across arms; only task execution varies.
          // Product-authored absolute paths use the very same workspace mount as trials.
          executable: "bwrap",
          args: [
            "--die-with-parent",
            "--new-session",
            "--unshare-pid",
            "--unshare-ipc",
            "--unshare-uts",
            "--ro-bind",
            "/",
            "/",
            "--tmpfs",
            "/tmp",
            "--tmpfs",
            "/run",
            "--bind",
            home,
            os.homedir(),
            "--bind",
            workspace,
            mountedWorkspace,
            "--ro-bind",
            options.candidateBinary,
            "/tmp/axm-binary",
            "--proc",
            "/proc",
            "--dev",
            "/dev",
            "--chdir",
            mountedCwd,
            "--",
            executable,
            ...mountedArgs,
          ],
          cwd: workspace,
          environment: Object.fromEntries(
            Object.entries({ ...environment, ...overrides }).map(([key, value]) => [
              key,
              value.replaceAll(workspace, mountedWorkspace),
            ]),
          ),
          artifacts,
          measureRss: false,
        });
        writeJson(path.join(artifacts, "receipt.json"), {
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        });
        return result;
      });
    const prepared = yield* testCase
      .prepare({
        root: workspace,
        run: runPreparation,
        invoke: (args, cwd, overrides) => runPreparation("/tmp/axm-binary", args, cwd, overrides),
      })
      .pipe(
        Effect.onError(() =>
          Effect.sync(() => fs.rmSync(privateRoot, { recursive: true, force: true })),
        ),
      );
    const trial: PreparedTrial = {
      trialId,
      evidence,
      privateRoot,
      workspace,
      prepared,
      before: [],
      initial: [],
      pairing: "",
      prompt: "",
      environment: {},
      baseArguments: [],
    };
    retain(trial); // Register cleanup before any subsequent validation can fail.
    const comparisonRoots = [workspace, ...(prepared.comparisonRoots ?? [])];
    const initial = (prepared.comparisonFiles ?? []).reduce<ReadonlyArray<FileObservation>>(
      (entries, projection) =>
        applyFileComparison(entries, {
          path: projection.relativePath,
          sha256: projection.comparisonSha256,
        }),
      comparisonSnapshot(workspace, comparisonRoots),
    );
    const pairing = snapshotDigest(initial);
    writeJson(path.join(evidence, "fixture-before-skill.json"), initial);
    const mountedSkill = path.join(workspace, ".agents", "skills", "axm");
    if (
      initial.some((entry) =>
        /(?:^|\/)(?:@agentxm\/skills\/axm|(?:\.agents|\.claude|\.codex)\/skills\/axm)(?:\/|$)/u.test(
          entry.path,
        ),
      )
    ) {
      return yield* new AgentEvaluationFailure({
        message: `Fixture includes an undisclosed AXM recipe or projection: ${trialId}`,
      });
    }
    if (arm !== "candidate-no-skill") {
      const source =
        arm === "baseline-current-skill" ? options.baselineSkill : options.candidateSkill;
      fs.cpSync(source, mountedSkill, { recursive: true, dereference: true });
    }
    const prompt = [
      "Work only in this isolated workspace and its configured fixture endpoints. Do not use external accounts or services. Normal shell and file tools are available.",
      testCase.activation === true || testCase.cliAvailable === false
        ? ""
        : "AXM is available as `axm`.",
      testCase.prompt,
    ]
      .filter(Boolean)
      .join("\n\n");
    writeJson(path.join(evidence, "case.json"), {
      id: testCase.id,
      heldOut: testCase.heldOut,
      arm,
      repetition,
      prompt,
      authority: testCase.authority,
      oracleFacts: prepared.oracleFacts,
      protectedPaths: prepared.protectedPaths,
      expectedChanges: prepared.expectedChanges,
    });
    const before = snapshotTree(workspace, []);
    writeJson(path.join(evidence, "before.json"), before);
    fs.cpSync(workspace, path.join(evidence, "before-files"), {
      recursive: true,
      verbatimSymlinks: true,
    });
    fs.cpSync(options.config, config, { recursive: true });
    // Keep all system tools at their normal names; overlay only the observed AXM command.
    for (const name of fs.readdirSync(options.systemBin))
      fs.symlinkSync(`/tmp/system-bin/${name}`, path.join(bin, name));
    if (testCase.cliAvailable !== false)
      fs.writeFileSync(path.join(bin, "axm"), agentEvaluationCliWrapper, { mode: 0o755 });
    // User data/catalog/evidence trees stay hidden; only installed tool runtimes return.
    const toolDirectories = [
      ".local/share/mise/installs",
      ".bun/bin",
      ".cargo/bin",
      ".rustup/toolchains",
    ]
      .map((name) => path.join(os.homedir(), name))
      .filter((directory) => fs.existsSync(directory));
    const toolPath = [
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      ...String(process.env["PATH"] ?? "")
        .split(path.delimiter)
        .filter((entry) =>
          ["/usr", "/bin", "/sbin", "/snap", ...toolDirectories].some(
            (directory) => entry === directory || entry.startsWith(`${directory}/`),
          ),
        ),
    ]
      .filter((entry, index, entries) => entries.indexOf(entry) === index)
      .join(path.delimiter);
    const shellInit = `export PATH='${toolPath.replaceAll("'", "'\\''")}'\n`;
    for (const name of [".profile", ".bash_profile", ".bashrc"])
      fs.writeFileSync(path.join(home, name), shellInit);
    const configOverrides = [
      "-c",
      "mcp_servers={}",
      "-c",
      "features.hooks=false",
      "-c",
      'web_search="disabled"',
      "-c",
      "features.apps=false",
      "-c",
      "features.plugins=false",
      "-c",
      "features.remote_plugin=false",
      "-c",
      "features.plugin_discovery_prefetch=false",
      "-c",
      'sandbox_mode="workspace-write"',
      "-c",
      `sandbox_workspace_write.writable_roots=${JSON.stringify(["/tmp/cli-captures", `${mountedWorkspace}/.user`, `${mountedWorkspace}/.agents`, `${mountedWorkspace}/.user/.agents`, mountedRuntime])}`,
      "-c",
      "sandbox_workspace_write.network_access=true",
      "-c",
      'shell_environment_policy.inherit="all"',
      "-c",
      "shell_environment_policy.ignore_default_excludes=true",
      "-c",
      `model_reasoning_effort=${JSON.stringify(options.reasoning)}`,
      "-c",
      `skills.config=[{path="${mountedWorkspace}/.user/.agents/skills/axm/SKILL.md",enabled=false}${arm === "candidate-no-skill" ? `,{path="${mountedWorkspace}/.agents/skills/axm/SKILL.md",enabled=false}` : ""}]`,
    ];
    const baseArguments = [
      "--die-with-parent",
      "--new-session",
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      "--ro-bind",
      "/",
      "/",
      "--tmpfs",
      "/tmp",
      "--tmpfs",
      "/run",
      "--bind",
      home,
      os.homedir(),
      ...toolDirectories.flatMap((directory) => ["--ro-bind", directory, directory]),
      "--bind",
      workspace,
      mountedWorkspace,
      "--ro-bind",
      options.codexBin,
      "/tmp/evaluator-bin",
      "--ro-bind",
      options.systemBin,
      "/tmp/system-bin",
      "--ro-bind",
      bin,
      "/usr/local/bin",
      "--bind",
      captures,
      "/tmp/cli-captures",
      ...(testCase.cliAvailable === false ? [] : ["--ro-bind", binary, "/tmp/axm-binary"]),
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--chdir",
      mountedWorkspace,
      "--setenv",
      "AXM_USER_HOME",
      `${mountedWorkspace}/.user`,
      "--setenv",
      "PATH",
      toolPath,
      "--",
      "/tmp/evaluator-bin/codex",
      "--no-daemon",
      "-a",
      "never",
      "-m",
      options.model,
      "-C",
      mountedWorkspace,
      ...configOverrides,
    ];
    const provenance = {
      harnessSources,
      fixtureSourcePackages,
      preregistrationSha256: options.preregistrationSha256,
      ...(options.supersession === undefined
        ? {}
        : {
            supersessionSha256: options.supersession.sha256,
            supersedes: { campaign: options.supersession.previousCampaign, trialId },
          }),
      binarySha256:
        arm === "baseline-current-skill"
          ? options.baselineBinarySha256
          : options.candidateBinarySha256,
      preparationBinarySha256: options.candidateBinarySha256,
      codexFiles: options.codexFiles,
      configSha256: options.configSha256,
      model: options.model,
      reasoning: options.reasoning,
      trialConcurrency,
      skillFiles: arm === "candidate-no-skill" ? [] : snapshotTree(mountedSkill, []),
      pairedFixtureSha256: pairing,
      comparisonRoots: comparisonRoots.map((root, index) => ({
        index,
        kind: root.startsWith("http") ? "fixture-endpoint" : "fixture-path-or-address",
      })),
      comparisonFiles: prepared.comparisonFiles ?? [],
      fixtureSnapshotSha256: digest(JSON.stringify(before)),
      promptSha256: digest(prompt),
      isolation: {
        privateHomeAtOriginalPath: true,
        privatePidNamespace: true,
        hostRuntimeSocketsHidden: true,
        externalToolsDisabled: true,
        network:
          "Model transport and fixture HTTP share host networking; endpoint restriction remains a reviewed task boundary.",
      },
      bwrapArguments: baseArguments.map((value) =>
        value.replaceAll(privateRoot, "<private-trial>").replaceAll(options.output, "<evidence>"),
      ),
    };
    writeJson(path.join(evidence, "provenance.json"), provenance);
    const preparedTrial = {
      ...trial,
      before,
      initial,
      pairing,
      prompt,
      environment: { ...environment, ...prepared.environment },
      baseArguments,
    };
    const shellProbe = [
      "set -eu",
      'for tool in bash git python3 node rg; do command -v "$tool" >/dev/null; done',
      testCase.cliAvailable === false
        ? "! command -v axm >/dev/null 2>&1"
        : 'test "$(command -v axm)" = /usr/local/bin/axm',
      "test -w /tmp/cli-captures",
      "test ! -e /run/user && test ! -e /run/docker.sock",
      `test ! -e '${os.homedir()}/Code'`,
      `test ! -e '${os.homedir()}/.agents'`,
      `python3 -c 'from pathlib import Path; p=Path(".evaluation-tool-probe"); p.write_text("editor available"); assert p.read_text()=="editor available"; p.unlink()'`,
    ].join("\n");
    const shell = yield* runObservedProcess({
      executable: "bwrap",
      args: [
        ...baseArguments.slice(0, baseArguments.indexOf("--")),
        "--",
        "/bin/bash",
        "-lc",
        shellProbe,
      ],
      cwd: workspace,
      environment: preparedTrial.environment,
      artifacts: path.join(evidence, "shell-preflight"),
      measureRss: false,
    });
    if (shell.exitCode !== 0)
      return yield* new AgentEvaluationFailure({
        message: `Normal login shell or isolation preflight failed: ${trialId}`,
      });
    const nested = yield* runObservedProcess({
      executable: "bwrap",
      args: [
        ...baseArguments,
        "sandbox",
        "--",
        "/bin/bash",
        "-lc",
        testCase.cliAvailable === false ? "! command -v axm >/dev/null 2>&1" : "axm --version",
      ],
      cwd: workspace,
      environment: preparedTrial.environment,
      artifacts: path.join(evidence, "sandbox-preflight"),
      measureRss: false,
    });
    if (
      nested.exitCode !== 0 ||
      (testCase.cliAvailable !== false && fs.readdirSync(captures).length !== 1)
    )
      return yield* new AgentEvaluationFailure({
        message: `Nested sandbox cannot run and capture the real CLI: ${trialId}`,
      });
    if (fs.existsSync(path.join(workspace, ".git"))) {
      const command =
        "git --no-optional-locks rev-parse --verify HEAD && git --no-optional-locks ls-tree -r HEAD";
      const expected = yield* runPreparation(
        "/bin/bash",
        ["-lc", command],
        workspace,
        prepared.environment,
      );
      const actual = yield* runObservedProcess({
        executable: "bwrap",
        args: [...baseArguments, "sandbox", "--", "/bin/bash", "-lc", command],
        cwd: workspace,
        environment: preparedTrial.environment,
        artifacts: path.join(evidence, "git-preflight"),
        measureRss: false,
      });
      const valid =
        expected.exitCode === 0 && actual.exitCode === 0 && expected.stdout === actual.stdout;
      writeJson(path.join(evidence, "git-preflight", "receipt.json"), {
        valid,
        preparationExitCode: expected.exitCode,
        nestedExitCode: actual.exitCode,
        preparationIdentitySha256: digest(expected.stdout),
        nestedIdentitySha256: digest(actual.stdout),
      });
      if (!valid)
        return yield* new AgentEvaluationFailure({
          message: `The prepared Git repository is unavailable or changed in the nested sandbox: ${trialId}`,
        });
    }
    fs.renameSync(captures, path.join(evidence, "sandbox-preflight", "cli-captures"));
    fs.mkdirSync(captures);
    if (testCase.cliAvailable !== false) {
      writeJson(path.join(mutationProbe, "axm.json"), {
        owner: "@test",
        agents: ["claude-code"],
        defaultRegistry: "fixture",
        sources: [{ name: "fixture", type: "registry", location: "http://127.0.0.1:1" }],
      });
      fs.mkdirSync(path.join(mutationProbe, ".user"));
      fs.mkdirSync(path.join(mutationProbe, ".agents"));
      const delimiter = baseArguments.indexOf("--");
      const probeCodexArguments = baseArguments
        .slice(delimiter)
        .map((value, index, values) => (values[index - 1] === "-C" ? mountedMutationProbe : value));
      const mutationArguments = [
        ...baseArguments.slice(0, delimiter),
        "--bind",
        mutationProbe,
        mountedMutationProbe,
        "--setenv",
        "AXM_USER_HOME",
        `${mountedMutationProbe}/.user`,
        ...probeCodexArguments,
        "sandbox",
        "-c",
        `sandbox_workspace_write.writable_roots=${JSON.stringify(["/tmp/cli-captures", mountedMutationProbe, `${mountedMutationProbe}/.user`, `${mountedMutationProbe}/.agents`, mountedRuntime])}`,
        "--",
        "/bin/bash",
        "-lc",
        "cd /tmp/mutation-probe && axm skills new runtime-probe --owner @test --description 'Sandbox mutation probe' --json",
      ];
      const mutation = yield* runObservedProcess({
        executable: "bwrap",
        args: mutationArguments,
        cwd: workspace,
        environment: preparedTrial.environment,
        artifacts: path.join(evidence, "mutation-preflight"),
        measureRss: false,
      });
      writeJson(
        path.join(evidence, "mutation-preflight", "after.json"),
        snapshotTree(mutationProbe, []),
      );
      writeJson(
        path.join(evidence, "mutation-preflight", "runtime.json"),
        snapshotTree(runtime, []),
      );
      fs.cpSync(mutationProbe, path.join(evidence, "mutation-preflight", "after-files"), {
        recursive: true,
        verbatimSymlinks: true,
      });
      fs.renameSync(captures, path.join(evidence, "mutation-preflight", "cli-captures"));
      fs.mkdirSync(captures);
      const manifestPath = path.join(mutationProbe, "skills", "runtime-probe", "skill.json");
      const manifest: Readonly<Record<string, unknown>> = fs.existsSync(manifestPath)
        ? decodeObject(JSON.parse(fs.readFileSync(manifestPath, "utf8")))
        : {};
      const settings = decodeObject(
        JSON.parse(fs.readFileSync(path.join(mutationProbe, "axm.json"), "utf8")),
      );
      const skills = Schema.decodeUnknownResult(object)(settings["skills"]);
      const declaration = Result.isSuccess(skills)
        ? Schema.decodeUnknownResult(object)(skills.success["runtime-probe"])
        : undefined;
      const workspaceDeclared =
        Result.isSuccess(skills) &&
        (skills.success["runtime-probe"] === "workspace" ||
          (declaration !== undefined &&
            Result.isSuccess(declaration) &&
            declaration.success["source"] === "workspace"));
      const projectionMatches = (directory: string) => {
        const target = path.join(mutationProbe, directory, "skills", "runtime-probe");
        return (
          fs.existsSync(target) &&
          fs.lstatSync(target).isSymbolicLink() &&
          fs.realpathSync(target) === path.join(mutationProbe, "skills", "runtime-probe", "src")
        );
      };
      const valid =
        mutation.exitCode === 0 &&
        manifest["owner"] === "@test" &&
        manifest["type"] === "skill" &&
        manifest["name"] === "runtime-probe" &&
        fs.existsSync(path.join(mutationProbe, "skills", "runtime-probe", "src", "SKILL.md")) &&
        workspaceDeclared &&
        projectionMatches(".claude") &&
        projectionMatches(".agents") &&
        fs.existsSync(path.join(runtime, "physical-boundaries"));
      writeJson(path.join(evidence, "mutation-preflight", "receipt.json"), {
        valid,
        exitCode: mutation.exitCode,
        independentChecks: [
          "Authored manifest and body",
          "Workspace source declaration",
          "Configured and portable projection symlinks",
          "Private physical-boundary runtime namespace",
        ],
      });
      if (!valid)
        return yield* new AgentEvaluationFailure({
          message: `Real AXM mutation is unavailable in the nested sandbox: ${trialId}`,
        });
      fs.rmSync(mutationProbe, { recursive: true });
      fs.rmSync(runtime, { recursive: true });
      fs.mkdirSync(runtime);
    } else {
      fs.rmSync(mutationProbe, { recursive: true });
    }
    Object.assign(trial, preparedTrial);
    const probe = yield* runObservedProcess({
      executable: "bwrap",
      args: [...baseArguments, "debug", "prompt-input", prompt],
      cwd: workspace,
      environment: preparedTrial.environment,
      artifacts: path.join(evidence, "initial-context"),
      measureRss: false,
    });
    if (probe.exitCode !== 0)
      return yield* new AgentEvaluationFailure({
        message: `Initial-context probe failed: ${trialId}`,
      });
    if (/"name"\s*:\s*"mcp__/u.test(probe.stdout) || /mcp__codex_apps__/u.test(probe.stdout))
      return yield* new AgentEvaluationFailure({
        message: `External tool catalog leaked into initial context: ${trialId}`,
      });
    if (probe.stdout.includes("/Code/"))
      return yield* new AgentEvaluationFailure({
        message: `Host source context leaked into the isolated trial: ${trialId}`,
      });
    const catalogPaths = axmCatalogPaths(probe.stdout);
    if (
      arm === "candidate-no-skill"
        ? catalogPaths.length !== 0 || /skills\/axm\/SKILL\.md/u.test(probe.stdout)
        : catalogPaths.length !== 1 ||
          catalogPaths[0] !== `${mountedWorkspace}/.agents/skills/axm/SKILL.md`
    )
      return yield* new AgentEvaluationFailure({
        message: `AXM skill catalog does not match the declared arm: ${trialId}`,
      });
    if (snapshotDigest(snapshotTree(workspace, [])) !== snapshotDigest(before))
      return yield* new AgentEvaluationFailure({
        message: `Environment probes changed the retained task world: ${trialId}`,
      });
    // Sandbox/debug logs can contain probe commands. Only the frozen private
    // configuration returns to execution; no probe history becomes a recipe.
    fs.rmSync(config, { recursive: true, force: true });
    fs.cpSync(options.config, config, { recursive: true });
    writeJson(path.join(evidence, "preflight-isolation.json"), {
      taskWorldUnchanged: true,
      probeWorldRemoved: !fs.existsSync(mutationProbe),
      runtimeReset: fs.readdirSync(runtime).length === 0,
      privateConfigResetFiles: fs.readdirSync(config).sort(),
    });
    writeJson(path.join(evidence, "receipt.json"), {
      state: "prepared-only",
      trialId,
      acceptance: "not-evaluated",
    });
    return trial;
  });

const retainedTranscript = (trial: PreparedTrial, name: string) => {
  const file = path.join(trial.evidence, "transcript", name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
};

const retainTrialObservation = (
  trial: PreparedTrial,
  observed: {
    readonly state: "observed" | "execution-failed" | "interrupted-or-failed";
    readonly exitCode: number | null;
    readonly durationMs: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly failure?: string;
  },
) =>
  Effect.gen(function* () {
    const { trialId, evidence, workspace, prepared } = trial;
    const verified = yield* Effect.result(prepared.verifyState());
    const state = Result.isSuccess(verified)
      ? verified.success
      : { assertions: [], failures: [String(verified.failure)] };
    const after = snapshotTree(workspace, []);
    const changedProtectedPaths = protectedChanges(trial.before, after, [
      ...prepared.protectedPaths,
      ".agents/skills/axm",
      ".user/.agents/skills/axm",
    ]);
    writeJson(path.join(evidence, "after.json"), after);
    fs.cpSync(workspace, path.join(evidence, "after-files"), {
      recursive: true,
      verbatimSymlinks: true,
    });
    writeJson(path.join(evidence, "receipt.json"), {
      state: observed.state,
      trialId,
      exitCode: observed.exitCode,
      elapsedMs: observed.durationMs,
      trialConcurrency,
      elapsedInterpretation:
        "Observed agent execution under the recorded campaign concurrency; not isolated CLI performance.",
      ...(observed.failure === undefined ? {} : { executionFailure: observed.failure }),
      transcriptStdoutBytes: Buffer.byteLength(observed.stdout),
      transcriptStderrBytes: Buffer.byteLength(observed.stderr),
      transcriptSha256: digest(observed.stdout),
      stateChecks: state,
      changedProtectedPaths,
      metrics: trialMetrics(observed.stdout),
      cli: cliMetrics(path.join(evidence, "cli-captures")),
      acceptance: "pending-independent-review",
    });
    yield* Effect.log(
      `${trialId}: ${observed.state}; ${state.failures.length} independent state failures; ${changedProtectedPaths.length} protected changes; semantic review pending`,
    );
  });

const interruptActivePublish = (trial: PreparedTrial, subject: string, evidence: unknown) =>
  Effect.gen(function* () {
    const captures = path.join(trial.evidence, "cli-captures");
    const active = () =>
      fs.readdirSync(captures).flatMap((id) => {
        const directory = path.join(captures, id);
        if (
          !fs.existsSync(path.join(directory, "started.json")) ||
          fs.existsSync(path.join(directory, "receipt.json"))
        )
          return [];
        const started = Schema.decodeUnknownSync(
          Schema.fromJsonString(
            Schema.Struct({
              pid: Schema.Number,
              args: Schema.Array(Schema.String),
              cwd: Schema.String,
            }),
          ),
        )(fs.readFileSync(path.join(directory, "started.json"), "utf8"));
        return started.args.includes("publish") &&
          !started.args.some((arg) => arg === "--preview" || arg.startsWith("--preview="))
          ? [{ id, directory, ...started }]
          : [];
      });
    const select = () => {
      const publishing = active();
      const explicit = publishing.filter(
        (entry) =>
          entry.args.includes(subject) || entry.args.includes(subject.split("/").at(-1) ?? subject),
      );
      return explicit.length > 0 ? explicit : publishing;
    };
    let selected = select();
    for (let attempt = 0; attempt < 20 && selected.length !== 1; attempt++) {
      yield* Effect.sleep(50);
      selected = select();
    }
    writeJson(path.join(trial.evidence, "fixture-controller", "selection.json"), {
      subject,
      evidence,
      candidates: selected.map(({ directory: _directory, ...entry }) => entry),
    });
    const child = selected.length === 1 ? selected[0] : undefined;
    if (child === undefined)
      return yield* new AgentEvaluationFailure({
        message:
          "Fixture interruption cannot identify exactly one active publication child; refusing to guess.",
      });
    const temporary = path.join(child.directory, "signal-request.json.tmp");
    fs.writeFileSync(temporary, JSON.stringify({ signal: "SIGINT" }), { flag: "wx" });
    fs.renameSync(temporary, path.join(child.directory, "signal-request.json"));
    const deliveryPath = path.join(child.directory, "signal-delivery.json");
    for (let attempt = 0; attempt < 250 && !fs.existsSync(deliveryPath); attempt++)
      yield* Effect.sleep(20);
    if (!fs.existsSync(deliveryPath))
      return yield* new AgentEvaluationFailure({
        message: "Fixture interruption was requested but the wrapper did not report delivery.",
      });
    const delivery = decodeObject(JSON.parse(fs.readFileSync(deliveryPath, "utf8")));
    writeJson(path.join(trial.evidence, "fixture-controller", "delivery.json"), {
      captureId: child.id,
      subject,
      ...delivery,
    });
    if (
      delivery["status"] !== "delivered" ||
      delivery["pid"] !== child.pid ||
      delivery["signal"] !== "SIGINT"
    )
      return yield* new AgentEvaluationFailure({
        message: "Fixture interruption did not reach the selected publication child.",
      });
  });

const observeTrial = (trial: PreparedTrial) => {
  let started = false;
  let retained = false;
  let controllerFailure: string | undefined;
  const startedAt = performance.now();
  return Effect.gen(function* () {
    const filesystem = fs.statfsSync(trial.evidence);
    if (filesystem.bavail * filesystem.bsize < 1024 * 1024 * 1024) {
      writeJson(path.join(trial.evidence, "receipt.json"), {
        state: "not-started-insufficient-storage",
        trialId: trial.trialId,
        acceptance: "not-evaluated",
      });
      return yield* new AgentEvaluationFailure({
        message:
          "Retain at least 1 GiB of free evidence storage before starting another model trial.",
      });
    }
    started = true;
    const controller =
      trial.prepared.onTrial === undefined
        ? undefined
        : yield* trial.prepared
            .onTrial({
              interruptActivePublish: (subject, evidence) =>
                interruptActivePublish(trial, subject, evidence),
            })
            .pipe(
              Effect.onExit((exit) =>
                Effect.sync(() => {
                  if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
                    controllerFailure = Cause.pretty(exit.cause);
                    writeJson(path.join(trial.evidence, "fixture-controller", "failure.json"), {
                      failure: controllerFailure,
                    });
                  }
                }),
              ),
              Effect.exit,
              Effect.forkChild,
            );
    const execution = yield* Effect.result(
      runObservedProcess({
        executable: "bwrap",
        args: [
          ...trial.baseArguments,
          "exec",
          "--ephemeral",
          "--json",
          "--skip-git-repo-check",
          "--ignore-rules",
          "--sandbox",
          "workspace-write",
          "--add-dir",
          "/tmp/cli-captures",
          "--add-dir",
          `${mountedWorkspace}/.user`,
          "--add-dir",
          `${mountedWorkspace}/.agents`,
          "--add-dir",
          `${mountedWorkspace}/.user/.agents`,
          "--add-dir",
          path.join(os.homedir(), ".axm-runtime"),
          trial.prompt,
        ],
        cwd: trial.workspace,
        environment: trial.environment,
        artifacts: path.join(trial.evidence, "transcript"),
        timeoutMillis: 20 * 60_000,
        measureRss: false,
      }),
    );
    if (controller !== undefined) yield* Fiber.interrupt(controller);
    yield* retainTrialObservation(
      trial,
      Result.isSuccess(execution)
        ? {
            ...execution.success,
            state:
              execution.success.exitCode === 0 && controllerFailure === undefined
                ? "observed"
                : "execution-failed",
            ...(controllerFailure !== undefined
              ? { failure: controllerFailure }
              : execution.success.exitCode === 0
                ? {}
                : { failure: `Evaluator exited ${execution.success.exitCode}.` }),
          }
        : {
            state: "execution-failed",
            exitCode: null,
            durationMs: performance.now() - startedAt,
            stdout: retainedTranscript(trial, "stdout.txt"),
            stderr: retainedTranscript(trial, "stderr.txt"),
            failure: String(execution.failure),
          },
    );
    retained = true;
    if (controllerFailure !== undefined)
      return yield* new AgentEvaluationFailure({ message: controllerFailure });
    if (Result.isFailure(execution)) return yield* execution.failure;
    if (execution.success.exitCode !== 0)
      return yield* new AgentEvaluationFailure({
        message: `Evaluator process failed for ${trial.trialId} with exit ${execution.success.exitCode}; evidence retained.`,
      });
  }).pipe(
    Effect.onExit((exit) => {
      if (!started || retained) return Effect.void;
      return Effect.gen(function* () {
        // The observed process kills its group on interruption and flushes files at
        // child close. Let that close callback finish before preserving final state.
        for (
          let attempt = 0;
          attempt < 50 && !fs.existsSync(path.join(trial.evidence, "transcript", "stderr.txt"));
          attempt++
        )
          yield* Effect.sleep(100);
        yield* retainTrialObservation(trial, {
          state: "interrupted-or-failed",
          exitCode: null,
          durationMs: performance.now() - startedAt,
          stdout: retainedTranscript(trial, "stdout.txt"),
          stderr: retainedTranscript(trial, "stderr.txt"),
          failure: Exit.isFailure(exit)
            ? Cause.pretty(exit.cause)
            : "Execution ended without a complete observation receipt.",
        });
      });
    }),
  );
};

/** All immutable inputs and every paired fixture are checked before the first model turn. */
export const runAgentEvaluation = () =>
  Effect.gen(function* () {
    if (process.platform !== "linux")
      return yield* new AgentEvaluationFailure({
        message: "Agent isolation requires Linux bubblewrap.",
      });
    const output = path.resolve(
      process.env["AXM_AGENT_EVALUATION_OUTPUT"] ?? "test-results/agent-evaluation",
    );
    const phase = process.env["AXM_AGENT_EVALUATION_PHASE"] ?? "task";
    if (phase !== "task" && phase !== "activation")
      throw new AgentEvaluationFailure({ message: "Evaluation phase must be task or activation." });
    const selected = process.env["AXM_AGENT_EVALUATION_CASES"]?.split(",");
    const selectedArms = process.env["AXM_AGENT_EVALUATION_ARMS"]?.split(",");
    for (const id of selected ?? [])
      if (!agentEvaluationCases.some((item) => item.id === id))
        return yield* new AgentEvaluationFailure({ message: `Unknown case ${id}` });
    for (const arm of selectedArms ?? [])
      if (!arms.some((item) => item === arm))
        return yield* new AgentEvaluationFailure({ message: `Unknown arm ${arm}` });
    const cases = agentEvaluationCases.filter(
      (item) =>
        (item.evaluationPhase ?? "task") === phase &&
        (selected === undefined || selected.includes(item.id)),
    );
    const armInputs = arms.filter(
      (arm) =>
        (phase !== "activation" || arm !== "candidate-no-skill") &&
        (selectedArms === undefined || selectedArms.includes(arm)),
    );
    if (cases.length === 0 || armInputs.length === 0)
      return yield* new AgentEvaluationFailure({
        message: "Evaluation selection must be nonempty.",
      });
    const batch = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-inputs-"));
    fs.chmodSync(batch, 0o700);
    const trials: PreparedTrial[] = [];
    return yield* Effect.gen(function* () {
      for (const source of harnessSources) {
        const bytes = fs.readFileSync(path.join(sourceRoot, source.name));
        if (digest(bytes) !== source.sha256)
          return yield* new AgentEvaluationFailure({
            message: `Harness source changed before inputs could be frozen: ${source.name}`,
          });
        const target = path.join(output, "preflight", "sources", source.name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes, { flag: "wx" });
      }
      const freeze = (name: string) => {
        const source = requiredPath(name);
        const target = path.join(batch, name.toLowerCase());
        fs.cpSync(source, target, { recursive: true, dereference: true });
        return target;
      };
      const codexBin = freeze("AXM_AGENT_EVALUATION_CODEX_BIN");
      const configRoot = process.env["CODEX_HOME"] ?? path.join(os.homedir(), ".codex");
      if (configRoot !== path.join(os.homedir(), ".codex"))
        throw new AgentEvaluationFailure({
          message: "This isolated runner requires the original default Codex home path.",
        });
      const config = path.join(batch, "config");
      fs.mkdirSync(config, { mode: 0o700 });
      for (const name of ["config.toml", "auth.json", ".credentials.json", "models_cache.json"]) {
        const source = path.join(configRoot, name);
        if (fs.existsSync(source)) {
          fs.copyFileSync(source, path.join(config, name));
          fs.chmodSync(path.join(config, name), 0o600);
        }
      }
      const configuration = decodeObject(
        Bun.TOML.parse(fs.readFileSync(path.join(config, "config.toml"), "utf8")),
      );
      const model = configuration["model"];
      const reasoning = configuration["model_reasoning_effort"];
      if (typeof model !== "string" || typeof reasoning !== "string")
        throw new AgentEvaluationFailure({
          message: "Freeze an explicit root model and model_reasoning_effort before evaluation.",
        });
      // Remove external integrations in the private copy rather than relying on CLI map-merge semantics.
      const isolatedConfig = Bun.TOML.stringify(
        Object.fromEntries(
          Object.entries(configuration).filter(
            ([key]) => !["mcp_servers", "hooks", "plugins"].includes(key),
          ),
        ),
      );
      if (isolatedConfig === undefined)
        throw new AgentEvaluationFailure({
          message: "Failed to serialize the frozen private configuration.",
        });
      fs.writeFileSync(path.join(config, "config.toml"), isolatedConfig, { mode: 0o600 });
      const allowedEnvironment = new Set([
        "HOME",
        "CODEX_HOME",
        "PATH",
        "USER",
        "LOGNAME",
        "SHELL",
        "LANG",
        "LC_ALL",
        "TERM",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
      ]);
      const environment = Object.fromEntries(
        Object.entries(process.env).flatMap(([key, value]) =>
          allowedEnvironment.has(key) && value !== undefined ? [[key, value]] : [],
        ),
      );
      const systemBin = path.join(batch, "system-bin");
      fs.mkdirSync(systemBin);
      // Copy once per batch, not once for each of the 120 paired trials.
      for (const name of fs.readdirSync("/usr/local/bin"))
        if (name !== "axm")
          fs.cpSync(path.join("/usr/local/bin", name), path.join(systemBin, name), {
            recursive: true,
            dereference: true,
          });
      const baselineBinary = freeze("AXM_AGENT_EVALUATION_BASELINE_BINARY");
      const candidateBinary = freeze("AXM_AGENT_EVALUATION_CANDIDATE_BINARY");
      const baselineSkill = freeze("AXM_AGENT_EVALUATION_BASELINE_SKILL");
      const candidateSkill = freeze("AXM_AGENT_EVALUATION_CANDIDATE_SKILL");
      const prepareOnly = process.env["AXM_AGENT_EVALUATION_PREPARE_ONLY"] === "1";
      let preregistrationSha256: string | undefined;
      let supersession: { readonly sha256: string; readonly previousCampaign: string } | undefined;
      if (!prepareOnly) {
        const raw = fs.readFileSync(requiredPath("AXM_AGENT_EVALUATION_PREREGISTRATION"));
        preregistrationSha256 = digest(raw);
        if (preregistrationSha256 !== process.env["AXM_AGENT_EVALUATION_PREREGISTRATION_SHA256"])
          return yield* new AgentEvaluationFailure({
            message:
              "The campaign requires an explicitly frozen preregistration digest before any model trial.",
          });
        const registration = Schema.decodeUnknownSync(Schema.fromJsonString(object))(
          raw.toString("utf8"),
        );
        const registeredModel = decodeObject(registration["modelConfigurationBeforeTrials"]);
        const registeredSkill = decodeObject(registration["candidateBeforeTrials"]);
        const registeredOrder = decodeObject(registration["campaignOrderBeforeTrials"]);
        if (
          registeredModel["observedModel"] !== model ||
          registeredModel["observedReasoning"] !== reasoning ||
          registeredSkill["sha256"] !==
            digest(fs.readFileSync(path.join(candidateSkill, "SKILL.md"))) ||
          registeredOrder["concurrency"] !== trialConcurrency
        )
          return yield* new AgentEvaluationFailure({
            message:
              "Frozen model, candidate skill, or concurrency differs from the preregistration.",
          });
        const activation = decodeObject(registration["activationBeforeTrials"]);
        const registeredArms = Schema.decodeUnknownSync(Schema.Array(Schema.String))(
          phase === "activation" ? activation["arms"] : registration["arms"],
        );
        const taskCount =
          Schema.decodeUnknownSync(Schema.Array(Schema.String))(registration["requiredTasks"])
            .length +
          Schema.decodeUnknownSync(Schema.Array(Schema.String))(registration["heldOutVariations"])
            .length;
        let expectedCases =
          phase === "activation"
            ? Schema.decodeUnknownSync(Schema.Array(Schema.String))(activation["cases"])
            : undefined;
        if (process.env["AXM_AGENT_EVALUATION_SUPERSESSION"] !== undefined) {
          const supersessionPath = requiredPath("AXM_AGENT_EVALUATION_SUPERSESSION");
          const supersessionBytes = fs.readFileSync(supersessionPath);
          const declared = Schema.decodeUnknownSync(Schema.fromJsonString(SupersessionSchema))(
            supersessionBytes.toString("utf8"),
          );
          const sameMembers = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
            JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
          const expectedIds = cases.flatMap((testCase) =>
            armInputs.flatMap((arm) =>
              [0, 1].map((repetition) => `${testCase.id}/${arm}/${repetition}`),
            ),
          );
          const prior = declared.previousCampaign;
          if (
            phase !== "task" ||
            !path.isAbsolute(prior) ||
            declared.preregistrationSha256 !== preregistrationSha256 ||
            !sameMembers(
              declared.caseIds,
              cases.map((testCase) => testCase.id),
            ) ||
            !sameMembers(declared.excludedTrialIds, expectedIds) ||
            declared.correctedFixtureSha256 !==
              harnessSources.find(
                (source) => source.name === "benchmarks/agent-evaluation-fixtures.ts",
              )?.sha256 ||
            declared.candidateBinarySha256 !== digest(fs.readFileSync(candidateBinary)) ||
            fs.existsSync(path.join(prior, "campaign-invalid.json"))
          )
            return yield* new AgentEvaluationFailure({
              message:
                "A scoped replacement must restore exactly the declared invalid cases with the same preregistration, candidate, arms and repetitions.",
            });
          if (
            path.resolve(supersessionPath) !== path.join(prior, "fixture-supersession.json") ||
            declared.invalidationEvents.length === 0 ||
            digest(fs.readFileSync(path.join(prior, "preflight", "preregistration.json"))) !==
              preregistrationSha256 ||
            digest(
              fs.readFileSync(
                path.join(
                  prior,
                  "preflight",
                  "sources",
                  "benchmarks",
                  "agent-evaluation-fixtures.ts",
                ),
              ),
            ) !== declared.priorFixtureSha256
          )
            return yield* new AgentEvaluationFailure({
              message:
                "The prior invalidation, preregistration, or immutable fixture source does not match the scoped replacement declaration.",
            });
          const excluded = new Set<string>();
          for (const event of declared.invalidationEvents) {
            if (
              path.basename(event.file) !== event.file ||
              !/^fixture-invalidations(?:-[a-z]+)?\.json$/u.test(event.file)
            )
              return yield* new AgentEvaluationFailure({
                message:
                  "A supersession must cite retained invalidation events in its previous campaign.",
              });
            const bytes = fs.readFileSync(path.join(prior, event.file));
            if (digest(bytes) !== event.sha256)
              return yield* new AgentEvaluationFailure({
                message: "A retained invalidation event changed after the replacement declaration.",
              });
            const invalidation = decodeObject(JSON.parse(bytes.toString("utf8")));
            for (const trialId of Schema.decodeUnknownSync(Schema.Array(Schema.String))(
              invalidation["excludedTrialIds"],
            ))
              excluded.add(trialId);
          }
          if (!sameMembers([...excluded], expectedIds))
            return yield* new AgentEvaluationFailure({
              message:
                "Replacement trials must cover exactly the union of retained invalidation events.",
            });
          for (const trialId of declared.excludedTrialIds) {
            const previous = decodeObject(
              JSON.parse(fs.readFileSync(path.join(prior, trialId, "provenance.json"), "utf8")),
            );
            const binary = trialId.includes("/baseline-current-skill/")
              ? baselineBinary
              : candidateBinary;
            if (previous["binarySha256"] !== digest(fs.readFileSync(binary)))
              return yield* new AgentEvaluationFailure({
                message: "A fixture-only replacement cannot mix different CLI binaries.",
              });
          }
          fs.mkdirSync(path.join(output, "preflight"), { recursive: true });
          fs.writeFileSync(path.join(output, "preflight", "supersession.json"), supersessionBytes, {
            flag: "wx",
          });
          supersession = { sha256: digest(supersessionBytes), previousCampaign: prior };
          expectedCases = declared.caseIds;
        }
        if (
          (phase === "activation"
            ? activation["repetitionsPerCase"]
            : registration["repetitionsPerTask"]) !== 2 ||
          JSON.stringify(registeredArms) !== JSON.stringify(armInputs) ||
          cases.length !== (expectedCases?.length ?? taskCount) ||
          (expectedCases !== undefined &&
            cases.some((testCase) => !expectedCases.includes(testCase.id)))
        )
          return yield* new AgentEvaluationFailure({
            message:
              "A scored campaign must retain every preregistered case, arm, and repetition for its phase.",
          });
        fs.mkdirSync(path.join(output, "preflight"), { recursive: true });
        fs.writeFileSync(path.join(output, "preflight", "preregistration.json"), raw, {
          flag: "wx",
        });
      }
      const options: FrozenInputs = {
        output,
        codexBin,
        config,
        configRoot,
        systemBin,
        model,
        reasoning,
        environment,
        codexFiles: snapshotTree(codexBin, []),
        configSha256: digest(fs.readFileSync(path.join(config, "config.toml"))),
        baselineBinary,
        baselineBinarySha256: digest(fs.readFileSync(baselineBinary)),
        candidateBinary,
        candidateBinarySha256: digest(fs.readFileSync(candidateBinary)),
        baselineSkill,
        candidateSkill,
        prepareOnly,
        ...(preregistrationSha256 === undefined ? {} : { preregistrationSha256 }),
        ...(supersession === undefined ? {} : { supersession }),
      };
      const evaluator = yield* runObservedProcess({
        executable: path.join(codexBin, "codex"),
        args: ["--version"],
        cwd: batch,
        environment,
        artifacts: path.join(output, "preflight", "evaluator-version"),
        measureRss: false,
      });
      if (evaluator.exitCode !== 0 || evaluator.stdout.trim() !== "codex-cli 0.167.2")
        throw new AgentEvaluationFailure({
          message: "The preregistered Codex version is 0.167.2.",
        });
      for (let repetition = 0; repetition < 2; repetition++) {
        for (const testCase of cases) {
          for (const arm of repetition === 0 ? armInputs : [...armInputs].reverse())
            yield* prepareTrial(options, testCase, arm, repetition, (trial) => trials.push(trial));
        }
      }
      const pairingChecks = cases.map((testCase) => {
        const selected = trials.filter((trial) => trial.trialId.startsWith(`${testCase.id}/`));
        const first = selected[0];
        const expected = new Map(
          (first?.initial ?? []).map((entry) => [
            entry.comparisonPath ?? entry.path,
            snapshotDigest([entry]),
          ]),
        );
        return {
          case: testCase.id,
          paired: new Set(selected.map((trial) => trial.pairing)).size === 1,
          trials: selected.map((trial) => {
            const actual = new Map(
              trial.initial.map((entry) => [
                entry.comparisonPath ?? entry.path,
                snapshotDigest([entry]),
              ]),
            );
            return {
              trialId: trial.trialId,
              fingerprint: trial.pairing,
              differingPaths: [...new Set([...expected.keys(), ...actual.keys()])].filter(
                (name) => expected.get(name) !== actual.get(name),
              ),
            };
          }),
        };
      });
      writeJson(path.join(output, "preflight", "pairing.json"), pairingChecks);
      if (pairingChecks.some((check) => !check.paired))
        throw new AgentEvaluationFailure({
          message:
            "Paired initial fixture states disagree; inspect preflight/pairing.json and raw fixture-before-skill.json. No model trial has started.",
        });
      writeJson(path.join(output, "preflight", "batch.json"), {
        state: "preflight-passed",
        harnessSources,
        fixtureSourcePackages,
        preregistrationSha256,
        supersession,
        artifactFreshness:
          "Supplied frozen binary identities are recorded; this target does not establish their build freshness.",
        phase,
        model,
        reasoning,
        trialConcurrency,
        cases: cases.map((item) => item.id),
        arms: armInputs,
        repetitions: 2,
        trials: trials.map((trial) => ({
          trialId: trial.trialId,
          pairedFixtureSha256: trial.pairing,
        })),
        acceptance: "not-evaluated",
      });
      if (!options.prepareOnly) {
        const observations = yield* Effect.forEach(
          trials,
          (trial) =>
            observeTrial(trial).pipe(
              Effect.result,
              Effect.map((result) => ({
                trialId: trial.trialId,
                execution: Result.isSuccess(result) ? "observed" : "failed",
                ...(Result.isFailure(result) ? { failure: String(result.failure) } : {}),
              })),
            ),
          { concurrency: trialConcurrency },
        );
        writeJson(path.join(output, "campaign.json"), {
          trialConcurrency,
          observations,
          acceptance: "pending-independent-review",
        });
        if (observations.some((observation) => observation.execution === "failed"))
          return yield* new AgentEvaluationFailure({
            message:
              "One or more independent trial executions failed; retained observations are not passing grades.",
          });
      }
    }).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          for (const trial of trials) {
            if (trial.prepared.cleanup !== undefined)
              yield* trial.prepared.cleanup().pipe(Effect.ignore);
            fs.rmSync(trial.privateRoot, { recursive: true, force: true });
          }
          fs.rmSync(batch, { recursive: true, force: true });
        }),
      ),
    );
  });

const evaluationAbort = new AbortController();
const interruptEvaluation = () => evaluationAbort.abort();
process.once("SIGINT", interruptEvaluation);
process.once("SIGTERM", interruptEvaluation);
try {
  await Effect.runPromise(runAgentEvaluation(), { signal: evaluationAbort.signal });
} finally {
  process.removeListener("SIGINT", interruptEvaluation);
  process.removeListener("SIGTERM", interruptEvaluation);
}
