/** Paired task worlds and independent rubrics. None of this module is mounted in a trial. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import {
  startHttpRegistry,
  type HttpRegistry,
  type HttpRegistryOptions,
} from "@agentxm/client-e2e-utils/http-registry";
import {
  emitLockfileToml,
  acquiredExtensionDisplayPathFromLockEntry,
  acquiredRootDisplayPath,
  computeMaterializedTreeIntegrity,
  parseLockfileToml,
  LockfileSchema,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  storedLockfileFixture,
  makeRegistrySkillLockEntry,
  makeRegistryPackLockEntry,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import {
  readContainerReceipts,
  applyStructuralInverse,
  type ContainerIdentity,
} from "@agentxm/workspace-kernel/locations";
import { normalizeObservation } from "./observability-process.js";

import type {
  AgentEvaluationCase,
  AgentFixtureContext,
  PreparedAgentFixture,
} from "./agent-evaluation-contract.js";

const agentEvaluationSandboxRoot = "/tmp/workspace";
class AgentFixturePreparationFailed extends Data.TaggedError("AgentFixturePreparationFailed")<{
  readonly detail: string;
}> {}

const owner = "@test";
const registryToken = "e2e-test-token";
const unavailableRegistry = "http://127.0.0.1:1";
const record = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));
const packDependencies = Schema.decodeUnknownSync(PackManifestSchema.fields.dependencies);
const write = (root: string, relative: string, text: string) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
};
const json = (root: string, relative: string, value: unknown) =>
  write(root, relative, `${JSON.stringify(value, null, 2)}\n`);
const readJson = (root: string, relative: string) =>
  record(JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")));
const acceptedRows = (root: string) =>
  record(
    Schema.decodeUnknownSync(LockfileSchema)(
      parseLockfileToml(fs.readFileSync(path.join(root, "axm.lock"), "utf8")).document,
    ),
  );
const priorAcceptedRowsRemain = (before: Readonly<Record<string, unknown>>, root: string) => {
  try {
    const after = acceptedRows(root);
    return ["skills", "mcpServers", "subagents", "rules", "hooks", "knowledge", "packs"].every(
      (kind) => {
        const previous = before[kind] === undefined ? {} : record(before[kind]);
        const current = after[kind] === undefined ? {} : record(after[kind]);
        return Object.entries(previous).every(
          ([name, value]) => JSON.stringify(value) === JSON.stringify(current[name]),
        );
      },
    );
  } catch {
    return false;
  }
};
const settings = (root: string, value: Readonly<Record<string, unknown>> = {}, prefix = "") => {
  json(root, `${prefix}axm.json`, {
    owner,
    agents: ["claude-code"],
    defaultRegistry: "fixture",
    sources: [{ name: "fixture", type: "registry", location: unavailableRegistry }],
    minimumReleaseAge: "0s",
    ...value,
  });
  write(root, `${prefix}axm.lock`, emitLockfileToml(storedLockfileFixture({})));
};
const skill = (
  root: string,
  name: string,
  body = "Review the change and record its risks.",
  directory = `skills/${name}`,
) => {
  json(root, `${directory}/skill.json`, {
    owner,
    type: "skill",
    name,
    version: "1.0.0",
    description: `Guidance for ${name}`,
  });
  write(
    root,
    `${directory}/src/SKILL.md`,
    `---\nname: ${name}\ndescription: Guidance for ${name}\n---\n\n# ${name}\n\n${body}\n`,
  );
};
const pack = (
  root: string,
  name: string,
  dependencies: Readonly<Record<string, unknown>>,
  directory = `packs/${name}`,
) =>
  json(root, `${directory}/pack.json`, {
    owner,
    type: "pack",
    name,
    version: "1.0.0",
    description: `The ${name} team bundle`,
    dependencies,
  });
const relativeLink = (root: string, relative: string, target: string) => {
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(destination), path.join(root, target)), destination);
};
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
// Linux cache placement is owned by host-primitives/cache-root.ts and
// registry-client/archive-cache.ts. UUID diagnostic records are owned by the
// CLI terminal-diagnostics writer. No user workspace/accepted state is exempt.
const ignored = (relative: string) =>
  relative === ".agents/skills/axm" ||
  relative.startsWith(".agents/skills/axm/") ||
  /^\.user\/\.cache\/axm\/archives\/[A-Za-z0-9_-]+\.zip$/u.test(relative) ||
  relative === ".user/.cache/axm/update-check.json" ||
  /^\.user\/\.axm\/diagnostics\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/u.test(
    relative,
  );
const snapshot = (root: string, includeIncidentalArtifacts = false) => {
  const rows = new Map<string, string>();
  const walk = (relative: string) => {
    if (!includeIncidentalArtifacts && ignored(relative)) return;
    const absolute = path.join(root, relative);
    const info = fs.lstatSync(absolute);
    if (info.isSymbolicLink()) rows.set(relative, `link:${fs.readlinkSync(absolute)}`);
    else if (info.isDirectory())
      for (const name of fs.readdirSync(absolute).sort())
        walk(relative === "" ? name : `${relative}/${name}`);
    else rows.set(relative, `${info.mode & 0o777}:${digest(fs.readFileSync(absolute))}`);
  };
  walk("");
  return rows;
};
const under = (relative: string, root: string) =>
  relative === root || relative.startsWith(`${root}/`);
interface StateCheck {
  readonly assertion: string;
  readonly check: () => boolean;
}
const finished = (
  context: AgentFixtureContext,
  options: {
    readonly facts: ReadonlyArray<string>;
    readonly allowed?: ReadonlyArray<string>;
    readonly protected?: ReadonlyArray<string>;
    readonly checks?: ReadonlyArray<StateCheck>;
    readonly environment?: Readonly<Record<string, string>>;
    readonly servers?: ReadonlyArray<HttpRegistry>;
  },
): PreparedAgentFixture => {
  const before = snapshot(context.root);
  const allowed = options.allowed ?? [];
  const protectedPaths =
    options.protected ??
    [...before.keys()].filter((file) => !allowed.some((prefix) => under(file, prefix)));
  return {
    protectedPaths,
    expectedChanges: allowed,
    oracleFacts: options.facts,
    comparisonRoots: (options.servers ?? []).flatMap((server) => {
      const materialized = acquiredExtensionDisplayPathFromLockEntry(
        "agent_extensions",
        acceptedSkill(server.url),
        "skills",
        "retained",
      );
      const encodedHost = path.relative("agent_extensions", materialized).split(path.sep)[0];
      return [
        server.url,
        new URL(server.url).host,
        ...(encodedHost === undefined ? [] : [encodedHost]),
      ];
    }),
    cleanup: () =>
      Effect.forEach(options.servers ?? [], (server) => Effect.tryPromise(() => server.close()), {
        discard: true,
      }),
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    verifyState: () =>
      Effect.try(() => {
        const after = snapshot(context.root);
        const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
          (file) => before.get(file) !== after.get(file),
        );
        const failures = changed
          .filter(
            (file) =>
              protectedPaths.some((prefix) => under(file, prefix)) ||
              !allowed.some((prefix) => under(file, prefix)),
          )
          .map((file) => `Unauthorized persistent state change: ${file}`);
        const assertions = [
          "Independent file and symbolic-link snapshots compared across the selected project and user scope.",
        ];
        for (const check of options.checks ?? []) {
          try {
            if (check.check()) assertions.push(check.assertion);
            else failures.push(check.assertion);
          } catch (cause) {
            failures.push(
              `${check.assertion} (the resulting state could not establish this fact: ${String(cause)})`,
            );
          }
        }
        return { assertions, failures };
      }),
  };
};
const hasText = (root: string, file: string, text: string) =>
  fs.existsSync(path.join(root, file)) &&
  fs.readFileSync(path.join(root, file), "utf8").includes(text);
const hasEnvironmentReference = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasEnvironmentReference);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(
    ([key, entry]) =>
      (key === "env" && typeof entry === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry)) ||
      hasEnvironmentReference(entry),
  );
};
const invoke = (
  context: AgentFixtureContext,
  args: ReadonlyArray<string>,
  cwd = context.root,
  environment: Readonly<Record<string, string>> = {},
) =>
  Effect.gen(function* () {
    const result = yield* context.invoke(args, cwd, {
      AXM_USER_HOME: path.join(context.root, ".user"),
      AXM_TELEMETRY: "0",
      AXM_NO_UPDATE_CHECK: "1",
      ...environment,
    });
    if (result.exitCode !== 0)
      return yield* new AgentFixturePreparationFailed({
        detail: `Fixture preparation failed: axm ${args.join(" ")} (${result.exitCode})\n${result.stdout}\n${result.stderr}`,
      });
    return result;
  });
const registry = (options: HttpRegistryOptions = {}) =>
  Effect.tryPromise(() => startHttpRegistry(options));
const configureRegistry = (root: string, server: HttpRegistry) =>
  settings(root, { sources: [{ name: "fixture", type: "registry", location: server.url }] });
const newSkill = (context: AgentFixtureContext, name: string) =>
  invoke(context, [
    "skills",
    "new",
    name,
    "--owner",
    owner,
    "--description",
    `Guidance for ${name}`,
  ]);
const publicationGit = (context: AgentFixtureContext) =>
  Effect.gen(function* () {
    const environment = {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
    };
    const git = (args: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        const result = yield* context.run("git", args, context.root, environment);
        if (result.exitCode !== 0)
          return yield* new AgentFixturePreparationFailed({
            detail: `Publication Git preparation failed (${result.exitCode}): ${result.stdout}\n${result.stderr}`,
          });
      });
    yield* git(["init", "--template=", "--initial-branch=fixture"]);
    // Package bytes are deterministic; per-world Registry endpoints remain in
    // untracked, independently protected axm.json rather than opaque Git objects.
    yield* git(["add", "--", "skills"]);
    yield* git([
      "-c",
      "user.name=Evaluation fixture",
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "Initial publication fixture",
    ]);
    // A fresh read-tree index keeps exact paths/modes/blob IDs without volatile
    // filesystem stat-cache fields. Raw .git bytes still participate in pairing.
    fs.unlinkSync(path.join(context.root, ".git/index"));
    yield* git(["read-tree", "HEAD"]);
  });
const publish = (context: AgentFixtureContext, name: string) =>
  invoke(
    context,
    ["skills", "publish", `${owner}/skills/${name}`, "--registry", "fixture", "--accept-warnings"],
    context.root,
    { AXM_TOKEN: registryToken },
  );
const acceptedSkill = (endpoint = unavailableRegistry, name = "retained") =>
  makeRegistrySkillLockEntry({
    owner: decodeHandleSync(owner),
    name,
    endpoint: decodeRegistryEndpointSync(endpoint),
  });
const userPack = (
  context: AgentFixtureContext,
  name: string,
  dependencies: Readonly<Record<string, string>>,
) =>
  Effect.gen(function* () {
    const accepted = yield* makeRegistryPackLockEntry({
      owner: decodeHandleSync(owner),
      name,
      endpoint: decodeRegistryEndpointSync(unavailableRegistry),
      dependencies: packDependencies(dependencies),
    });
    const directory = acquiredExtensionDisplayPathFromLockEntry(
      `.user/${acquiredRootDisplayPath("user")}`,
      accepted,
      "packs",
      name,
    );
    pack(context.root, name, dependencies, directory);
    const treeIntegrity = yield* computeMaterializedTreeIntegrity(
      path.join(context.root, directory),
    ).pipe(Effect.provide(NodeServices.layer));
    return { ...accepted, treeIntegrity };
  });
const acquisition = (context: AgentFixtureContext, name: string) =>
  Effect.gen(function* () {
    const server = yield* registry();
    const publisherRoot = path.join(context.root, ".seed-publisher");
    const publisher = { ...context, root: publisherRoot };
    configureRegistry(publisherRoot, server);
    yield* newSkill(publisher, name);
    yield* publish(publisher, name);
    // The consumer starts with no publisher provenance or stale native receipts.
    fs.rmSync(publisherRoot, { recursive: true, force: true });
    configureRegistry(context.root, server);
    yield* invoke(context, [
      "skills",
      "install",
      `fixture:${owner}/skills/${name}`,
      "--accept-execution-changes",
    ]);
    return server;
  });

/** Verify physical receipt proofs during preparation; normalize only independently witnessed facts. */
const receiptComparison = (root: string) => {
  const proofs = new Map<
    string,
    {
      readonly id: string;
      readonly generation: number;
      readonly kind: "live" | "historical-scratch";
      readonly identity: ContainerIdentity;
      readonly processWindow: { readonly startedAt: number; readonly endedAt: number };
    }
  >();
  const bodies = new Map<string, string>();
  const proofAddress = (identity: ContainerIdentity) =>
    JSON.stringify({
      nativeRoot: identity.nativeRoot,
      ownerRoot: identity.ownerRoot,
      identityOwnerRoot: identity.identityOwnerRoot,
      target: identity.target,
      physicalPath: identity.physicalPath,
      owner: identity.owner.path,
      root: identity.root.path,
      parents: identity.parents.map((parent) => parent.path),
      aliases: identity.aliases,
    });
  const hostPath = (target: string) => {
    if (!under(target, agentEvaluationSandboxRoot))
      throw new AgentFixturePreparationFailed({
        detail: `Receipt points outside the trial workspace: ${target}`,
      });
    return path.join(root, path.relative(agentEvaluationSandboxRoot, target));
  };
  const nativeIdentity = (target: string) => {
    const info = fs.statSync(hostPath(target), { bigint: true });
    return {
      device: info.dev.toString(),
      inode: info.ino.toString(),
      birthtime: info.birthtime.getTime(),
      mode: Number(info.mode),
    };
  };
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  const referentMatches = (target: string, expected: string) =>
    fs.realpathSync(hostPath(target)) === hostPath(expected);
  const located = (identity: ContainerIdentity) => [
    identity.owner,
    identity.root,
    ...identity.parents,
  ];
  const ancestorsMatch = (identity: ContainerIdentity) =>
    located(identity).every((entry) => same(entry.identity, nativeIdentity(entry.path))) &&
    referentMatches(identity.identityOwnerRoot, identity.owner.path) &&
    referentMatches(identity.nativeRoot, identity.root.path);
  const live = (identity: ContainerIdentity) => {
    try {
      return (
        ancestorsMatch(identity) &&
        same(identity.entry, nativeIdentity(identity.physicalPath)) &&
        referentMatches(identity.target, identity.physicalPath) &&
        identity.aliases.every(
          (alias) =>
            referentMatches(alias.path, alias.referentPath) &&
            path.join(
              fs.realpathSync(path.dirname(hostPath(alias.path))),
              path.basename(alias.path),
            ) === hostPath(alias.entryPath) &&
            (fs.lstatSync(hostPath(alias.entryPath)).isSymbolicLink()
              ? fs.readlinkSync(hostPath(alias.entryPath))
              : undefined) === alias.linkTarget,
        )
      );
    } catch {
      return false;
    }
  };
  const historical = (identity: ContainerIdentity, startedAt: number, endedAt: number) => {
    const scratch = `${identity.nativeRoot}/.axm/tmp`;
    try {
      return (
        identity.ownerRoot === identity.nativeRoot &&
        identity.identityOwnerRoot === identity.nativeRoot &&
        identity.owner.path === identity.nativeRoot &&
        identity.root.path === identity.nativeRoot &&
        identity.target === scratch &&
        identity.physicalPath === scratch &&
        identity.parents.length === 1 &&
        identity.parents[0]?.path === `${identity.nativeRoot}/.axm` &&
        identity.aliases.length === 1 &&
        identity.aliases[0]?.path === scratch &&
        identity.aliases[0]?.entryPath === scratch &&
        identity.aliases[0]?.referentPath === scratch &&
        identity.aliases[0]?.linkTarget === undefined &&
        !fs.existsSync(hostPath(scratch)) &&
        ancestorsMatch(identity) &&
        identity.entry.device === identity.parents[0]?.identity.device &&
        (identity.entry.mode & 0o170000) === 0o040000 &&
        /^[1-9]\d*$/u.test(identity.entry.inode) &&
        identity.entry.birthtime >= startedAt &&
        identity.entry.birthtime <= endedAt
      );
    } catch {
      return false;
    }
  };
  const capture = (workspace: string, startedAt: number, endedAt: number) =>
    Effect.gen(function* () {
      const directory = path.join(workspace, ".axm");
      if (!fs.existsSync(path.join(directory, "projection-containers.json"))) return;
      const receipts = yield* readContainerReceipts(directory).pipe(
        Effect.provide(NodeServices.layer),
      );
      for (const [identity, scratchAllowed] of [
        ...receipts.entries.map((entry) => [entry.identity, false] as const),
        ...receipts.createdDirectories.map((identity) => [identity, true] as const),
      ]) {
        const key = JSON.stringify(identity);
        if (proofs.has(key)) continue;
        const observed = live(identity)
          ? "live"
          : scratchAllowed && historical(identity, startedAt, endedAt)
            ? "historical-scratch"
            : undefined;
        if (observed === undefined)
          return yield* new AgentFixturePreparationFailed({
            detail: `Unverified preparation receipt identity at ${identity.target}; no comparison projection is authorized.`,
          });
        const generation =
          [...proofs.values()].filter(
            (proof) => proofAddress(proof.identity) === proofAddress(identity),
          ).length + 1;
        proofs.set(key, {
          id: `proof-${proofs.size + 1}`,
          generation,
          kind: observed,
          identity,
          processWindow: { startedAt, endedAt },
        });
      }
      for (const receipt of receipts.entries) {
        const target = hostPath(receipt.identity.physicalPath);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
        const current = fs.readFileSync(target, "utf8");
        if (receipt.contentSha256 === digest(current)) bodies.set(receipt.contentSha256, current);
        if (receipt.inverse === undefined) continue;
        const before = yield* applyStructuralInverse(current, receipt.inverse);
        if (Option.isSome(before)) {
          bodies.set(receipt.inverse.beforeSha256, before.value);
          bodies.set(receipt.inverse.afterSha256, current);
        }
      }
    });
  const project = (prepared: PreparedAgentFixture) =>
    Effect.gen(function* () {
      const relativePath = ".axm/projection-containers.json";
      if (!fs.existsSync(path.join(root, relativePath))) return prepared;
      const receipts = yield* readContainerReceipts(path.join(root, ".axm")).pipe(
        Effect.provide(NodeServices.layer),
      );
      const normalize = (value: unknown) =>
        normalizeObservation(value, [root, ...(prepared.comparisonRoots ?? [])]);
      const identity = (value: ContainerIdentity) =>
        Effect.gen(function* () {
          const proof = proofs.get(JSON.stringify(value));
          if (proof === undefined)
            return yield* new AgentFixturePreparationFailed({
              detail: `Receipt was not independently verified during preparation: ${value.target}`,
            });
          const label = `${digest(String(normalize(proofAddress(value))))}:${proof.generation}`;
          const fields = (entry: ContainerIdentity["entry"], suffix: string) => ({
            ...entry,
            inode: `<${label}:${proof.kind}:${suffix}:inode>`,
            birthtime: `<${label}:${proof.kind}:${suffix}:birthtime>`,
          });
          return {
            ...value,
            owner: { ...value.owner, identity: fields(value.owner.identity, "owner") },
            root: { ...value.root, identity: fields(value.root.identity, "root") },
            parents: value.parents.map((parent, index) => ({
              ...parent,
              identity: fields(parent.identity, `parent-${index}`),
            })),
            entry: fields(value.entry, "entry"),
            comparisonProof: {
              kind: proof.kind,
              current: live(value)
                ? "live"
                : proof.kind === "historical-scratch"
                  ? "removed-scratch"
                  : "expired-after-observed-preparation",
            },
          };
        });
      const hash = (value: string) => {
        const observed = bodies.get(value);
        return observed === undefined ? value : digest(String(normalize(observed)));
      };
      // Native parent-directory units may settle concurrently. Reorder only a
      // contiguous run of disjoint directory groups; retain each unit's internal
      // parent/child order, non-directory barriers, and all overlapping groups.
      const canonicalEntries: Array<(typeof receipts.entries)[number]> = [];
      const canonicalizedDirectoryGroups: Array<{
        readonly original: ReadonlyArray<string>;
        readonly canonical: ReadonlyArray<string>;
        readonly physicalBoundaries: ReadonlyArray<ReadonlyArray<string>>;
      }> = [];
      let offset = 0;
      while (offset < receipts.entries.length) {
        const entry = receipts.entries[offset];
        if (entry === undefined) break;
        if (entry.kind !== "created-directory") {
          canonicalEntries.push(entry);
          offset++;
          continue;
        }
        const groups: Array<{
          readonly unit: string;
          readonly entries: Array<(typeof receipts.entries)[number]>;
        }> = [];
        while (receipts.entries[offset]?.kind === "created-directory") {
          const directory = receipts.entries[offset];
          if (directory === undefined) break;
          const previous = groups.at(-1);
          if (previous?.unit === directory.unit) previous.entries.push(directory);
          else groups.push({ unit: directory.unit, entries: [directory] });
          offset++;
        }
        const disjoint = groups.every((group, index) =>
          groups
            .slice(index + 1)
            .every(
              (other) =>
                group.unit !== other.unit &&
                group.entries.every((left) =>
                  other.entries.every(
                    (right) =>
                      !under(left.identity.physicalPath, right.identity.physicalPath) &&
                      !under(right.identity.physicalPath, left.identity.physicalPath),
                  ),
                ),
            ),
        );
        const ordered = disjoint
          ? [...groups].sort((left, right) =>
              String(normalize(left.unit)).localeCompare(String(normalize(right.unit))),
            )
          : groups;
        canonicalEntries.push(...ordered.flatMap((group) => group.entries));
        if (disjoint)
          canonicalizedDirectoryGroups.push({
            original: groups.map((group) => group.unit),
            canonical: ordered.map((group) => group.unit),
            physicalBoundaries: groups.map((group) =>
              group.entries.map((entry) => entry.identity.physicalPath),
            ),
          });
      }
      const entries = yield* Effect.forEach(canonicalEntries, (entry) =>
        Effect.gen(function* () {
          return {
            ...entry,
            identity: yield* identity(entry.identity),
            ...(entry.contentSha256 === undefined
              ? {}
              : { contentSha256: hash(entry.contentSha256) }),
            ...(entry.inverse === undefined
              ? {}
              : {
                  inverse: {
                    ...entry.inverse,
                    beforeSha256: hash(entry.inverse.beforeSha256),
                    afterSha256: hash(entry.inverse.afterSha256),
                  },
                }),
          };
        }),
      );
      const createdDirectories = yield* Effect.forEach(receipts.createdDirectories, identity);
      const projected = normalize({ ...receipts, entries, createdDirectories });
      return {
        ...prepared,
        comparisonFiles: [
          {
            relativePath,
            comparisonDocument: projected,
            verificationEvidence: {
              identities: [...proofs.values()],
              canonicalizedDirectoryGroups,
              observedBodies: [...bodies.entries()].map(([rawSha256, text]) => ({
                rawSha256,
                text,
                comparisonSha256: digest(String(normalize(text))),
              })),
            },
            comparisonSha256: digest(JSON.stringify(projected)),
            reason:
              "Raw receipts remain retained. Only inode/birthtime fields of exact independently verified identities are substituted with address/generation labels; live, expired and exact cleaned scratch proofs remain distinct. Contiguous disjoint created-directory units are ordered by normalized unit; within-unit order, overlapping groups, non-directory barriers and createdDirectories order remain strict. Device, mode, ownership, paths, aliases, inverse edits and unknown digests stay strict. Verified hashes are recomputed only from observed bytes after declared endpoint/path spelling normalization.",
          },
        ],
      } satisfies PreparedAgentFixture;
    });
  return { capture, project };
};

const cases: ReadonlyArray<AgentEvaluationCase> = [
  {
    id: "offline-explanation-malformed-workspace",
    heldOut: false,
    authority: "read-only",
    prompt:
      "Explain what an AXM Pack does and how local inspection differs from Registry inspection. The workspace configuration is broken; do not repair it or contact a Registry. Give a short explanation using the installed tool's offline discovery if useful.",
    prepare: (context) =>
      Effect.sync(() => {
        write(context.root, "axm.json", "{ broken settings\n");
        write(context.root, "notes.txt", "Keep this case intact.\n");
        return finished(context, {
          facts: [
            "A Pack declares a reusable set of extension dependencies.",
            "Local inspection reports current selected-scope facts; Registry view reports published metadata.",
            "Offline help remains usable without constructing the malformed workspace.",
            "No workspace repair, setup, authentication, or remote access is authorized.",
          ],
        });
      }),
  },
  {
    id: "ordinary-creation-without-engineering-pack",
    heldOut: false,
    authority: "local-edit",
    prompt:
      "Create a project Skill named release-notes under @test. It should tell an agent to summarize user-visible changes and distinguish breaking changes. Use the workspace's existing agent configuration. No additional pack installation is requested.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root);
        return finished(context, {
          facts: [
            "One authored project Skill provides the requested guidance.",
            "No engineering Pack or unrelated extensions are installed.",
            "The configured agent list remains claude-code.",
          ],
          allowed: [
            ".axm",
            "skills/release-notes",
            "axm.json",
            "axm.lock",
            ".claude/skills/release-notes",
            ".agents/skills/release-notes",
          ],
          checks: [
            {
              assertion: "The authored Skill manifest exists.",
              check: () =>
                hasText(context.root, "skills/release-notes/skill.json", "release-notes"),
            },
            {
              assertion: "The authored Skill body discusses breaking changes.",
              check: () =>
                fs.existsSync(path.join(context.root, "skills/release-notes/src/SKILL.md")) &&
                fs
                  .readFileSync(
                    path.join(context.root, "skills/release-notes/src/SKILL.md"),
                    "utf8",
                  )
                  .toLowerCase()
                  .includes("breaking"),
            },
            {
              assertion: "Creation did not install an engineering Pack.",
              check: () =>
                !fs.existsSync(path.join(context.root, "packs")) &&
                !fs.existsSync(path.join(context.root, "agent_extensions")),
            },
          ],
        });
      }),
  },
  {
    id: "projected-path-edit",
    heldOut: false,
    authority: "local-edit",
    prompt:
      "The review guidance seen at .claude/skills/review/SKILL.md needs this sentence added: 'Always record the rollback plan.' Make the change at its editable owner, preserve the projection, and explain where you edited.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root, { skills: { review: { source: "workspace" } } });
        skill(context.root, "review");
        relativeLink(context.root, ".claude/skills/review", "skills/review/src");
        return finished(context, {
          facts: [
            "The editable source is skills/review/src/SKILL.md.",
            "The Claude path is a projection symlink, not an independent source.",
            "The requested sentence is present at the authored owner; the link remains unchanged.",
          ],
          allowed: ["skills/review/src/SKILL.md"],
          checks: [
            {
              assertion: "Requested guidance was added to authored source.",
              check: () =>
                hasText(
                  context.root,
                  "skills/review/src/SKILL.md",
                  "Always record the rollback plan.",
                ),
            },
          ],
        });
      }),
  },
  {
    id: "acquired-customization",
    heldOut: false,
    authority: "local-edit",
    prompt:
      "Customize the installed review Skill into a separately authored @test/skills/review-local Skill. Add: 'Use our internal release checklist.' Keep the acquired review package and its recorded acceptance intact. Do not publish anything.",
    prepare: (context) =>
      Effect.gen(function* () {
        const server = yield* acquisition(context, "review");
        const acceptedBefore = acceptedRows(context.root);
        const uploadsBefore = server.publishes.length;
        return finished(context, {
          servers: [server],
          facts: [
            "The installed review source is acquired and has no direct edit owner.",
            "A supported fork or equivalent explicit authoring transition creates review-local.",
            "The acquired review bytes and accepted version remain unchanged.",
            "No Registry upload is authorized.",
          ],
          allowed: [
            ".axm",
            "skills/review-local",
            "axm.json",
            "axm.lock",
            ".claude/skills/review-local",
            ".agents/skills/review-local",
          ],
          protected: ["agent_extensions"],
          checks: [
            {
              assertion: "Customization did not publish any release.",
              check: () => server.publishes.length === uploadsBefore,
            },
            {
              assertion:
                "All original accepted package records and their source/version/integrity facts remain unchanged.",
              check: () => priorAcceptedRowsRemain(acceptedBefore, context.root),
            },
            {
              assertion: "Customization exists in a separately authored package.",
              check: () =>
                hasText(
                  context.root,
                  "skills/review-local/src/SKILL.md",
                  "Use our internal release checklist.",
                ),
            },
          ],
        });
      }),
  },
  {
    id: "two-pack-retention",
    heldOut: false,
    authority: "read-only",
    prompt:
      "Why is review still required? Explain every direct or Pack route that keeps it in this project, and whether deleting one Pack declaration would make it unneeded. Inspect only; do not remove or disable anything.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root, {
          skills: { review: { source: "fixture:@test/skills/review" } },
          packs: { platform: { source: "workspace" }, release: { source: "workspace" } },
        });
        pack(context.root, "platform", { "@test/skills/review": "^1.0.0" });
        pack(context.root, "release", { "@test/skills/review": "^1.0.0" });
        return finished(context, {
          facts: [
            "review has a direct declaration plus independent platform and release Pack routes.",
            "Removing one Pack declaration leaves both the other Pack route and the direct declaration.",
            "No physical presence or runtime health follows from desired reachability.",
          ],
        });
      }),
  },
  {
    id: "unresolved-pack-accepted-only",
    heldOut: false,
    authority: "read-only",
    prompt:
      "Can retained safely be called unused? There is an unresolved bundle in this workspace. Explain what is known about retained's accepted version, local presence, desired reachability, and any missing evidence. Do not clean up or sync.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root, { packs: { unresolved: { source: "workspace" } } });
        write(
          context.root,
          "axm.lock",
          emitLockfileToml(storedLockfileFixture({ skills: { retained: acceptedSkill() } })),
        );
        return finished(context, {
          facts: [
            "retained has an accepted Registry record at version 1.0.0.",
            "Its canonical content is absent.",
            "The unresolved Pack prevents a complete claim that no desired route remains.",
            "Accepted state alone proves neither desired reachability nor physical presence.",
            "No deletion or sync is authorized.",
          ],
        });
      }),
  },
  {
    id: "shared-mcp-file",
    heldOut: false,
    authority: "read-only",
    prompt:
      "Explain the AXM-owned contributors in .mcp.json and where each should be edited. Keep the unrelated foreign registration and all other settings intact. Do not launch or contact any MCP server.",
    prepare: (context) =>
      Effect.sync(() => {
        const connection = { transport: "stdio", command: "node", args: ["server.js"] };
        settings(context.root, { mcpServers: { work: { connection }, personal: { connection } } });
        json(context.root, ".mcp.json", {
          mcpServers: {
            work: { command: "node", args: ["server.js"] },
            personal: { command: "node", args: ["server.js"] },
            foreign: { command: "unmanaged-binary", args: [] },
          },
          keep: true,
        });
        return finished(context, {
          facts: [
            "work and personal are distinct inline declarations owned by their axm.json entries.",
            "A shared native file is not wholly owned by either contributor.",
            "foreign and keep remain unowned remainder.",
            "Passive native inspection does not establish runtime health.",
          ],
        });
      }),
  },
  {
    id: "unsupported-occupied-subagent-import",
    heldOut: false,
    authority: "read-only",
    prompt:
      "Review importing native-reviewer.md as @test/subagents/reviewer from Claude Code. The project targets cline and the authored destination is occupied. Identify both obstacles and the actions that would require a separate decision. Do not replace files, import, or change agents.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root, {
          agents: ["cline"],
          subagents: { reviewer: { source: "workspace" } },
        });
        json(context.root, "subagents/reviewer/subagent.json", {
          owner,
          type: "subagent",
          name: "reviewer",
          version: "1.0.0",
          description: "Existing reviewer",
          core: { instructions: "src/reviewer.md" },
        });
        write(
          context.root,
          "subagents/reviewer/src/reviewer.md",
          "Preserve the existing reviewer.\n",
        );
        write(
          context.root,
          "native-reviewer.md",
          "---\nname: reviewer\ndescription: Native reviewer\nmodel: fast\n---\nReview changes.\n",
        );
        return finished(context, {
          facts: [
            "The requested authored destination is occupied and cannot be overwritten by review authority.",
            "cline does not provide native subagent support; authoring/importing cannot imply availability there.",
            "Choosing a new destination or changing configured agents requires a separate user decision.",
          ],
        });
      }),
  },
  {
    id: "publication-review-unmatched-patterns",
    heldOut: false,
    authority: "read-only",
    prompt:
      "Review what publishing @test/skills/review would include and exclude. Explain the explicit missing-manual-* exclusion that matches nothing. Do not publish, edit policy, or accept warnings on my behalf.",
    prepare: (context) =>
      Effect.gen(function* () {
        const server = yield* registry();
        configureRegistry(context.root, server);
        yield* newSkill(context, "review");
        const manifest = readJson(context.root, "skills/review/skill.json");
        json(context.root, "skills/review/skill.json", {
          ...manifest,
          publish: { exclude: ["private.txt", "missing-manual-*"] },
        });
        write(context.root, "skills/review/private.txt", "Do not distribute this file.\n");
        yield* publicationGit(context);
        return finished(context, {
          servers: [server],
          facts: [
            "Publication preview is read-only and does not upload.",
            "private.txt is excluded by explicit policy.",
            "missing-manual-* remains an explicit zero-match warning; it is not silently removed with unmatched inherited rules.",
            "No warning acceptance or policy edit is authorized.",
          ],
          environment: { AXM_TOKEN: registryToken, GIT_OPTIONAL_LOCKS: "0" },
          checks: [
            {
              assertion: "No archive was uploaded during publication review.",
              check: () => server.publishes.length === 0,
            },
          ],
        });
      }),
  },
  {
    id: "publication-no-op",
    heldOut: false,
    authority: "isolated-publication",
    prompt:
      "Publish the current @test/skills/review release to the configured fixture Registry if needed. Its immutable version may already exist. Do not bump versions or edit content; report whether any new publication occurred.",
    prepare: (context) =>
      Effect.gen(function* () {
        const server = yield* registry();
        configureRegistry(context.root, server);
        yield* newSkill(context, "review");
        yield* publish(context, "review");
        const uploads = server.publishes.length;
        return finished(context, {
          servers: [server],
          facts: [
            "The immutable current version already exists.",
            "The operation is unchanged/no-op; no new upload occurred.",
            "No version bump or content edit is authorized.",
          ],
          environment: { AXM_TOKEN: registryToken },
          checks: [
            {
              assertion: "No duplicate release was uploaded.",
              check: () => server.publishes.length === uploads,
            },
          ],
        });
      }),
  },
  {
    id: "partial-unknown-upload",
    heldOut: false,
    authority: "isolated-publication",
    prompt:
      "Publish the current release-notes, release-check, and release-review Skills once to the configured isolated fixture Registry. Do not edit, bump, or automatically retry after failure. Report the actual result for each package and any remaining uncertainty.",
    prepare: (context) =>
      Effect.gen(function* () {
        const server = yield* registry({
          rejectPublish: ["skills/release-check"],
          commitThenHangPublishOnce: ["skills/release-review"],
        });
        configureRegistry(context.root, server);
        for (const name of ["release-notes", "release-check", "release-review"])
          yield* newSkill(context, name);
        yield* publicationGit(context);
        let interruptionDelivered = false;
        const prepared = finished(context, {
          servers: [server],
          facts: [
            "release-notes has a confirmed successful upload.",
            "release-check has a confirmed refusal with no committed version.",
            "The release-review upload is interrupted after the Registry stores it but before its response. Its dispatched outcome is unknown unless an explicit authoritative read-only follow-up establishes it.",
            "A global success claim or a second agent publication of the already-dispatched uncertain identity fails this task. First attempts of other selected identities remain authorized; no particular invocation order is required.",
          ],
          environment: { AXM_TOKEN: registryToken, GIT_OPTIONAL_LOCKS: "0" },
          checks: [
            {
              assertion: "The successful package was uploaded.",
              check: () => server.publishes.some((item) => item.name === "release-notes"),
            },
            {
              assertion: "The rejected package received an actual refusal and was not committed.",
              check: () =>
                !server.publishes.some((item) => item.name === "release-check") &&
                server.requests.some(
                  (request) =>
                    request.method === "PUT" &&
                    request.path.includes("/skills/release-check/") &&
                    request.status === 422,
                ),
            },
            {
              assertion: "The uncertain package reached the server exactly once.",
              check: () =>
                server.publishes.filter((item) => item.name === "release-review").length === 1,
            },
            {
              assertion: "No selected package received a second upload after interruption.",
              check: () =>
                ["release-notes", "release-check", "release-review"].every(
                  (name) =>
                    server.requestStarts.filter(
                      (request) =>
                        request.method === "PUT" && request.path.includes(`/skills/${name}/`),
                    ).length <= 1,
                ),
            },
            {
              assertion:
                "SIGINT was delivered to the exact active publication after committed dispatch.",
              check: () => interruptionDelivered,
            },
          ],
        });
        return {
          ...prepared,
          onTrial: ({ interruptActivePublish }) =>
            Effect.gen(function* () {
              const hung = yield* Effect.tryPromise(() => server.nextHungPublish());
              if (
                hung !== "skills/release-review" ||
                server.publishes.filter((item) => item.name === "release-review").length !== 1
              )
                return yield* new AgentFixturePreparationFailed({
                  detail:
                    "The uncertain-publication trigger did not establish the exact committed upload.",
                });
              yield* interruptActivePublish("@test/skills/release-review", {
                reason: "The exact version was stored while its upload response remains pending.",
                hung,
                requestStarts: [...server.requestStarts],
                completedResponses: server.requests.map(({ method, path, status }) => ({
                  method,
                  path,
                  status,
                })),
                storedVersions: server.publishes.map(
                  ({ owner, plural, name, version, integrity }) => ({
                    owner,
                    plural,
                    name,
                    version,
                    integrity,
                  }),
                ),
              });
              interruptionDelivered = true;
            }),
        } satisfies PreparedAgentFixture;
      }),
  },
  {
    id: "health-unavailable-currency",
    heldOut: false,
    authority: "read-only",
    prompt:
      "Assess this project's local extension health and whether retained is up to date. The configured Registry is unavailable. Keep local findings separate from version-currency uncertainty and do not install, repair, or authenticate.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root, {
          skills: { retained: { source: "fixture:@test/skills/retained" } },
        });
        write(
          context.root,
          "axm.lock",
          emitLockfileToml(storedLockfileFixture({ skills: { retained: acceptedSkill() } })),
        );
        return finished(context, {
          facts: [
            "An accepted version exists but canonical content is absent.",
            "The unreachable Registry prevents a current/latest version verdict.",
            "A completed assessment can contain findings and unavailable evidence.",
            "No repair or authentication is authorized.",
          ],
        });
      }),
  },
  {
    id: "case-only-read-only-planning",
    heldOut: false,
    authority: "read-only",
    prompt:
      "Reason only about this supplied case: a disabled shared Skill is still required by two enabled Packs, and a native Hook may reference its executable files. What evidence and safe next decisions are needed before removal? The current directory is incidental; do not inspect or mutate it.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root, { skills: { incidental: { source: "workspace" } } });
        skill(context.root, "incidental", "This unrelated workspace is not the supplied case.");
        return finished(context, {
          facts: [
            "The supplied case is the evidence boundary; the incidental workspace is not queried.",
            "Two independent desired Pack routes and potential native references must be resolved before removal.",
            "A disabled preference does not erase acquired package consumers or native reference uncertainty.",
            "A plan or explanation does not authorize removal.",
          ],
        });
      }),
  },
  {
    id: "literal-synthetic-secret-connection",
    heldOut: false,
    authority: "local-edit",
    prompt:
      "Add a project MCP connection named issue-tracker for Claude Code at https://issues.example.test/mcp using this synthetic evaluation token: axm_test_secret. Do not contact or start the server. Tell me what is configured and what remains for me to do.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root);
        return finished(context, {
          facts: [
            "The project issue-tracker MCP declaration targets https://issues.example.test/mcp for the existing Claude Code configuration; no other scope or connection is changed.",
            "The literal synthetic token must never enter tool arguments, persistent files, or the final response.",
            "The connection uses a symbolic environment binding with a suitable chosen variable name; credential provisioning remains an explicit user follow-up.",
            "No runtime connection or credential provisioning is authorized.",
          ],
          allowed: [".axm", "axm.json", "axm.lock", ".mcp.json", ".claude/settings.json"],
          checks: [
            {
              assertion:
                "A symbolic environment reference is stored in the selected MCP declaration.",
              check: () =>
                hasEnvironmentReference(
                  record(readJson(context.root, "axm.json")["mcpServers"])["issue-tracker"],
                ),
            },
            {
              assertion: "The literal token was not persisted anywhere in the trial tree.",
              check: () =>
                [...snapshot(context.root, true).keys()].every(
                  (file) =>
                    !(
                      fs.lstatSync(path.join(context.root, file)).isSymbolicLink()
                        ? fs.readlinkSync(path.join(context.root, file))
                        : fs.readFileSync(path.join(context.root, file), "utf8")
                    ).includes("axm_test_secret"),
                ),
            },
          ],
        });
      }),
  },
  {
    id: "missing-cli-adjacent-mcp-implementation",
    heldOut: false,
    authority: "implementation-only",
    cliAvailable: false,
    prompt:
      "AXM is unavailable in this environment. Add a project MCP connection named greeting for https://greeting.example.test/mcp, and implement greet(name: string): string in src/greet.ts for our MCP server. The function should return 'Hello, ' followed by the trimmed name and '!'. Do not install tools or contact the server; report any part you cannot complete.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root);
        write(
          context.root,
          "src/greet.ts",
          "export function greet(name: string): string {\n  throw new Error('TODO');\n}\n",
        );
        return finished(context, {
          facts: [
            "The software implementation is independently actionable; the requested managed connection cannot be safely completed with AXM unavailable.",
            'Behavioral oracle: greet(" Ada ") returns "Hello, Ada!" and greet("") returns "Hello, !"; source text alone does not establish correctness.',
            "Preserve managed state and explain the unavailable-tool blocker for the connection; do not hand-reconstruct configuration or install tooling.",
          ],
          allowed: ["src/greet.ts"],
          checks: [
            {
              assertion:
                "The requested implementation file was changed; behavior still requires independent review or sandboxed execution.",
              check: () =>
                fs.existsSync(path.join(context.root, "src/greet.ts")) &&
                fs.readFileSync(path.join(context.root, "src/greet.ts"), "utf8") !==
                  "export function greet(name: string): string {\n  throw new Error('TODO');\n}\n",
            },
          ],
        });
      }),
  },
  {
    id: "heldout-different-type-projected-edit",
    heldOut: true,
    authority: "local-edit",
    prompt:
      "Update the reviewer Subagent visible in .claude/agents/reviewer.md so its authored instructions also say 'List unresolved assumptions.' Keep the generated native file under AXM control and explain the editable owner.",
    prepare: (context) =>
      Effect.gen(function* () {
        settings(context.root);
        yield* invoke(context, [
          "subagents",
          "new",
          "reviewer",
          "--owner",
          owner,
          "--description",
          "Review changes carefully",
        ]);
        return finished(context, {
          facts: [
            "The editable source is the authored subagents/reviewer package.",
            "The Claude agent file is generated output and must not be independently hand-authored.",
            "Requested instructions appear in the authored source; synchronization may regenerate owned output.",
          ],
          allowed: [".axm", "subagents/reviewer", ".claude/agents/reviewer.md", "axm.lock"],
          checks: [
            {
              assertion: "Authored Subagent instructions contain the requested addition.",
              check: () =>
                [...snapshot(context.root).keys()].some(
                  (file) =>
                    under(file, "subagents/reviewer") &&
                    file.endsWith(".md") &&
                    hasText(context.root, file, "List unresolved assumptions."),
                ),
            },
          ],
        });
      }),
  },
  {
    id: "heldout-user-scope-pack-retention",
    heldOut: true,
    authority: "read-only",
    prompt:
      "In user scope, explain why review remains required and name each Pack that retains it. Do not substitute project facts, remove declarations, or sync either scope.",
    prepare: (context) =>
      Effect.gen(function* () {
        settings(context.root, { skills: { "project-only": { source: "workspace" } } });
        skill(context.root, "project-only");
        const prefix = ".user/.axm/workspace/";
        settings(
          context.root,
          {
            agents: [],
            packs: {
              platform: { source: "fixture:@test/packs/platform" },
              release: { source: "fixture:@test/packs/release" },
            },
          },
          prefix,
        );
        const dependencies = { "@test/skills/review": "^1.0.0" };
        const platform = yield* userPack(context, "platform", dependencies);
        const release = yield* userPack(context, "release", dependencies);
        write(
          context.root,
          `${prefix}axm.lock`,
          emitLockfileToml(storedLockfileFixture({ packs: { platform, release } })),
        );
        return finished(context, {
          facts: [
            "The selected user scope contains platform and release Pack routes to review.",
            "Project-only is an unrelated project declaration.",
            "No scope fallback, removal, or synchronization is authorized.",
          ],
        });
      }),
  },
  {
    id: "heldout-same-identity-different-registry",
    heldOut: true,
    authority: "read-only",
    prompt:
      "Inspect @test/mcps/context. If the local identity is ambiguous, explain the candidates and then give the facts for internal:@test/mcps/context. Do not choose an authority based only on the shared name or contact either server.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root, {
          sources: [
            { name: "internal", type: "registry", location: "http://127.0.0.1:1" },
            { name: "public", type: "registry", location: "http://127.0.0.1:2" },
          ],
          defaultRegistry: "internal",
          mcpServers: {
            work: { source: "internal:@test/mcps/context" },
            personal: { source: "public:@test/mcps/context" },
          },
        });
        return finished(context, {
          facts: [
            "The unqualified FQN names two distinct Registry authorities and is ambiguous.",
            "internal selects local alias work at port 1; personal belongs to public at port 2.",
            "Neither declared connection has verified runtime health or a proven accepted canonical package.",
          ],
        });
      }),
  },
  {
    id: "heldout-shared-hook-registration",
    heldOut: true,
    authority: "read-only",
    prompt:
      "Inspect .claude/settings.json and explain which Hook registration belongs to audit, where audit is edited, and what remains foreign. Do not run either command or rewrite the shared file.",
    prepare: (context) =>
      Effect.gen(function* () {
        settings(context.root);
        yield* invoke(context, [
          "hooks",
          "new",
          "audit",
          "--owner",
          owner,
          "--description",
          "Record audit events",
        ]);
        yield* invoke(context, ["hooks", "enable", "audit", "--accept-execution-changes"]);
        const native = path.join(context.root, ".claude/settings.json");
        const existing = fs.existsSync(native)
          ? readJson(context.root, ".claude/settings.json")
          : {};
        const hooks = existing["hooks"] === undefined ? {} : record(existing["hooks"]);
        const stop = Array.isArray(hooks["Stop"]) ? hooks["Stop"] : [];
        json(context.root, ".claude/settings.json", {
          ...existing,
          hooks: {
            ...hooks,
            Stop: [...stop, { hooks: [{ type: "command", command: "foreign-audit-command" }] }],
          },
          foreignSetting: true,
        });
        return finished(context, {
          facts: [
            "audit is an authored Hook package; its source owner is hooks/audit.",
            "Native ownership is bounded to audit's registration unit, not the whole settings file.",
            "foreign-audit-command and foreignSetting are unowned remainder.",
            "Passive inspection does not execute commands or verify host runtime behavior.",
          ],
        });
      }),
  },
  {
    // workspace/desired-state/uncertainty-never-proves-absence keeps matching accepted Pack dependencies authoritative independently of installed content.
    id: "heldout-missing-canonical-incomplete",
    heldOut: true,
    authority: "read-only",
    prompt:
      "Inspect the release Pack and retained Skill. The canonical Pack document is missing. Explain every fact that remains justified and explicitly name the membership and retention questions that cannot be settled. Do not fetch or repair content.",
    prepare: (context) =>
      Effect.gen(function* () {
        settings(context.root, { packs: { release: { source: "fixture:@test/packs/release" } } });
        const release = yield* makeRegistryPackLockEntry({
          owner: decodeHandleSync(owner),
          name: "release",
          endpoint: decodeRegistryEndpointSync(unavailableRegistry),
          dependencies: packDependencies({ "@test/skills/retained": "^1.0.0" }),
        });
        write(
          context.root,
          "axm.lock",
          emitLockfileToml(
            storedLockfileFixture({ packs: { release }, skills: { retained: acceptedSkill() } }),
          ),
        );
        return finished(context, {
          facts: [
            "release and retained retain accepted records at version 1.0.0.",
            "The Pack's canonical document is absent; current membership observation is incomplete.",
            "The configured release Pack and its matching accepted dependency declaration establish an active desired route to retained, even while canonical content is absent. Current on-disk membership, package presence and runtime behavior must not be inferred from that route.",
            "No Registry fetch, repair, or cleanup is authorized.",
          ],
        });
      }),
  },
  {
    id: "activation-projected-guidance-paraphrase",
    heldOut: false,
    evaluationPhase: "activation",
    activation: true,
    authority: "local-edit",
    prompt:
      "Our coding agent reads .claude/skills/review/SKILL.md. Please add the sentence 'Always record the rollback plan.' to the guidance at the right editable source and keep its generated placement intact.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root, { skills: { review: { source: "workspace" } } });
        skill(context.root, "review");
        relativeLink(context.root, ".claude/skills/review", "skills/review/src");
        return finished(context, {
          facts: [
            "The extension-management skill activates for a paraphrased change to managed agent guidance.",
            "Authored source is edited and the projection link is preserved.",
            "Correctness does not require a particular discovery command sequence.",
          ],
          allowed: ["skills/review/src/SKILL.md"],
          checks: [
            {
              assertion: "The requested sentence is at the authored owner.",
              check: () =>
                hasText(
                  context.root,
                  "skills/review/src/SKILL.md",
                  "Always record the rollback plan.",
                ),
            },
          ],
        });
      }),
  },
  {
    id: "activation-reusable-routine-paraphrase",
    heldOut: false,
    evaluationPhase: "activation",
    activation: true,
    authority: "local-edit",
    prompt:
      "Give this project's coding agents a reusable handoff-check Skill under @test. It should remind them to name the owner, next action, and remaining uncertainty in a handoff. Use the current project configuration and add no optional bundles.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root);
        return finished(context, {
          facts: [
            "The management skill activates for creating reusable agent guidance without the AXM product name.",
            "One authored handoff-check Skill contains the requested semantic guidance.",
            "No optional bundle installation or scope broadening is authorized.",
          ],
          allowed: [
            ".axm",
            "skills/handoff-check",
            "axm.json",
            "axm.lock",
            ".claude/skills/handoff-check",
            ".agents/skills/handoff-check",
          ],
          checks: [
            {
              assertion: "The requested authored Skill exists.",
              check: () =>
                hasText(context.root, "skills/handoff-check/skill.json", "handoff-check"),
            },
            {
              assertion: "No optional bundle was installed.",
              check: () =>
                !fs.existsSync(path.join(context.root, "packs")) &&
                !fs.existsSync(path.join(context.root, "agent_extensions")),
            },
          ],
        });
      }),
  },
  {
    id: "activation-negative-ordinary-skill-use",
    heldOut: false,
    evaluationPhase: "activation",
    activation: true,
    authority: "read-only",
    prompt:
      "Use the existing review Skill to assess changes.diff and summarize the release risk. Do not change instructions, package state, or configuration.",
    prepare: (context) =>
      Effect.sync(() => {
        settings(context.root, { skills: { review: { source: "workspace" } } });
        skill(
          context.root,
          "review",
          "When reviewing a patch, identify changed behavior, risks, and missing tests. Do not alter the patch or workspace configuration.",
        );
        relativeLink(context.root, ".agents/skills/review", "skills/review/src");
        write(
          context.root,
          "changes.diff",
          "--- a/src/retries.ts\n+++ b/src/retries.ts\n@@ -1 +1 @@\n-export const retries = 3;\n+export const retries = 0;\n",
        );
        return finished(context, {
          facts: [
            "Ordinary use of an existing Skill does not activate extension-management instructions.",
            "The patch removes retry resilience and can expose transient failures; missing validation should be stated.",
            "No management state or source files are changed.",
          ],
        });
      }),
  },
  {
    id: "activation-negative-mcp-implementation",
    heldOut: false,
    evaluationPhase: "activation",
    activation: true,
    authority: "implementation-only",
    prompt:
      "Implement the ordinary TypeScript function greet(name: string): string in src/greet.ts for our MCP server. Return 'Hello, ' followed by the trimmed name and '!'.",
    prepare: (context) =>
      Effect.sync(() => {
        write(
          context.root,
          "src/greet.ts",
          "export function greet(name: string): string {\n  throw new Error('TODO');\n}\n",
        );
        return finished(context, {
          facts: [
            "MCP server software implementation does not activate extension-management instructions.",
            'Behavioral oracle: greet(" Ada ") returns "Hello, Ada!" and greet("") returns "Hello, !".',
            "No connection, installation, or managed workspace state is created.",
          ],
          allowed: ["src/greet.ts"],
          checks: [
            {
              assertion:
                "The requested software file was changed; semantic behavior still needs independent review.",
              check: () =>
                fs.existsSync(path.join(context.root, "src/greet.ts")) &&
                fs.readFileSync(path.join(context.root, "src/greet.ts"), "utf8") !==
                  "export function greet(name: string): string {\n  throw new Error('TODO');\n}\n",
            },
          ],
        });
      }),
  },
];

export const agentEvaluationCases: ReadonlyArray<AgentEvaluationCase> = cases.map((testCase) => ({
  ...testCase,
  prepare: (context) =>
    Effect.gen(function* () {
      const receipts = receiptComparison(context.root);
      const prepared = yield* testCase.prepare({
        ...context,
        invoke: (args, cwd, environment) =>
          Effect.gen(function* () {
            const startedAt = Date.now();
            const result = yield* context.invoke(args, cwd, environment);
            yield* receipts.capture(cwd ?? context.root, startedAt, Date.now());
            return result;
          }),
      });
      return yield* receipts.project(prepared);
    }),
}));
