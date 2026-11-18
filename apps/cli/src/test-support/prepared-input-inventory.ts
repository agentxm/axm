/**
 * The prepared-input allocation: what each publication owner prepares once,
 * transfers, and still checks fresh, and which owners each command route and
 * mode reaches.
 *
 * Each owner carries a catalog of dispositions, each stated once with its
 * basis and evidence. A route mode, or the invocation-wide owner list, reaches
 * an owner and names the catalog entries that apply there, so owner evidence
 * serves every equivalent route while the route mapping proves which routes
 * reach it.
 *
 * Engineering policy, not a specification. The allocation is maintainer
 * navigation that keeps the CLI-wide removal of repeated in-invocation work
 * accountable route by route; canonical specifications retain authority for
 * every behavior an entry cites. This module decodes the checked data,
 * computes the structural publication inventory of the production sources,
 * and states the reconciliation rules as findings, so the reconcile test and
 * its fixtures share one implementation.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const READ_PURPOSES = [
  "preparation",
  "preservation",
  "fresh-conflict-or-route-check",
  "rollback-snapshot",
  "integrity-validation",
  "post-write-verification",
  "other",
] as const;
const ReadPurpose = Schema.Literals(READ_PURPOSES);
const Disposition = Schema.Literals([
  "changed",
  "already-shared",
  "required-distinct-obligation",
  "not-applicable",
]);
const strings = Schema.Array(Schema.String);
const Evidence = Schema.Struct({
  requirements: Schema.optionalKey(strings),
  tests: Schema.optionalKey(strings),
  sources: Schema.optionalKey(strings),
});
/** One catalog entry: a disposition stated once on its owner. */
const DispositionEntry = Schema.Struct({
  disposition: Disposition,
  basis: Schema.String,
  obligation: Schema.optionalKey(ReadPurpose),
  openQuestion: Schema.optionalKey(Schema.String),
  evidence: Evidence,
});
/** A route mode or the invocation reaching an owner through catalog entries. */
const OwnerReach = Schema.Struct({
  owner: Schema.String,
  dispositions: strings,
  benchmark: Schema.optionalKey(strings),
});
const ModeAllocation = Schema.Union([
  Schema.Struct({ notApplicable: Schema.String, evidence: Evidence }),
  Schema.Struct({ owners: Schema.Array(OwnerReach) }),
]);
const RouteAllocation = Schema.Union([
  Schema.Struct({ sameAs: Schema.String, via: strings }),
  Schema.Struct({ modes: Schema.Record(Schema.String, ModeAllocation) }),
]);
const Owner = Schema.Struct({
  resource: Schema.String,
  publication: Schema.String,
  sources: strings,
  publicationSites: strings,
  requirements: strings,
  reads: Schema.Array(
    Schema.Struct({
      purpose: ReadPurpose,
      source: Schema.String,
      requirement: Schema.optionalKey(Schema.String),
      note: Schema.String,
    }),
  ),
  existingSharing: Schema.String,
  preparedInputs: Schema.String,
  freshChecks: strings,
  lifetime: Schema.String,
  dispositions: Schema.Record(Schema.String, DispositionEntry),
});
const PreparedInputAllocationSchema = Schema.Struct({
  formatVersion: Schema.Literal(1),
  readPurposes: Schema.Record(ReadPurpose, Schema.String),
  modeVocabulary: Schema.Record(Schema.String, Schema.String),
  owners: Schema.Record(Schema.String, Owner),
  invocationOwners: Schema.Array(OwnerReach),
  routes: Schema.Record(Schema.String, RouteAllocation),
  exclusions: Schema.Record(Schema.String, Schema.String),
});
export type PreparedInputAllocation = typeof PreparedInputAllocationSchema.Type;

/** Decodes untrusted allocation data; unknown fields and dispositions fail. */
export const decodePreparedInputAllocation = (value: unknown) =>
  Schema.decodeUnknownEffect(PreparedInputAllocationSchema, { onExcessProperty: "error" })(value);

/** The checked allocation's raw text, for content checks, and its decoded value. */
export const readPreparedInputAllocation = () => {
  const text = fs.readFileSync(
    new URL("./prepared-input-allocation.json", import.meta.url),
    "utf8",
  );
  const value: unknown = JSON.parse(text);
  return Effect.map(decodePreparedInputAllocation(value), (allocation) => ({ text, allocation }));
};

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

/** True when `relativePath` names an existing repository file. */
export const repositoryFileExists = (relativePath: string): boolean => {
  const absolute = path.join(repositoryRoot, relativePath);
  return fs.existsSync(absolute) && fs.statSync(absolute).isFile();
};

// --- Structural publication inventory -------------------------------------

/** Exports of `packages/generic/host-primitives/src/atomic-write.ts` that publish a file. */
const ATOMIC_WRITERS = new Set(["writeFileAtomic", "writeFilePreservingIdentity"]);
/**
 * Write-like members of the Effect FileSystem service and of `node:fs`
 * (callback, synchronous, promise, and file-handle forms). Opening is
 * included because the scan cannot tell a read open from a write open.
 */
const WRITE_MEMBERS = new Set([
  // Effect FileSystem
  "writeFile",
  "writeFileString",
  "sink",
  "rename",
  "copy",
  "copyFile",
  "link",
  "symlink",
  "remove",
  "makeDirectory",
  "makeTempDirectory",
  "makeTempDirectoryScoped",
  "makeTempFile",
  "makeTempFileScoped",
  "truncate",
  "chmod",
  "chown",
  "utimes",
  "open",
  // node:fs
  "writeFileSync",
  "write",
  "writeSync",
  "writev",
  "writevSync",
  "appendFile",
  "appendFileSync",
  "renameSync",
  "copyFileSync",
  "cp",
  "cpSync",
  "linkSync",
  "symlinkSync",
  "unlink",
  "unlinkSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
  "mkdir",
  "mkdirSync",
  "mkdtemp",
  "mkdtempSync",
  "truncateSync",
  "ftruncate",
  "ftruncateSync",
  "chmodSync",
  "fchmod",
  "fchmodSync",
  "lchmod",
  "chownSync",
  "fchown",
  "lchown",
  "utimesSync",
  "futimes",
  "futimesSync",
  "lutimes",
  "lutimesSync",
  "openSync",
  "createWriteStream",
]);
const NODE_FS_MODULES = new Set(["node:fs", "fs", "node:fs/promises", "fs/promises"]);
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "out-tsc",
  "test-support",
  "testing",
  "__tests__",
  "__fixtures__",
  "__generated__",
]);
const TEST_FILE = /\.(?:test|spec|shared-spec|type-test)\.ts$|\.d\.ts$/u;
const TEST_ENTRY = /^(?:testing|test-helpers|test-stubs)\.ts$/u;

const productionRoots = (): ReadonlyArray<string> => {
  const roots = ["apps/cli/src"];
  for (const group of fs.readdirSync(path.join(repositoryRoot, "packages")).sort()) {
    const groupPath = path.join(repositoryRoot, "packages", group);
    if (!fs.statSync(groupPath).isDirectory()) continue;
    for (const pkg of fs.readdirSync(groupPath).sort()) {
      const source = path.join("packages", group, pkg, "src");
      if (fs.existsSync(path.join(repositoryRoot, source))) roots.push(source);
    }
  }
  return roots;
};

const productionFiles = (relativeDirectory: string, found: Array<string>): void => {
  const entries = fs.readdirSync(path.join(repositoryRoot, relativeDirectory), {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const relative = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) productionFiles(relative, found);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    if (TEST_FILE.test(entry.name) || TEST_ENTRY.test(entry.name)) continue;
    found.push(relative);
  }
};

/** Local names bound to an atomic writer or a named `node:fs` write member. */
const importedPublicationNames = (source: ts.SourceFile): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    const fromNodeFs = NODE_FS_MODULES.has(statement.moduleSpecifier.text);
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (ATOMIC_WRITERS.has(imported) || (fromNodeFs && WRITE_MEMBERS.has(imported))) {
        names.add(element.name.text);
      }
    }
  }
  return names;
};

/**
 * One file's publication hits as `line:member`. A hit is a call whose callee
 * is an atomic writer (by name, or a local name its import binds), a named
 * `node:fs` write member import, or any property access whose member name is
 * write-like; a write-like member passed as a call argument (a method
 * reference such as `Effect.forEach(paths, fs.remove)`) is a hit as well.
 */
const publicationHits = (relativePath: string): ReadonlyArray<string> => {
  const source = ts.createSourceFile(
    relativePath,
    fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
    ts.ScriptTarget.Latest,
    false,
  );
  const callable = new Set([...ATOMIC_WRITERS, ...importedPublicationNames(source)]);
  const hits: Array<string> = [];
  const record = (node: ts.Node, member: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    hits.push(`${line}:${member}`);
  };
  const memberOf = (expression: ts.Expression): string | undefined => {
    if (ts.isIdentifier(expression))
      return callable.has(expression.text) ? expression.text : undefined;
    if (ts.isPropertyAccessExpression(expression)) {
      const name = expression.name.text;
      return WRITE_MEMBERS.has(name) || ATOMIC_WRITERS.has(name) ? name : undefined;
    }
    return undefined;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = memberOf(node.expression);
      if (callee !== undefined) record(node, callee);
      for (const argument of node.arguments) {
        if (!ts.isPropertyAccessExpression(argument)) continue;
        const reference = memberOf(argument);
        if (reference !== undefined) record(argument, reference);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
};

/**
 * Structural inventory of where production code calls a physical publication
 * primitive: repository-relative file to its `line:member` hits. It keeps the
 * allocation honest about where publication happens; it is not evidence of
 * behavior, and it sees only syntax (see the reconcile test).
 */
export const scanPublicationSites = (): ReadonlyMap<string, ReadonlyArray<string>> => {
  const files: Array<string> = [];
  for (const root of productionRoots()) productionFiles(root, files);
  const sites = new Map<string, ReadonlyArray<string>>();
  for (const file of files.sort()) {
    const hits = publicationHits(file);
    if (hits.length > 0) sites.set(file, hits);
  }
  return sites;
};

// --- Reconciliation -------------------------------------------------------

/** What the registered command tree declares for one route. */
export interface DeclaredRoute {
  readonly preview: boolean;
  readonly effect: string;
  readonly modes: ReadonlyArray<{ readonly flag: string; readonly effect: string }>;
}

/** Observations the allocation is reconciled against. */
export interface PreparedInputFacts {
  /** Route spelling (`""` is the root) to its declaration. */
  readonly routes: ReadonlyMap<string, DeclaredRoute>;
  /** Files the structural scan found publishing. */
  readonly publicationFiles: ReadonlySet<string>;
  readonly fileExists: (relativePath: string) => boolean;
  /** A reason the identity is not canonical, or `undefined` when it is. */
  readonly requirementProblem: (identity: string) => string | undefined;
}

interface PreparedInputFindings {
  readonly vocabulary: Array<string>;
  readonly routes: Array<string>;
  readonly modes: Array<string>;
  readonly owners: Array<string>;
  readonly dispositions: Array<string>;
  readonly references: Array<string>;
  readonly effects: Array<string>;
  readonly equivalences: Array<string>;
  readonly publication: Array<string>;
  readonly privateContext: Array<string>;
  readonly benchmarks: Array<string>;
}

/** The mode keys a route must allocate, derived from its declaration. */
const requiredModeKeys = (route: DeclaredRoute): ReadonlyArray<string> => [
  "default",
  ...(route.preview ? ["preview"] : []),
  ...route.modes.map((mode) => mode.flag.replace(/^--/u, "")),
];

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SCENARIO = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/u;
const EVIDENCE_PATH = /^(?:apps|packages|tools|benchmarks|contributing)\//u;
const TEST_EVIDENCE = /\.(?:test|spec)\.ts$/u;
/** Joined at runtime so this module never matches itself. */
const PRIVATE_CONTEXT = [
  new RegExp(`\\b${["A", "XM"].join("")}-[0-9]+\\b`, "iu"),
  new RegExp(["linear", "app"].join("\\."), "iu"),
  new RegExp(["agentxm", "internal"].join("-"), "iu"),
];

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === "";
const routeLabel = (route: string): string => (route === "" ? "axm" : `axm ${route}`);
const difference = (left: Iterable<string>, right: ReadonlySet<string>): Array<string> =>
  [...left].filter((value) => !right.has(value)).sort();

type DispositionEntryValue = typeof DispositionEntry.Type;
type OwnerReachValue = typeof OwnerReach.Type;
type EvidenceValue = typeof Evidence.Type;

/** Values that occur more than once, each reported once, in first-repeat order. */
const repeated = (values: ReadonlyArray<string>): Array<string> => [
  ...new Set(values.filter((value, index) => values.indexOf(value) !== index)),
];

/** Every reconciliation finding, grouped by the rule that produced it. */
export const preparedInputFindings = (
  allocation: PreparedInputAllocation,
  text: string,
  facts: PreparedInputFacts,
): PreparedInputFindings => {
  const findings: PreparedInputFindings = {
    vocabulary: [],
    routes: [],
    modes: [],
    owners: [],
    dispositions: [],
    references: [],
    effects: [],
    equivalences: [],
    publication: [],
    privateContext: [],
    benchmarks: [],
  };
  const checkPath = (file: string, label: string) => {
    if (!EVIDENCE_PATH.test(file) || file.split("/").includes("..")) {
      findings.references.push(`${label}: ${file} is not a repository package path`);
    } else if (!facts.fileExists(file)) {
      findings.references.push(`${label}: ${file} does not exist`);
    }
  };
  const checkRequirement = (identity: string, label: string) => {
    const problem = facts.requirementProblem(identity);
    if (problem !== undefined) findings.references.push(`${label}: ${problem}`);
  };
  const checkEvidence = (evidence: EvidenceValue, label: string) => {
    for (const file of evidence.sources ?? []) checkPath(file, `${label} source`);
    for (const file of evidence.tests ?? []) {
      if (!TEST_EVIDENCE.test(file)) {
        findings.references.push(`${label} test: ${file} is not a *.test.ts or *.spec.ts file`);
      }
      checkPath(file, `${label} test`);
    }
    for (const identity of evidence.requirements ?? []) checkRequirement(identity, label);
  };
  /** Owners some route mode or the invocation reaches, to the catalog keys used. */
  const reached = new Map<string, Set<string>>();
  const checkReach = (reach: OwnerReachValue, label: string) => {
    const where = `${label} ${reach.owner}`;
    const used = reached.get(reach.owner) ?? new Set<string>();
    reached.set(reach.owner, used);
    const catalog = Object.hasOwn(allocation.owners, reach.owner)
      ? allocation.owners[reach.owner]?.dispositions
      : undefined;
    if (catalog === undefined) findings.owners.push(`${label}: unknown owner ${reach.owner}`);
    if (reach.dispositions.length === 0) {
      findings.dispositions.push(`${where}: lists no disposition`);
    }
    for (const key of repeated(reach.dispositions)) {
      findings.dispositions.push(`${where}: lists disposition ${key} more than once`);
    }
    const kinds = new Set<string>();
    for (const key of new Set(reach.dispositions)) {
      if (catalog === undefined) continue;
      const entry = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
      if (entry === undefined) {
        findings.dispositions.push(`${where}: disposition ${key} is not in its owner's catalog`);
        continue;
      }
      used.add(key);
      kinds.add(entry.disposition === "not-applicable" ? "not-applicable" : "other");
    }
    // Not-applicable entries record examined candidates that are not repeated
    // work on this route; together they exclude every other disposition.
    if (kinds.size > 1) {
      findings.dispositions.push(
        `${where}: combines not-applicable dispositions with dispositions of another kind`,
      );
    }
    for (const scenario of reach.benchmark ?? []) {
      if (!SCENARIO.test(scenario)) {
        findings.benchmarks.push(`${where}: ${JSON.stringify(scenario)} is not a scenario id`);
      }
    }
  };
  const checkReaches = (reaches: ReadonlyArray<OwnerReachValue>, label: string) => {
    for (const owner of repeated(reaches.map((reach) => reach.owner))) {
      findings.owners.push(`${label}: lists owner ${owner} more than once`);
    }
    for (const reach of reaches) checkReach(reach, label);
  };
  const checkEntry = (entry: DispositionEntryValue, where: string) => {
    checkEvidence(entry.evidence, where);
    const tests = entry.evidence.tests ?? [];
    const sources = entry.evidence.sources ?? [];
    const requirements = entry.evidence.requirements ?? [];
    if (blank(entry.basis)) findings.dispositions.push(`${where}: basis is empty`);
    const distinct = entry.disposition === "required-distinct-obligation";
    if (!distinct && (entry.obligation !== undefined || entry.openQuestion !== undefined)) {
      findings.dispositions.push(
        `${where}: only required-distinct-obligation names an obligation or open question`,
      );
    }
    switch (entry.disposition) {
      case "changed":
        if (tests.length === 0) {
          findings.dispositions.push(`${where}: changed names no test or specification`);
        }
        break;
      case "already-shared":
        if (sources.length === 0 || tests.length === 0) {
          findings.dispositions.push(
            `${where}: already-shared needs at least one source and one test or specification`,
          );
        }
        break;
      case "required-distinct-obligation":
        if (entry.obligation === undefined || entry.obligation === "preparation") {
          findings.dispositions.push(
            `${where}: required-distinct-obligation names no obligation other than preparation`,
          );
        }
        if (entry.openQuestion !== undefined && /[\n\r]/u.test(entry.openQuestion)) {
          findings.dispositions.push(`${where}: openQuestion is not one sentence`);
        }
        if (requirements.length === 0 && blank(entry.openQuestion)) {
          findings.dispositions.push(
            `${where}: required-distinct-obligation cites no requirement and no open question`,
          );
        }
        break;
      case "not-applicable":
        break;
    }
  };

  // Vocabulary of read purposes.
  const purposes = Object.keys(allocation.readPurposes).sort();
  if (JSON.stringify(purposes) !== JSON.stringify([...READ_PURPOSES].sort())) {
    findings.vocabulary.push(`readPurposes must describe exactly: ${READ_PURPOSES.join(", ")}`);
  }
  for (const [purpose, description] of Object.entries(allocation.readPurposes)) {
    if (blank(description))
      findings.vocabulary.push(`readPurposes ${purpose}: description is empty`);
  }

  // (a) Route keys equal the registered command tree in both directions.
  const allocated = new Set(Object.keys(allocation.routes));
  for (const route of difference(facts.routes.keys(), allocated)) {
    findings.routes.push(`${routeLabel(route)}: registered but not allocated`);
  }
  for (const route of difference(allocated, new Set(facts.routes.keys()))) {
    findings.routes.push(`${routeLabel(route)}: allocated but not registered`);
  }

  // (b) Mode keys follow the declarations; extra keys only from the vocabulary.
  const usedVocabulary = new Set<string>();
  for (const [key, description] of Object.entries(allocation.modeVocabulary)) {
    if (!KEBAB.test(key)) findings.vocabulary.push(`modeVocabulary ${key}: not a kebab-case key`);
    if (blank(description)) findings.vocabulary.push(`modeVocabulary ${key}: description is empty`);
  }
  for (const [route, entry] of Object.entries(allocation.routes)) {
    const label = routeLabel(route);
    const declared = facts.routes.get(route);
    if ("sameAs" in entry) {
      // (g) Equivalent routes reach one implementation.
      const target = allocation.routes[entry.sameAs];
      if (target === undefined) {
        findings.equivalences.push(`${label}: sameAs ${routeLabel(entry.sameAs)} is not allocated`);
      } else if ("sameAs" in target) {
        findings.equivalences.push(`${label}: sameAs ${routeLabel(entry.sameAs)} is itself sameAs`);
      } else {
        const targetDeclared = facts.routes.get(entry.sameAs);
        if (
          declared !== undefined &&
          targetDeclared !== undefined &&
          JSON.stringify(requiredModeKeys(declared)) !==
            JSON.stringify(requiredModeKeys(targetDeclared))
        ) {
          findings.equivalences.push(
            `${label}: declares other modes than ${routeLabel(entry.sameAs)}`,
          );
        }
      }
      if (entry.via.length === 0) findings.equivalences.push(`${label}: sameAs names no via file`);
      for (const file of entry.via) checkPath(file, `${label} via`);
      continue;
    }
    const keys = Object.keys(entry.modes);
    if (declared !== undefined) {
      const required = new Set(requiredModeKeys(declared));
      for (const key of difference(required, new Set(keys))) {
        findings.modes.push(`${label}: missing mode ${key}`);
      }
      for (const key of difference(keys, required)) {
        if (Object.hasOwn(allocation.modeVocabulary, key)) usedVocabulary.add(key);
        else findings.modes.push(`${label}: mode ${key} is neither declared nor in modeVocabulary`);
      }
    }
    for (const [key, mode] of Object.entries(entry.modes)) {
      const where = `${label} [${key}]`;
      if ("notApplicable" in mode) {
        if (blank(mode.notApplicable)) {
          findings.dispositions.push(`${where}: notApplicable reason is empty`);
        }
        const evidence = mode.evidence;
        if (
          (evidence.sources?.length ?? 0) +
            (evidence.tests?.length ?? 0) +
            (evidence.requirements?.length ?? 0) ===
          0
        ) {
          findings.dispositions.push(`${where}: notApplicable cites no evidence`);
        }
        checkEvidence(evidence, where);
        // (f) A mode that changes persistent state reaches at least one owner.
        const effect =
          key === "default"
            ? declared?.effect
            : declared?.modes.find((candidate) => candidate.flag.replace(/^--/u, "") === key)
                ?.effect;
        if (effect !== undefined && effect !== "none") {
          findings.effects.push(`${where}: declares effect ${effect} but is wholly notApplicable`);
        }
        continue;
      }
      if (mode.owners.length === 0) findings.dispositions.push(`${where}: lists no owner`);
      checkReaches(mode.owners, where);
    }
  }
  for (const key of difference(Object.keys(allocation.modeVocabulary), usedVocabulary)) {
    findings.vocabulary.push(`modeVocabulary ${key}: never used`);
  }

  // (c) Invocation-wide owners, owner declarations and disposition catalogs.
  checkReaches(allocation.invocationOwners, "invocation");
  const claimedSites = new Set<string>();
  for (const [id, owner] of Object.entries(allocation.owners)) {
    const label = `owner ${id}`;
    if (!KEBAB.test(id)) findings.owners.push(`${label}: not a kebab-case id`);
    const used = reached.get(id);
    if (used === undefined) {
      findings.owners.push(`${label}: no route mode or invocation reaches it`);
    }
    for (const [field, value] of [
      ["resource", owner.resource],
      ["publication", owner.publication],
      ["existingSharing", owner.existingSharing],
      ["preparedInputs", owner.preparedInputs],
      ["lifetime", owner.lifetime],
    ] as const) {
      if (blank(value)) findings.owners.push(`${label}: ${field} is empty`);
    }
    if (owner.sources.length === 0) findings.owners.push(`${label}: names no source`);
    for (const file of owner.sources) checkPath(file, `${label} source`);
    for (const file of owner.publicationSites) {
      checkPath(file, `${label} publication site`);
      claimedSites.add(file);
    }
    for (const identity of owner.requirements) checkRequirement(identity, label);
    for (const read of owner.reads) {
      checkPath(read.source, `${label} read`);
      if (read.requirement !== undefined) checkRequirement(read.requirement, `${label} read`);
      if (blank(read.note)) findings.owners.push(`${label} read ${read.source}: note is empty`);
    }
    for (const check of owner.freshChecks) {
      if (blank(check)) findings.owners.push(`${label}: a fresh check is empty`);
    }
    for (const [key, entry] of Object.entries(owner.dispositions)) {
      const where = `${label} disposition ${key}`;
      if (!KEBAB.test(key)) findings.dispositions.push(`${where}: not a kebab-case key`);
      checkEntry(entry, where);
      if (used?.has(key) !== true) {
        findings.dispositions.push(`${where}: no route mode or invocation uses it`);
      }
    }
  }

  // (h) Structural closure of publication primitives, both directions.
  for (const [file, reason] of Object.entries(allocation.exclusions)) {
    checkPath(file, "exclusion");
    if (blank(reason)) findings.publication.push(`exclusion ${file}: reason is empty`);
    if (claimedSites.has(file)) {
      findings.publication.push(`exclusion ${file}: also claimed as an owner publication site`);
    }
  }
  const accounted = new Set([...claimedSites, ...Object.keys(allocation.exclusions)]);
  for (const file of difference(facts.publicationFiles, accounted)) {
    findings.publication.push(`${file}: publishes but no owner or exclusion accounts for it`);
  }
  for (const file of difference(accounted, facts.publicationFiles)) {
    findings.publication.push(`${file}: allocated but the scan finds no publication call`);
  }

  // (i) Public artifact hygiene.
  text.split("\n").forEach((line, index) => {
    if (PRIVATE_CONTEXT.some((pattern) => pattern.test(line))) {
      findings.privateContext.push(`line ${index + 1}: private coordination context`);
    }
  });

  return findings;
};
