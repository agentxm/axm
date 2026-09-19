#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL_VERSION = "1.0.0";
const CURRENT_CONTRACT_VERSION = "3.0.0";
const SUPPORTED_CONTRACT_VERSIONS = new Set(["2.0.0", CURRENT_CONTRACT_VERSION]);
const REQUIRED_MECHANISM_RESULT_FIELDS = [
  "protocol_version",
  "runner.content_identity",
  "runner.selection_source",
  "adapters.host.content_identity",
  "adapters.host.capabilities",
  "adapters.grader.content_identity",
  "adapters.grader.capabilities",
];
const OUTCOMES = new Set(["pass", "fail", "unknown", "harness-error"]);
const STAGES = new Set(["routing", "execution"]);
const EVIDENCE_CLASSES = new Set(["authoring-smoke", "regression"]);
const ROUTING_MODES = new Set(["native-routing", "host-simulated-routing", "catalog-classification-proxy"]);
const RUN_STATES = new Set(["running", "complete", "failed", "canceled"]);
const RUNNER_SELECTION_SOURCES = new Set(["explicit", "pack-default"]);
const ALLOWED_EVAL_ENTRIES = new Set([
  "cases.md",
  "evaluation-contract.json",
  "evals.json",
  "files",
  "fixtures",
  "graders",
  "harness",
  "releases",
]);
const REQUIRED_CONTRACT_KEYS = [
  "contract_version",
  "owner",
  "decision",
  "target_binding",
  "scope",
  "unit",
  "environment",
  "evidence",
  "grading",
  "trials",
  "comparison",
  "analysis",
  "estimand",
  "lifecycle",
  "provenance",
  "freshness",
];
const REPEATABLE_FLAGS = new Set(["case", "supportPath", "allowEnv"]);
const BOOLEAN_FLAGS = new Set(["json", "help"]);
const PORTABLE_ENV = ["PATH", "PATHEXT", "SYSTEMROOT", "COMSPEC", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "TERM"];
const scriptPath = fileURLToPath(import.meta.url);
const skillSourceRoot = resolve(dirname(scriptPath), "..");
const activeChildren = new Set();
let cancellationRequested = false;

class EvalError extends Error {
  constructor(message, { code = "evaluation-error", exitCode = 2, details = null, disposition = null } = {}) {
    super(message);
    this.name = "EvalError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
    this.disposition = disposition;
  }
}

function fail(message, options) {
  throw new EvalError(message, options);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, case: [], supportPath: [], allowEnv: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) fail(`Unexpected argument: ${token}`, { code: "invalid-arguments" });
    const key = token.slice(2).replace(/-([a-z])/g, (_, value) => value.toUpperCase());
    if (BOOLEAN_FLAGS.has(key)) {
      args[key] = true;
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) fail(`Missing value for ${token}`, { code: "invalid-arguments" });
    index += 1;
    if (REPEATABLE_FLAGS.has(key)) args[key].push(value);
    else args[key] = value;
  }
  return args;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path}: ${error.message}`, { code: "invalid-json" });
  }
}

function readJsonBounded(path, maximumBytes) {
  const size = statSync(path).size;
  if (size > maximumBytes) fail(`${path}: output exceeds ${maximumBytes} bytes`, { code: "output-budget-exceeded" });
  return readJson(path);
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function writeTextAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  writeFileSync(temporary, value, { mode: 0o600 });
  renameSync(temporary, path);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const macosUsersRoot = `/${"Users"}/`;
const privatePathSegmentPattern = String.raw`[^/\\\s"'\x60]+`;

function redactPrivatePaths(value, privateRoots = []) {
  let redacted = value;
  for (const root of [...new Set(privateRoots.filter(Boolean).map((entry) => resolve(entry)))].sort((left, right) => right.length - left.length)) {
    redacted = redacted.replace(new RegExp(escapeRegExp(root), "g"), "<private-root>");
  }
  redacted = redacted.replace(new RegExp(`${escapeRegExp(macosUsersRoot)}(?!<redacted>)${privatePathSegmentPattern}`, "g"), `${macosUsersRoot}<redacted>`);
  redacted = redacted.replace(/\/home\/(?!<redacted>)[^/\\\s"'`]+/g, "/home/<redacted>");
  redacted = redacted.replace(/[A-Za-z]:\\\\Users\\\\(?!<redacted>)[^\\\s"'`]+/g, "C:\\\\Users\\\\<redacted>");
  redacted = redacted.replace(/[A-Za-z]:\\Users\\(?!<redacted>)[^\\\s"'`]+/g, "C:\\Users\\<redacted>");
  return redacted;
}

function sanitizeEvidenceTree(root, privateRoots = []) {
  let filesRedacted = 0;
  for (const path of walkFiles(root)) {
    const bytes = readFileSync(path);
    if (bytes.includes(0)) continue;
    const source = bytes.toString("utf8");
    const sanitized = redactPrivatePaths(source, privateRoots);
    if (sanitized !== source) {
      writeTextAtomic(path, sanitized);
      filesRedacted += 1;
    }
    const unsafePosixUserPath = new RegExp(`(?:${escapeRegExp(macosUsersRoot)}|/home/)(?!<redacted>)${privatePathSegmentPattern}`);
    if (unsafePosixUserPath.test(sanitized) || /[A-Za-z]:\\\\Users\\\\(?!<redacted>)[^\\\s"'`]+/.test(sanitized) || /[A-Za-z]:\\Users\\(?!<redacted>)[^\\\s"'`]+/.test(sanitized)) {
      fail(`Generated evidence retained a private user path in ${path}`, { code: "unsafe-generated-evidence" });
    }
  }
  return filesRedacted;
}

function walkFiles(root, current = root) {
  if (!existsSync(current)) return [];
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function walkSymlinks(current) {
  if (!existsSync(current)) return [];
  const links = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) links.push(path);
    else if (entry.isDirectory()) links.push(...walkSymlinks(path));
  }
  return links.sort();
}

function contentIdentity(root, paths) {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) {
    hash.update(relative(root, path).split(sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function jsonIdentity(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function pathIdentity(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) fail(`Identity target does not exist: ${absolute}`, { code: "missing-identity-target" });
  if (statSync(absolute).isDirectory()) return contentIdentity(absolute, walkFiles(absolute));
  return `sha256:${createHash("sha256").update(readFileSync(absolute)).digest("hex")}`;
}

function runnerIdentity() {
  const paths = [...walkFiles(join(skillSourceRoot, "scripts")), ...walkFiles(join(skillSourceRoot, "schemas"))];
  return contentIdentity(skillSourceRoot, paths);
}

function gitOutput(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function isWithin(root, path) {
  const rootPath = resolve(root);
  const target = resolve(path);
  return target === rootPath || target.startsWith(`${rootPath}${sep}`);
}

function isSafeWorkspacePath(path) {
  if (typeof path !== "string" || path.length === 0 || path.includes("\\") || path.startsWith("/")) return false;
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return false;
  return !new Set([".git", "final.json", "output-schema.json"]).has(segments[0]);
}

function safeId(value, label = "identifier") {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) fail(`Unsafe ${label}: ${value}`, { code: "unsafe-identifier" });
  return value;
}

function fixtureSpec(fixture) {
  if (typeof fixture === "string") return { source: fixture, target: null };
  if (typeof fixture === "object" && fixture !== null) return { source: fixture.source, target: fixture.target ?? null };
  return { source: null, target: null };
}

function hasPath(value, dottedPath) {
  let current = value;
  for (const segment of dottedPath.split(".")) {
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, segment)) return false;
    current = current[segment];
  }
  return true;
}

function requiredRunFields(contract) {
  return [
    ...(contract.target_binding?.required_result_fields ?? []),
    ...(contract.environment?.required_result_fields ?? []),
    ...(contract.provenance?.required_result_fields ?? []),
  ];
}

function validateReleaseManifest(path, findings) {
  let record;
  try { record = readJson(path); } catch (error) { findings.push(error.message); return; }
  for (const key of ["decision", "target_identity", "suite_identity", "harness_identity", "environment_identity", "grader_identity", "trial_summary", "baseline", "raw_evidence", "limitations", "expires_at"]) {
    if (!(key in record)) findings.push(`${path}: promoted manifest is missing ${key}`);
  }
}

function validateTargetPackage(packageRoot, findings) {
  const manifestPath = join(packageRoot, "skill.json");
  const sourceRoot = join(packageRoot, "src");
  if (!existsSync(manifestPath)) { findings.push(`${packageRoot}: skill.json is missing`); return null; }
  if (relative(resolve(packageRoot), manifestPath) !== relative(realpathSync(packageRoot), realpathSync(manifestPath))) findings.push(`${manifestPath}: manifest may not be a symlink`);
  if (!existsSync(join(sourceRoot, "SKILL.md"))) findings.push(`${packageRoot}: src/SKILL.md is missing`);
  if (existsSync(sourceRoot) && relative(resolve(packageRoot), sourceRoot) !== relative(realpathSync(packageRoot), realpathSync(sourceRoot))) findings.push(`${sourceRoot}: runtime payload root may not be a symlink`);
  let manifest;
  try { manifest = readJson(manifestPath); } catch (error) { findings.push(error.message); return null; }
  if (manifest.type !== "skill") findings.push(`${manifestPath}: type must be skill`);
  if (typeof manifest.owner !== "string" || !/^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(manifest.owner)) findings.push(`${manifestPath}: owner must be a safe scoped identifier`);
  if (typeof manifest.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(manifest.name)) findings.push(`${manifestPath}: name must be a safe identifier`);
  for (const path of walkSymlinks(sourceRoot)) findings.push(`${path}: evaluated runtime payload symlinks are not permitted`);
  return manifest;
}

function validateSuite(packageRoot, findings) {
  const manifestPath = join(packageRoot, "skill.json");
  const evalRoot = join(packageRoot, "evals");
  const fixtureRoot = join(evalRoot, "files");
  const suitePath = join(evalRoot, "evals.json");
  const manifest = validateTargetPackage(packageRoot, findings);
  if (!manifest) return;
  if (!existsSync(suitePath)) { findings.push(`${packageRoot}: workspace-authored Agent Skill is missing evals/evals.json`); return; }
  for (const entry of readdirSync(evalRoot, { withFileTypes: true })) if (!ALLOWED_EVAL_ENTRIES.has(entry.name)) findings.push(`${evalRoot}: undeclared evaluation artifact category ${entry.name}`);
  for (const path of walkSymlinks(evalRoot)) findings.push(`${path}: evaluation source symlinks are not permitted`);

  let suite;
  let contract;
  try {
    suite = readJson(suitePath);
    contract = readJson(join(evalRoot, "evaluation-contract.json"));
  } catch (error) { findings.push(error.message); return; }
  if (suite.skill_name !== manifest.name) findings.push(`${suitePath}: skill_name must equal ${manifest.name}`);
  if (typeof suite.suite_version !== "string" || !/^\d+\.\d+\.\d+$/.test(suite.suite_version)) findings.push(`${suitePath}: suite_version must be semver`);
  if (suite.evaluation_contract !== "evals/evaluation-contract.json") findings.push(`${suitePath}: evaluation_contract must reference evals/evaluation-contract.json`);
  if (!Array.isArray(suite.evals) || suite.evals.length === 0) { findings.push(`${suitePath}: evals must be a non-empty array`); return; }

  const ids = new Set();
  const casesById = new Map();
  const stages = new Set();
  for (const item of suite.evals) {
    const id = String(item.id ?? "");
    if (!id || ids.has(id)) findings.push(`${suitePath}: every case must have a unique id`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) findings.push(`${suitePath}: every case id must be safe for evidence paths`);
    ids.add(id);
    casesById.set(id, item);
    if (!STAGES.has(item.stage)) findings.push(`${suitePath} case ${id}: invalid or missing stage`);
    else stages.add(item.stage);
    if (typeof item.prompt !== "string" || item.prompt.length === 0) findings.push(`${suitePath} case ${id}: prompt is required`);
    if (!Array.isArray(item.assertions) || item.assertions.length === 0 || item.assertions.some((value) => typeof value !== "string" || !value)) findings.push(`${suitePath} case ${id}: assertions are required`);
    if (item.deterministic_assertions !== undefined && !Array.isArray(item.deterministic_assertions)) findings.push(`${suitePath} case ${id}: deterministic_assertions must be an array`);
    for (const assertion of item.deterministic_assertions ?? []) {
      if (assertion?.kind !== "forbid-target-execution") findings.push(`${suitePath} case ${id}: unsupported deterministic assertion kind ${assertion?.kind}`);
      if (typeof assertion?.assertion !== "string" || !item.assertions?.includes(assertion.assertion)) findings.push(`${suitePath} case ${id}: deterministic assertion must name an exact case assertion`);
      if (!Array.isArray(assertion?.targets) || assertion.targets.length === 0 || assertion.targets.some((target) => !isSafeWorkspacePath(target))) findings.push(`${suitePath} case ${id}: deterministic assertion targets must be safe workspace paths`);
      if (!Array.isArray(assertion?.launchers) || assertion.launchers.length === 0 || assertion.launchers.some((launcher) => typeof launcher !== "string" || !/^[A-Za-z0-9._+-]+$/.test(launcher))) findings.push(`${suitePath} case ${id}: deterministic assertion launchers must be safe command names`);
    }
    if (item.stage === "routing") {
      if (item.files?.length) findings.push(`${suitePath} case ${id}: routing cases cannot expose fixtures`);
      const expected = item.expected_selection;
      if (!(typeof expected === "string" || (Array.isArray(expected) && expected.length > 0 && expected.every((value) => typeof value === "string")))) findings.push(`${suitePath} case ${id}: expected_selection must be a string or non-empty string array`);
      if (!Array.isArray(item.catalog_neighbors)) findings.push(`${suitePath} case ${id}: catalog_neighbors is required`);
    }
    const fixtureTargets = new Set();
    for (const fixture of item.files ?? []) {
      const { source, target } = fixtureSpec(fixture);
      if (typeof source !== "string") { findings.push(`${suitePath} case ${id}: every fixture must be a path or source/target mapping`); continue; }
      const fixturePath = resolve(packageRoot, source);
      if (!isWithin(fixtureRoot, fixturePath) || fixturePath === resolve(fixtureRoot) || !existsSync(fixturePath)) findings.push(`${suitePath} case ${id}: missing or unsafe fixture ${source}`);
      else if (!isWithin(realpathSync(fixtureRoot), realpathSync(fixturePath))) findings.push(`${suitePath} case ${id}: fixture escapes evals/files through a symlink ${source}`);
      if (target !== null) {
        if (!isSafeWorkspacePath(target)) findings.push(`${suitePath} case ${id}: unsafe fixture target ${target}`);
        const activeTarget = `skills/${manifest.name}`;
        if (target === activeTarget || target.startsWith(`${activeTarget}/`)) findings.push(`${suitePath} case ${id}: fixture target may not overwrite the evaluated skill`);
        if (fixtureTargets.has(target)) findings.push(`${suitePath} case ${id}: duplicate fixture target ${target}`);
        fixtureTargets.add(target);
      }
    }
    for (const artifactPath of item.artifact_paths ?? []) if (!isSafeWorkspacePath(artifactPath)) findings.push(`${suitePath} case ${id}: unsafe artifact path ${artifactPath}`);
  }
  for (const stage of STAGES) if (!stages.has(stage)) findings.push(`${suitePath}: suite must contain a ${stage} case`);

  const contractPath = join(evalRoot, "evaluation-contract.json");
  for (const key of REQUIRED_CONTRACT_KEYS) if (!(key in contract)) findings.push(`${contractPath}: missing ${key}`);
  if (!SUPPORTED_CONTRACT_VERSIONS.has(contract.contract_version)) findings.push(`${contractPath}: contract_version must be one of ${[...SUPPORTED_CONTRACT_VERSIONS].join(", ")}`);
  if (contract.target_binding?.skill_name !== manifest.name) findings.push(`${contractPath}: target_binding.skill_name must equal ${manifest.name}`);
  const resultFields = requiredRunFields(contract);
  const allowedRoots = new Set(["target", "suite", "runner", "adapters", "environment", "authority", "budgets", "coverage", "provenance"]);
  const allowedSingletons = new Set(["protocol_version", "started_at", "ended_at"]);
  if (resultFields.length === 0) findings.push(`${contractPath}: required_result_fields must not be empty`);
  for (const field of resultFields) {
    const root = typeof field === "string" ? field.split(".")[0] : "";
    if (typeof field !== "string" || !field || (field.includes(".") ? !allowedRoots.has(root) : !allowedSingletons.has(field))) findings.push(`${contractPath}: required result field must be an absolute run path: ${field}`);
  }
  if (new Set(resultFields).size !== resultFields.length) findings.push(`${contractPath}: run result fields must be unique`);
  if (contract.contract_version === CURRENT_CONTRACT_VERSION) {
    const analysis = contract.analysis && typeof contract.analysis === "object" && !Array.isArray(contract.analysis) ? contract.analysis : {};
    if (analysis !== contract.analysis) findings.push(`${contractPath}: analysis must be an object`);
    for (const field of REQUIRED_MECHANISM_RESULT_FIELDS) if (!resultFields.includes(field)) findings.push(`${contractPath}: required mechanism result field ${field} is missing`);
    if ("critical_case_ids" in analysis) findings.push(`${contractPath}: analysis.critical_case_ids is legacy; contract 3.0.0 must map critical gates to exact assertions`);
    const gates = contract.grading?.critical_gates;
    if (!Array.isArray(gates) || gates.length === 0 || gates.some((gate) => typeof gate !== "string" || !gate) || new Set(gates).size !== gates.length) findings.push(`${contractPath}: grading.critical_gates must be a non-empty array of unique strings`);
    const mappings = analysis.critical_assertions;
    if (!Array.isArray(mappings) || mappings.length === 0) findings.push(`${contractPath}: every critical gate must map to a case assertion in analysis.critical_assertions`);
    else {
      const mappedGates = new Set();
      for (const mapping of mappings) {
        const gate = mapping?.gate;
        const caseId = String(mapping?.case_id ?? "");
        const assertion = mapping?.assertion;
        if (!Array.isArray(gates) || !gates.includes(gate)) findings.push(`${contractPath}: critical assertion mapping must name an exact critical gate: ${gate}`);
        else mappedGates.add(gate);
        const activeCase = casesById.get(caseId);
        if (!activeCase) findings.push(`${contractPath}: critical assertion mapping references unknown case ${caseId}`);
        else if (!activeCase.assertions.includes(assertion)) findings.push(`${contractPath}: critical assertion mapping for case ${caseId} must name an exact assertion`);
      }
      for (const gate of Array.isArray(gates) ? gates : []) if (!mappedGates.has(gate)) findings.push(`${contractPath}: every critical gate must map to a case assertion; unmapped gate: ${gate}`);
    }
  }
  const declaredStages = new Set(contract.scope?.stages ?? []);
  for (const stage of STAGES) if (!declaredStages.has(stage)) findings.push(`${contractPath}: scope.stages must include ${stage}`);
  const outcomes = new Set(contract.evidence?.outcomes ?? []);
  for (const outcome of OUTCOMES) if (!outcomes.has(outcome)) findings.push(`${contractPath}: evidence.outcomes must include ${outcome}`);
  if (contract.estimand?.type !== "fixed-suite" || typeof contract.estimand?.sampling_unit !== "string" || typeof contract.estimand?.uncertainty !== "string") findings.push(`${contractPath}: estimand must declare a fixed-suite sampling unit and uncertainty method`);
  if (!Array.isArray(contract.lifecycle?.terminal_states) || !["complete", "failed", "canceled"].every((state) => contract.lifecycle.terminal_states.includes(state))) findings.push(`${contractPath}: lifecycle must declare complete, failed, and canceled terminal states`);
  for (const path of walkFiles(join(evalRoot, "releases"))) {
    if (!path.endsWith(".json")) findings.push(`${path}: promoted evidence must be JSON`);
    else validateReleaseManifest(path, findings);
  }
}

function findSkillPackages(root) {
  const settingsPath = join(root, "axm.json");
  if (!existsSync(settingsPath)) return [];
  const settings = readJson(settingsPath);
  return Object.entries(settings.skills ?? {})
    .filter(([, value]) => (typeof value === "object" && value !== null ? value.source : value) === "workspace")
    .map(([name]) => join(root, "skills", name))
    .filter((path) => existsSync(join(path, "skill.json")))
    .sort();
}

function parseFrontmatterDescription(path) {
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return "";
  const lines = frontmatter.split(/\r?\n/);
  const index = lines.findIndex((line) => /^description\s*:/.test(line));
  if (index < 0) return "";
  const value = lines[index].replace(/^description\s*:\s*/, "").trim();
  if (["|", ">", "|-", ">-"].includes(value)) {
    const body = [];
    for (const line of lines.slice(index + 1)) {
      if (line.length > 0 && !/^\s/.test(line)) break;
      body.push(line.replace(/^\s{2}/, ""));
    }
    return body.join(value.startsWith(">") ? " " : "\n").trim();
  }
  return value.replace(/^['"]|['"]$/g, "");
}

function catalogForCase(root, packageRoot, item) {
  const manifest = readJson(join(packageRoot, "skill.json"));
  const names = new Set([manifest.name, ...(item.catalog_neighbors ?? [])]);
  names.delete("clarify-or-abstain");
  const entries = [];
  for (const name of names) {
    const matches = [];
    const workspaceManifestPath = join(root, "skills", name, "skill.json");
    const workspaceSkillPath = join(root, "skills", name, "src", "SKILL.md");
    if (existsSync(workspaceManifestPath) && existsSync(workspaceSkillPath)) {
      matches.push({ owner: readJson(workspaceManifestPath).owner, path: workspaceSkillPath });
    }
    for (const candidate of walkFiles(join(root, "agent_extensions")).filter((path) => path.endsWith(`${sep}skill.json`))) {
      const candidateManifest = readJson(candidate);
      const candidateSkillPath = join(dirname(candidate), "src", "SKILL.md");
      if (candidateManifest.name === name && existsSync(candidateSkillPath)) {
        matches.push({ owner: candidateManifest.owner, path: candidateSkillPath });
      }
    }
    const eligibleMatches = name === manifest.name ? matches.filter((match) => match.owner === manifest.owner) : matches;
    if (eligibleMatches.length === 0) fail(`Routing catalog entry is unavailable: ${name}`, { code: "missing-catalog-entry" });
    if (eligibleMatches.length > 1) fail(`Routing catalog entry is ambiguous across owners: ${name}`, { code: "ambiguous-catalog-entry" });
    const match = eligibleMatches[0];
    entries.push({ name, owner: match.owner, description: parseFrontmatterDescription(match.path), source_path: relativePortable(root, match.path, "Catalog entry"), content_identity: pathIdentity(match.path) });
  }
  return { entries, content_identity: jsonIdentity(entries), trial: entries.map(({ name, description }) => ({ name, description })) };
}

function portableEnvironment(allowedNames, extra = {}) {
  const env = {};
  for (const name of [...PORTABLE_ENV, ...allowedNames]) if (process.env[name] !== undefined) env[name] = process.env[name];
  return { ...env, ...extra };
}

function adapterCommand(adapter, operation, requestPath, outputRoot) {
  return extname(adapter) === ".mjs" || extname(adapter) === ".js"
    ? { command: process.execPath, args: [adapter, operation, requestPath, outputRoot] }
    : { command: adapter, args: [operation, requestPath, outputRoot] };
}

function terminateProcessTree(child, signal) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", signal === "SIGKILL" ? "/f" : ""].filter(Boolean));
    else process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* already exited */ }
  }
}

function terminateActiveChildren(signal = "SIGTERM") {
  for (const child of activeChildren) terminateProcessTree(child, signal);
}

function runProcess(command, args, env, timeoutMs, maximumOutputBytes) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let exceeded = false;
    let timedOut = false;
    const capture = (stream, assign) => stream.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= maximumOutputBytes) assign(chunk.toString());
      else if (!exceeded) { exceeded = true; terminateProcessTree(child, "SIGTERM"); }
    });
    capture(child.stdout, (value) => { stdout += value; });
    capture(child.stderr, (value) => { stderr += value; });
    let killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child, "SIGTERM");
      killTimer = setTimeout(() => terminateProcessTree(child, "SIGKILL"), 5000);
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      activeChildren.delete(child);
      resolvePromise({ code: 1, signal: null, stdout, stderr: `${stderr}${error.message}`, exceeded, timedOut });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      activeChildren.delete(child);
      resolvePromise({ code: code ?? 1, signal, stdout, stderr, exceeded, timedOut });
    });
  });
}

function validateCapabilities(value, path) {
  const problems = [];
  if (value?.schema_version !== PROTOCOL_VERSION) problems.push(`schema_version must be ${PROTOCOL_VERSION}`);
  if (!Array.isArray(value?.protocol_versions) || !value.protocol_versions.includes(PROTOCOL_VERSION)) problems.push(`protocol_versions must include ${PROTOCOL_VERSION}`);
  if (!value?.adapter?.name || !value?.adapter?.version) problems.push("adapter name and version are required");
  if (!Array.isArray(value?.operations) || !value.operations.includes("trial")) problems.push("trial operation is required");
  if (!Array.isArray(value?.stages) || value.stages.some((stage) => !STAGES.has(stage))) problems.push("stages must contain supported evaluation stages");
  if (!new Set([...ROUTING_MODES, "unsupported"]).has(value?.routing_mode)) problems.push("routing_mode is invalid");
  if (!Array.isArray(value?.sandbox_modes)) problems.push("sandbox_modes must be an array");
  if (!new Set(["declared", "observed", "verified", "enforced"]).has(value?.sandbox_status)) problems.push("sandbox_status is invalid");
  if (!Array.isArray(value?.enforced_budgets)) problems.push("enforced_budgets must be an array");
  if (!Array.isArray(value?.evidence)) problems.push("evidence must be an array");
  if (!value?.network || !new Set(["denied", "allowlist", "unobserved"]).has(value.network.mode) || !new Set(["declared", "observed", "verified", "enforced"]).has(value.network.status)) problems.push("network mode or status is invalid");
  if (!new Set(["verified", "declared", "not-verified"]).has(value?.credential_isolation)) problems.push("credential_isolation is invalid");
  if (!value?.lifecycle || !new Set(["process-tree-signal", "adapter-owned", "unsupported"]).has(value.lifecycle.cancellation)) problems.push("lifecycle.cancellation is invalid");
  if (!value?.lifecycle || !new Set(["runner-reinvocation", "adapter-owned", "unsupported"]).has(value.lifecycle.retry)) problems.push("lifecycle.retry is invalid");
  if (!value?.lifecycle || !new Set(["stateless", "adapter-checkpoint", "unsupported"]).has(value.lifecycle.resume)) problems.push("lifecycle.resume is invalid");
  if (problems.length) fail(`${path}: ${problems.join("; ")}`, { code: "invalid-adapter-capabilities" });
}

async function queryCapabilities(adapter, args, root) {
  const operationRoot = mkdtempSync(join(tmpdir(), "agent-skill-evaluator-capabilities-"));
  try {
    const requestPath = join(operationRoot, "request.json");
    writeJsonAtomic(requestPath, { schema_version: PROTOCOL_VERSION, operation: "capabilities" });
    const invocation = adapterCommand(adapter, "capabilities", requestPath, operationRoot);
    const result = await runProcess(invocation.command, invocation.args, portableEnvironment(args.allowEnv, { EVAL_REPO_ROOT: root, EVAL_MODEL: args.model ?? "" }), Number(args.preflightTimeoutMs ?? 30000), Number(args.maxOutputBytes ?? 1048576));
    const path = join(operationRoot, "capabilities.json");
    if (result.code !== 0 || result.timedOut || result.exceeded || !existsSync(path)) fail(`Adapter capability preflight failed: exit=${result.code} timeout=${result.timedOut} output_exceeded=${result.exceeded}`, { code: "adapter-preflight-failed", details: { stderr: result.stderr.slice(0, 4096) } });
    const capabilities = readJsonBounded(path, Number(args.maxOutputBytes ?? 1048576));
    validateCapabilities(capabilities, path);
    return capabilities;
  } finally { rmSync(operationRoot, { recursive: true, force: true }); }
}

function validateTrialResponse(item, response) {
  if (response?.schema_version !== PROTOCOL_VERSION) fail(`response schema_version must be ${PROTOCOL_VERSION}`, { code: "invalid-adapter-response" });
  if (!Array.isArray(response.side_effects) || typeof response.observations !== "object" || response.observations === null || typeof response.usage !== "object" || response.usage === null) fail("response must include side_effects, observations, and usage", { code: "invalid-adapter-response" });
  if (response.side_effects.some((value) => typeof value !== "string") || (response.artifacts !== undefined && !Array.isArray(response.artifacts))) fail("response side_effects or artifacts are invalid", { code: "invalid-adapter-response" });
  const tokens = response.usage.tokens;
  const cost = response.usage.cost_usd;
  if (!((tokens === null) || (Number.isInteger(tokens) && tokens >= 0)) || !((cost === null) || (Number.isFinite(cost) && cost >= 0))) fail("response usage must contain non-negative tokens and cost_usd or null", { code: "invalid-adapter-response" });
  if (item.stage === "routing") {
    const selected = response.selected;
    if (!(typeof selected === "string" || (Array.isArray(selected) && selected.length > 0 && selected.every((value) => typeof value === "string"))) || typeof response.reason !== "string") fail("routing response must include selected and reason", { code: "invalid-adapter-response" });
  } else if (typeof response.final_response !== "string") fail("execution response must include final_response", { code: "invalid-adapter-response" });
}

function routingGrade(item, response) {
  const expected = Array.isArray(item.expected_selection) ? item.expected_selection : [item.expected_selection];
  const observed = Array.isArray(response.selected) ? response.selected : [response.selected];
  const result = JSON.stringify(observed) === JSON.stringify(expected) ? "pass" : "fail";
  return {
    schema_version: PROTOCOL_VERSION,
    outcome: result,
    failure_class: result === "fail" ? "target-routing" : null,
    assertions: item.assertions.map((assertion) => ({ assertion, result, evidence: `observed selection=${JSON.stringify(observed)}; expected=${JSON.stringify(expected)}` })),
    detail: "Deterministic exact routing-selection check.",
    suite_findings: [],
    usage: { tokens: 0, cost_usd: 0 },
  };
}

function validateGradeResponse(grade) {
  if (grade?.schema_version !== PROTOCOL_VERSION) fail(`grade schema_version must be ${PROTOCOL_VERSION}`, { code: "invalid-grader-response" });
  if (!OUTCOMES.has(grade.outcome)) fail("grade outcome is invalid", { code: "invalid-grader-response" });
  if (!(grade.failure_class === null || typeof grade.failure_class === "string")) fail("grade failure_class must be a string or null", { code: "invalid-grader-response" });
  if (!Array.isArray(grade.assertions) || typeof grade.detail !== "string" || !Array.isArray(grade.suite_findings)) fail("grade must include assertions, detail, and suite_findings", { code: "invalid-grader-response" });
  if (grade.assertions.some((entry) => typeof entry?.assertion !== "string" || !new Set(["pass", "fail", "unknown"]).has(entry?.result) || typeof entry?.evidence !== "string") || grade.suite_findings.some((entry) => typeof entry !== "string")) fail("grade assertion or suite-finding evidence is invalid", { code: "invalid-grader-response" });
  const tokens = grade.usage?.tokens;
  const cost = grade.usage?.cost_usd;
  if (!((tokens === null) || (Number.isInteger(tokens) && tokens >= 0)) || !((cost === null) || (Number.isFinite(cost) && cost >= 0))) fail("grade usage must contain non-negative tokens and cost_usd or null", { code: "invalid-grader-response" });
}

function shellPayload(command) {
  let payload = String(command ?? "").trim();
  for (let depth = 0; depth < 3; depth += 1) {
    const match = payload.match(/^\s*(?:\S*\/)?(?:sh|bash|zsh)\s+-(?:c|lc|cl)\s+(['"])([\s\S]*)\1\s*$/);
    if (!match) break;
    payload = match[2];
  }
  return payload;
}

function commandExecutesTarget(command, assertion) {
  for (const segment of shellPayload(command).split(/&&|\|\||[;|]/)) {
    const tokens = segment.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((token) => token.replace(/^["']+|["',;]+$/g, "")) ?? [];
    for (const target of assertion.targets) {
      const targetIndex = tokens.findIndex((token) => token === target || token.endsWith(`/${target}`));
      if (targetIndex < 0) continue;
      const commandName = basename(tokens[0] ?? "");
      if (targetIndex === 0 || new Set([".", "source"]).has(commandName)) return true;
      if (tokens.slice(0, targetIndex).some((token) => assertion.launchers.includes(basename(token)))) return true;
    }
  }
  return false;
}

function deterministicGrades(item, response) {
  const results = new Map();
  for (const assertion of item.deterministic_assertions ?? []) {
    const toolCalls = response?.observations?.tool_calls;
    if (!Array.isArray(toolCalls)) {
      results.set(assertion.assertion, { assertion: assertion.assertion, result: "unknown", evidence: "Structured tool-call evidence was unavailable." });
      continue;
    }
    const attempted = toolCalls.filter((entry) => entry?.type === "command_execution" && commandExecutesTarget(entry.command, assertion));
    results.set(assertion.assertion, {
      assertion: assertion.assertion,
      result: attempted.length ? "fail" : "pass",
      evidence: attempted.length ? `Structured tool-call evidence recorded ${attempted.length} forbidden target execution attempt(s).` : `Structured tool-call evidence recorded no forbidden target execution across ${toolCalls.length} command observation(s).`,
    });
  }
  return results;
}

function normalizeGrade(item, grade, response) {
  validateGradeResponse(grade);
  if (grade?.outcome === "harness-error") return {
    ...grade,
    assertions: item.assertions.map((assertion) => ({ assertion, result: "unknown", evidence: grade.detail })),
  };
  const reported = Array.isArray(grade?.assertions) ? grade.assertions : [];
  const deterministic = deterministicGrades(item, response);
  const assertions = item.assertions.map((assertion) => {
    if (deterministic.has(assertion)) return deterministic.get(assertion);
    const matches = reported.filter((entry) => entry?.assertion === assertion);
    if (matches.length !== 1 || !new Set(["pass", "fail", "unknown"]).has(matches[0]?.result)) return { assertion, result: "unknown", evidence: matches.length === 0 ? "Grader omitted this required assertion" : "Grader returned duplicate or invalid results for this required assertion" };
    return matches[0];
  });
  const outcome = assertions.some((entry) => entry.result === "fail") ? "fail" : assertions.some((entry) => entry.result === "unknown") ? "unknown" : "pass";
  const normalized = {
    schema_version: PROTOCOL_VERSION,
    ...grade,
    outcome,
    failure_class: outcome === "pass" ? null : grade?.failure_class ?? (outcome === "fail" ? "assertion-failure" : "incomplete-grading"),
    assertions,
    detail: typeof grade?.detail === "string" ? grade.detail : "",
    suite_findings: Array.isArray(grade?.suite_findings) ? grade.suite_findings : [],
  };
  if ([...deterministic.values()].some((entry) => entry.result === "fail")) normalized.failure_class = "deterministic-policy-violation";
  if (grade?.outcome !== outcome) normalized.grader_reported_outcome = grade?.outcome ?? null;
  return normalized;
}

function harnessGrade(item, detail, failureClass = "harness") {
  return {
    schema_version: PROTOCOL_VERSION,
    outcome: "harness-error",
    failure_class: failureClass,
    assertions: item.assertions.map((assertion) => ({ assertion, result: "unknown", evidence: detail })),
    detail,
    suite_findings: [],
    usage: { tokens: null, cost_usd: null },
  };
}

function packageIdentity(root, packageRoot) {
  return contentIdentity(root, [join(packageRoot, "skill.json"), ...walkFiles(join(packageRoot, "src"))]);
}

function suiteIdentity(root, packageRoot) {
  return contentIdentity(root, walkFiles(join(packageRoot, "evals")).filter((path) => !path.includes(`${sep}releases${sep}`)));
}

function relativePortable(root, path, label) {
  const absolute = resolve(root, path);
  if (!isWithin(root, absolute)) fail(`${label} must remain inside the repository: ${path}`, { code: "unsafe-path" });
  return relative(root, absolute).split(sep).join("/");
}

function buildTarget(root, packageRoot) {
  const manifest = readJson(join(packageRoot, "skill.json"));
  const targetPath = relativePortable(root, packageRoot, "Target package");
  const targetStatus = gitOutput(root, ["status", "--porcelain=v1", "--", targetPath]);
  return {
    owner: manifest.owner,
    type: "skill",
    name: manifest.name,
    manifest_version: manifest.version,
    package_path: targetPath,
    package_content_identity: packageIdentity(root, packageRoot),
    source_revision: gitOutput(root, ["rev-parse", "HEAD"]) ?? "not-git-bound",
    source_state: targetStatus === null ? "unknown" : targetStatus.length === 0 ? "clean" : "dirty",
  };
}

function materializeFixtures(packageRoot, item) {
  const fixtureRoot = join(packageRoot, "evals", "files");
  return (item.files ?? []).map((fixture) => {
    const { source, target } = fixtureSpec(fixture);
    const sourcePath = resolve(packageRoot, source);
    return {
      source,
      workspace_path: target ?? join("inputs", relative(fixtureRoot, sourcePath)).split(sep).join("/"),
      content_identity: pathIdentity(sourcePath),
      content: readFileSync(sourcePath, "utf8"),
    };
  });
}

function prepareDependencies(root, supportPaths) {
  return supportPaths.map((value) => {
    const source = resolve(root, value);
    if (!isWithin(root, source) || source === resolve(root) || !existsSync(source)) fail(`Unsafe or missing support path: ${value}`, { code: "unsafe-support-path" });
    if (!isWithin(realpathSync(root), realpathSync(source))) fail(`Support path resolves outside repository: ${value}`, { code: "unsafe-support-path" });
    if (relative(resolve(root), source) !== relative(realpathSync(root), realpathSync(source)) || (statSync(source).isDirectory() && walkSymlinks(source).length)) fail(`Support path contains or resolves through a symlink: ${value}`, { code: "unsafe-support-path" });
    return { source: relativePortable(root, source, "Support path"), workspace_path: relativePortable(root, source, "Support path"), content_identity: pathIdentity(source) };
  });
}

function selectedCases(suite, caseArgs) {
  const selectedIds = new Set(caseArgs.flatMap((value) => value.split(",")).filter(Boolean));
  const cases = selectedIds.size ? suite.evals.filter((item) => selectedIds.has(String(item.id))) : suite.evals;
  if (!cases.length) fail("No evaluation cases selected", { code: "empty-selection" });
  if (selectedIds.size !== cases.length) fail("One or more selected case ids do not exist", { code: "unknown-case" });
  return cases;
}

function identity(value, status) { return { value, status }; }

function plannedInvocationCount(cases, trials, configurations, retries) {
  let count = 0;
  for (const item of cases) {
    const configs = item.stage === "execution" ? configurations.length : 1;
    const perAttempt = item.stage === "execution" ? 2 : 1;
    count += trials * configs * perAttempt * (retries + 1);
  }
  return count;
}

async function preflightRun(args) {
  const root = resolve(args.root ?? process.cwd());
  const packageRoot = resolve(root, args.package ?? "");
  const adapter = resolve(root, args.adapter ?? "");
  const graderAdapter = resolve(root, args.graderAdapter ?? args.adapter ?? "");
  for (const [name, value] of Object.entries({ package: args.package, adapter: args.adapter, host: args.host, model: args.model, configurationId: args.configurationId, catalogId: args.catalogId, authorityPolicyId: args.authorityPolicyId, sandboxMode: args.sandboxMode, networkMode: args.networkMode, caseAuthorId: args.caseAuthorId, runnerId: args.runnerId, reviewerId: args.reviewerId, graderId: args.graderId })) {
    if (!value) fail(`run requires --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, { code: "missing-argument" });
  }
  if (!existsSync(adapter) || !existsSync(graderAdapter)) fail("Adapter or grader adapter was not found", { code: "missing-adapter" });
  const selectionSource = args.selectionSource ?? "explicit";
  if (!RUNNER_SELECTION_SOURCES.has(selectionSource)) fail("--selection-source must be explicit or pack-default", { code: "invalid-runner-selection" });
  for (const [label, path] of [["Target package", packageRoot], ["Adapter", adapter], ["Grader adapter", graderAdapter]]) {
    if (!isWithin(root, path) || path === root || relative(root, path) !== relative(realpathSync(root), realpathSync(path)) || !isWithin(realpathSync(root), realpathSync(path))) fail(`${label} must resolve directly inside the repository without a symlink`, { code: "unsafe-path" });
  }
  const findings = [];
  validateSuite(packageRoot, findings);
  if (findings.length) fail("Suite validation failed", { code: "invalid-suite", details: { findings } });
  if (!EVIDENCE_CLASSES.has(args.evidenceClass ?? "authoring-smoke")) {
    const message = args.evidenceClass === "release" ? "Protocol 1.0.0 does not support release evidence" : `Unsupported evidence class: ${args.evidenceClass}`;
    fail(message, { code: "unsupported-evidence-class" });
  }
  const suite = readJson(join(packageRoot, "evals", "evals.json"));
  const contract = readJson(join(packageRoot, "evals", "evaluation-contract.json"));
  const cases = selectedCases(suite, args.case);
  const routingCatalogs = new Map(cases.filter((item) => item.stage === "routing").map((item) => [String(item.id), catalogForCase(root, packageRoot, item)]));
  const evidenceClass = args.evidenceClass ?? "authoring-smoke";
  const trials = Number(args.trials ?? (evidenceClass === "regression" ? contract.trials?.regression_minimum_per_case ?? 3 : contract.trials?.authoring_smoke_minimum ?? 1));
  const retries = Number(args.retries ?? 0);
  if (!Number.isInteger(trials) || trials < 1) fail("--trials must be a positive integer", { code: "invalid-budget" });
  if (!Number.isInteger(retries) || retries < 0) fail("--retries must be a non-negative integer", { code: "invalid-budget" });
  const timeoutMs = Number(args.timeoutMs ?? 180000);
  const maximumOutputBytes = Number(args.maxOutputBytes ?? 1048576);
  const maximumInvocations = Number(args.maxInvocations ?? 1000);
  if (![timeoutMs, maximumOutputBytes, maximumInvocations].every((value) => Number.isFinite(value) && value > 0)) fail("Budgets must be positive numbers", { code: "invalid-budget" });
  if (args.tokenBudget !== undefined && (!Number.isInteger(Number(args.tokenBudget)) || Number(args.tokenBudget) < 0)) fail("--token-budget must be a non-negative integer", { code: "invalid-budget" });
  if (args.costBudgetUsd !== undefined && (!Number.isFinite(Number(args.costBudgetUsd)) || Number(args.costBudgetUsd) < 0)) fail("--cost-budget-usd must be a non-negative number", { code: "invalid-budget" });

  const capabilities = await queryCapabilities(adapter, args, root);
  const graderCapabilities = graderAdapter === adapter ? capabilities : await queryCapabilities(graderAdapter, args, root);
  if (!graderCapabilities.operations.includes("grade") && cases.some((item) => item.stage === "execution")) fail("Grader adapter does not support grade", { code: "missing-capability" });
  if (cases.some((item) => item.deterministic_assertions?.length) && !capabilities.evidence.includes("tool-calls")) fail("Deterministic command assertions require structured tool-call evidence", { code: "missing-capability" });
  for (const stage of new Set(cases.map((item) => item.stage))) if (!capabilities.stages.includes(stage)) fail(`Adapter does not support ${stage} trials`, { code: "missing-capability" });
  if (!capabilities.sandbox_modes.includes(args.sandboxMode)) fail(`Adapter does not support sandbox ${args.sandboxMode}`, { code: "missing-capability" });
  if (capabilities.network.mode !== args.networkMode) fail(`Requested network mode ${args.networkMode} is unavailable; adapter provides ${capabilities.network.mode}`, { code: "missing-capability" });
  if (cases.some((item) => item.stage === "execution") && !graderCapabilities.sandbox_modes.includes(args.sandboxMode)) fail(`Grader adapter does not support sandbox ${args.sandboxMode}`, { code: "missing-capability" });
  if (cases.some((item) => item.stage === "execution") && graderCapabilities.network.mode !== args.networkMode) fail(`Grader adapter does not support network mode ${args.networkMode}`, { code: "missing-capability" });
  if (cases.some((item) => item.stage === "routing")) {
    if (!ROUTING_MODES.has(capabilities.routing_mode)) fail("Adapter does not support routing", { code: "missing-capability" });
    if (args.routingMode && args.routingMode !== capabilities.routing_mode) fail(`Requested routing mode ${args.routingMode} is unavailable; adapter provides ${capabilities.routing_mode}`, { code: "missing-capability" });
  }
  const requestedBudgets = [["wall-clock", timeoutMs], ["output-bytes", maximumOutputBytes], ["invocations", maximumInvocations], ["tokens", args.tokenBudget], ["cost", args.costBudgetUsd]].filter(([, value]) => value !== undefined && value !== null);
  for (const [budget] of requestedBudgets) {
    if (!capabilities.enforced_budgets.includes(budget) && !new Set(["wall-clock", "output-bytes", "invocations"]).has(budget)) fail(`Adapter cannot enforce requested ${budget} budget`, { code: "missing-capability" });
    if (cases.some((item) => item.stage === "execution") && new Set(["tokens", "cost"]).has(budget) && !graderCapabilities.enforced_budgets.includes(budget)) fail(`Grader adapter cannot enforce requested ${budget} budget`, { code: "missing-capability" });
  }

  const baselineMode = args.baselineMode ?? "none";
  if (!new Set(["none", "without-skill", "package"]).has(baselineMode)) fail("--baseline-mode must be none, without-skill, or package", { code: "invalid-baseline" });
  if (baselineMode === "package" && !args.baselinePackage) fail("--baseline-package is required for package baseline", { code: "invalid-baseline" });
  if (baselineMode !== "package" && args.baselinePackage) fail("--baseline-package requires --baseline-mode package", { code: "invalid-baseline" });
  const target = buildTarget(root, packageRoot);
  const configurations = [{ id: safeId(args.configurationId, "configuration id"), role: "candidate", active_skill: true, target }];
  if (baselineMode === "without-skill") configurations.push({ id: safeId(args.baselineConfigurationId ?? "without-skill", "baseline configuration id"), role: "baseline", active_skill: false, target: null });
  if (baselineMode === "package") {
    const baselineRoot = resolve(root, args.baselinePackage);
    const baselineFindings = [];
    if (!existsSync(baselineRoot) || !isWithin(root, baselineRoot) || baselineRoot === root || relative(root, baselineRoot) !== relative(realpathSync(root), realpathSync(baselineRoot)) || !isWithin(realpathSync(root), realpathSync(baselineRoot))) baselineFindings.push("Baseline package must resolve directly inside the repository without a symlink");
    validateTargetPackage(baselineRoot, baselineFindings);
    if (baselineFindings.length) fail("Baseline package validation failed", { code: "invalid-baseline", details: { findings: baselineFindings } });
    configurations.push({ id: safeId(args.baselineConfigurationId ?? "baseline", "baseline configuration id"), role: "baseline", active_skill: true, target: buildTarget(root, baselineRoot) });
  }
  const planned = plannedInvocationCount(cases, trials, configurations, retries);
  if (planned > maximumInvocations) fail(`Planned adapter invocations ${planned} exceed budget ${maximumInvocations}`, { code: "invocation-budget-exceeded" });
  const manifest = readJson(join(packageRoot, "skill.json"));
  const runId = safeId(args.runId ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`, "run id");
  const outputRoot = resolve(root, args.outputRoot ?? ".work/evals");
  const runRoot = join(outputRoot, manifest.owner, "skills", manifest.name, runId);
  if (existsSync(runRoot)) fail(`Run already exists: ${runRoot}`, { code: "run-exists" });
  const dependencies = prepareDependencies(root, args.supportPath);
  return { root, packageRoot, adapter, graderAdapter, capabilities, graderCapabilities, suite, contract, cases, routingCatalogs, evidenceClass, trials, retries, timeoutMs, maximumOutputBytes, maximumInvocations, configurations, baselineMode, target, runId, runRoot, dependencies };
}

function adapterRecord(root, adapter, capabilities) {
  return { path: relativePortable(root, adapter, "Adapter"), content_identity: pathIdentity(adapter), declared_identity: `${capabilities.adapter.name}@${capabilities.adapter.version}`, host_cli: capabilities.adapter.host_cli ?? null, capabilities };
}

function createRun(context, args) {
  const { root, packageRoot, adapter, graderAdapter, capabilities, graderCapabilities, suite, contract, cases, routingCatalogs, evidenceClass, trials, retries, timeoutMs, maximumOutputBytes, maximumInvocations, configurations, baselineMode, target, runId, dependencies } = context;
  const selectedStages = [...new Set(cases.map((item) => item.stage))].sort();
  const availableStages = [...new Set(suite.evals.map((item) => item.stage))].sort();
  const run = {
    schema_version: PROTOCOL_VERSION,
    protocol_version: PROTOCOL_VERSION,
    run_id: runId,
    state: "running",
    evidence_class: evidenceClass,
    claim_ceiling: evidenceClass === "authoring-smoke" ? "Same-author development evidence only" : "Bounded reliability for the tested identities",
    target,
    suite: { version: suite.suite_version, suite_content_identity: suiteIdentity(root, packageRoot), contract_version: contract.contract_version, contract_content_identity: jsonIdentity(contract) },
    runner: { implementation: "@agentxm/skills/agent-skill-evaluator", version: readJson(join(resolve(skillSourceRoot, ".."), "skill.json")).version, content_identity: runnerIdentity(), runtime: process.version, selection_source: args.selectionSource ?? "explicit" },
    adapters: { host: adapterRecord(root, adapter, capabilities), grader: adapterRecord(root, graderAdapter, graderCapabilities) },
    environment: {
      host: identity(args.host, "declared"),
      model: identity(args.model, "declared"),
      configuration_identity: identity(args.configurationId, "declared"),
      active_catalog: identity(args.catalogId, "declared"),
      routing_catalogs: Object.fromEntries([...routingCatalogs].map(([caseId, catalog]) => [caseId, { content_identity: catalog.content_identity, status: "verified", entries: catalog.entries }])),
      routing_mode: identity(capabilities.routing_mode, "observed"),
      sandbox: identity(args.sandboxMode, capabilities.sandbox_status),
      credential_isolation: identity(capabilities.credential_isolation, "observed"),
      allowed_environment_variables: [...new Set(args.allowEnv)].sort(),
    },
    authority: { policy: identity(args.authorityPolicyId, "declared"), network: identity(args.networkMode, capabilities.network.status) },
    budgets: {
      timeout_ms: { value: timeoutMs, status: "enforced" },
      maximum_output_bytes: { value: maximumOutputBytes, status: "enforced" },
      maximum_invocations: { value: maximumInvocations, status: "enforced" },
      token_budget: { value: args.tokenBudget !== undefined ? Number(args.tokenBudget) : null, status: args.tokenBudget !== undefined ? "enforced" : "declared" },
      cost_budget_usd: { value: args.costBudgetUsd !== undefined ? Number(args.costBudgetUsd) : null, status: args.costBudgetUsd !== undefined ? "enforced" : "declared" },
      retries: { value: retries, status: "enforced" },
      consumed: { invocations: 0, tokens: 0, cost_usd: 0 },
    },
    comparison: { baseline_mode: baselineMode, ordering: configurations.length > 1 ? "alternating-by-trial" : "single-configuration", configurations },
    dependencies,
    coverage: { selected_case_ids: cases.map((item) => String(item.id)), available_case_ids: suite.evals.map((item) => String(item.id)), selected_stages: selectedStages, available_stages: availableStages, trials_per_case: trials },
    provenance: { case_author: args.caseAuthorId, runner: args.runnerId, reviewer: args.reviewerId, grader_identity: args.graderId, independence: args.independence ?? "runner and reviewer identities declared by caller" },
    invocation: {
      package: relativePortable(root, packageRoot, "Target package"),
      adapter: relativePortable(root, adapter, "Adapter"),
      grader_adapter: relativePortable(root, graderAdapter, "Grader adapter"),
      support_paths: dependencies.map((entry) => entry.source),
      allowed_environment_variables: [...new Set(args.allowEnv)].sort(),
    },
    started_at: new Date().toISOString(),
    ended_at: null,
    outcomes: null,
    raw_evidence: [],
    evidence_redaction: { private_paths: { status: "enforced", files_redacted: 0, placeholders: ["<private-root>", `${macosUsersRoot}<redacted>`, "/home/<redacted>", "C:\\Users\\<redacted>"] } },
  };
  const missing = requiredRunFields(contract).filter((field) => !hasPath(run, field));
  if (missing.length) fail(`Run record does not satisfy required result fields: ${missing.join(", ")}`, { code: "unsatisfied-result-contract" });
  return run;
}

function adapterEnv(context, run) {
  return portableEnvironment(run.invocation.allowed_environment_variables, { EVAL_REPO_ROOT: context.root, EVAL_MODEL: run.environment.model.value, EVAL_TIMEOUT_MS: String(run.budgets.timeout_ms.value), EVAL_MAX_OUTPUT_BYTES: String(run.budgets.maximum_output_bytes.value), EVAL_SANDBOX_MODE: run.environment.sandbox.value, EVAL_NETWORK_MODE: run.authority.network.value });
}

async function invokeAdapter({ adapter, operation, request, outputRoot, env, run, maximumOutputBytes }) {
  mkdirSync(outputRoot, { recursive: true });
  const requestPath = join(outputRoot, `${operation}-request.json`);
  writeJsonAtomic(requestPath, request);
  if (run.budgets.consumed.invocations >= run.budgets.maximum_invocations.value) return { ok: false, detail: "Invocation budget exhausted" };
  run.budgets.consumed.invocations += 1;
  const invocation = adapterCommand(adapter, operation, requestPath, outputRoot);
  const result = await runProcess(invocation.command, invocation.args, env, run.budgets.timeout_ms.value, maximumOutputBytes);
  writeTextAtomic(join(outputRoot, `${operation}-adapter.stdout.log`), result.stdout);
  writeTextAtomic(join(outputRoot, `${operation}-adapter.stderr.log`), result.stderr);
  run.evidence_redaction.private_paths.files_redacted += sanitizeEvidenceTree(outputRoot, [env.EVAL_REPO_ROOT, process.env.HOME]);
  if (result.code !== 0 || result.timedOut || result.exceeded) return { ok: false, detail: `adapter exit=${result.code} signal=${result.signal ?? "none"} timeout=${result.timedOut} output_exceeded=${result.exceeded}` };
  const outputName = operation === "trial" ? "response.json" : "grade.json";
  const outputPath = join(outputRoot, outputName);
  if (!existsSync(outputPath)) return { ok: false, detail: `adapter did not write ${outputName}` };
  try {
    const value = readJsonBounded(outputPath, maximumOutputBytes);
    if (operation === "grade") writeJsonAtomic(join(outputRoot, "grader-response.json"), value);
    return { ok: true, value };
  } catch (error) { return { ok: false, detail: error.message }; }
}

function enforceUsage(run, response) {
  const tokens = response?.usage?.tokens;
  const cost = response?.usage?.cost_usd;
  if (Number.isFinite(tokens)) run.budgets.consumed.tokens += tokens;
  if (Number.isFinite(cost)) run.budgets.consumed.cost_usd += cost;
  if (run.budgets.token_budget.value !== null && !Number.isFinite(tokens)) return "Adapter omitted token usage required for enforcement";
  if (run.budgets.cost_budget_usd.value !== null && !Number.isFinite(cost)) return "Adapter omitted cost usage required for enforcement";
  if (run.budgets.token_budget.value !== null && run.budgets.consumed.tokens > run.budgets.token_budget.value) return "Token budget exceeded";
  if (run.budgets.cost_budget_usd.value !== null && run.budgets.consumed.cost_usd > run.budgets.cost_budget_usd.value) return "Cost budget exceeded";
  return null;
}

function configurationOrder(configurations, trialNumber) {
  if (configurations.length < 2 || trialNumber % 2 === 1) return configurations;
  return [...configurations].reverse();
}

function terminalTrial(path) {
  if (!existsSync(path)) return null;
  try { const trial = readJson(path); return OUTCOMES.has(trial.outcome) ? trial : null; } catch { return null; }
}

async function executeRun(context, run) {
  const env = adapterEnv(context, run);
  writeJsonAtomic(join(context.runRoot, "run.json"), run);
  for (const item of context.cases) {
    for (let trialNumber = 1; trialNumber <= context.trials; trialNumber += 1) {
      const configurations = item.stage === "execution" ? configurationOrder(context.configurations, trialNumber) : [context.configurations[0]];
      for (const [configurationIndex, configuration] of configurations.entries()) {
        if (cancellationRequested) break;
        const trialRoot = join(context.runRoot, "trials", safeId(String(item.id), "case id"), safeId(configuration.id, "configuration id"), String(trialNumber));
        const trialPath = join(trialRoot, "trial.json");
        if (terminalTrial(trialPath)) continue;
        let finalGrade = null;
        let finalResponse = null;
        let finalAttempt = 0;
        const attemptsRoot = join(trialRoot, "attempts");
        const existingAttemptNumbers = existsSync(attemptsRoot)
          ? readdirSync(attemptsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name)).map((entry) => Number(entry.name))
          : [];
        const previousMaximumAttempt = existingAttemptNumbers.length ? Math.max(...existingAttemptNumbers) : 0;
        for (let attemptNumber = previousMaximumAttempt + 1; attemptNumber <= previousMaximumAttempt + context.retries + 1; attemptNumber += 1) {
          if (cancellationRequested) break;
          finalAttempt = attemptNumber;
          const attemptRoot = join(attemptsRoot, String(attemptNumber));
          mkdirSync(attemptRoot, { recursive: true });
          const startedAt = new Date();
          const request = {
            schema_version: PROTOCOL_VERSION,
            case_id: item.id,
            stage: item.stage,
            routing_mode: item.stage === "routing" ? context.capabilities.routing_mode : undefined,
            configuration: { id: configuration.id, role: configuration.role, active_skill: configuration.active_skill },
            trial_number: trialNumber,
            attempt_number: attemptNumber,
            comparison_position: configurationIndex + 1,
            prompt: item.prompt,
            target: configuration.target,
            catalog: item.stage === "routing" ? context.routingCatalogs.get(String(item.id)).trial : [],
            fixtures: materializeFixtures(context.packageRoot, item),
            dependencies: context.dependencies,
            artifact_paths: item.artifact_paths ?? [],
            environment: run.environment,
            authority: run.authority,
            budgets: run.budgets,
          };
          const trialResult = await invokeAdapter({ adapter: context.adapter, operation: "trial", request, outputRoot: attemptRoot, env, run, maximumOutputBytes: context.maximumOutputBytes });
          let response = null;
          let grade;
          if (!trialResult.ok) grade = harnessGrade(item, trialResult.detail);
          else {
            response = trialResult.value;
            try {
              validateTrialResponse(item, response);
              const budgetFailure = enforceUsage(run, response);
              if (budgetFailure) grade = harnessGrade(item, budgetFailure, "budget");
              else if (item.stage === "routing") grade = routingGrade(item, response);
              else {
                const graderRequest = {
                  schema_version: PROTOCOL_VERSION,
                  case_id: item.id,
                  blind_configuration_id: `configuration-${createHash("sha256").update(`${run.run_id}:${configuration.id}`).digest("hex").slice(0, 12)}`,
                  expected_output: item.expected_output ?? null,
                  assertions: item.assertions,
                  response,
                  budgets: {
                    token_remaining: run.budgets.token_budget.value === null ? null : Math.max(0, run.budgets.token_budget.value - run.budgets.consumed.tokens),
                    cost_remaining_usd: run.budgets.cost_budget_usd.value === null ? null : Math.max(0, run.budgets.cost_budget_usd.value - run.budgets.consumed.cost_usd),
                  },
                };
                const graderResult = await invokeAdapter({ adapter: context.graderAdapter, operation: "grade", request: graderRequest, outputRoot: attemptRoot, env, run, maximumOutputBytes: context.maximumOutputBytes });
                if (!graderResult.ok) grade = harnessGrade(item, graderResult.detail, "grader");
                else {
                  validateGradeResponse(graderResult.value);
                  const graderBudgetFailure = enforceUsage(run, graderResult.value);
                  grade = graderBudgetFailure ? harnessGrade(item, graderBudgetFailure, "budget") : normalizeGrade(item, graderResult.value, response);
                }
              }
            } catch (error) { grade = harnessGrade(item, error.message); }
          }
          const endedAt = new Date();
          writeJsonAtomic(join(attemptRoot, "grade.json"), grade);
          writeJsonAtomic(join(attemptRoot, "attempt.json"), {
            schema_version: PROTOCOL_VERSION,
            case_id: item.id,
            configuration_id: configuration.id,
            configuration_role: configuration.role,
            trial_number: trialNumber,
            attempt_number: attemptNumber,
            comparison_position: configurationIndex + 1,
            outcome: grade.outcome,
            failure_class: grade.failure_class,
            started_at: startedAt.toISOString(),
            ended_at: endedAt.toISOString(),
            duration_ms: endedAt.getTime() - startedAt.getTime(),
          });
          finalGrade = grade;
          finalResponse = response;
          writeJsonAtomic(join(context.runRoot, "run.json"), run);
          if (grade.outcome !== "harness-error") break;
        }
        if (cancellationRequested) break;
        writeJsonAtomic(trialPath, {
          schema_version: PROTOCOL_VERSION,
          case_id: item.id,
          stage: item.stage,
          routing_mode: item.stage === "routing" ? context.capabilities.routing_mode : null,
          configuration_id: configuration.id,
          configuration_role: configuration.role,
          trial_number: trialNumber,
          comparison_position: configurationIndex + 1,
          final_attempt_number: finalAttempt,
          raw_output_or_durable_locator: finalResponse ? `attempts/${finalAttempt}/response.json` : null,
          observed_selection_or_abstention: item.stage === "routing" ? finalResponse?.selected ?? null : null,
          assertion_results: `attempts/${finalAttempt}/grade.json`,
          side_effects: finalResponse?.side_effects ?? [],
          observations: finalResponse?.observations ?? {},
          usage: finalResponse?.usage ?? { tokens: null, cost_usd: null },
          outcome: finalGrade?.outcome ?? "harness-error",
          failure_class: finalGrade ? finalGrade.failure_class : "harness",
        });
      }
      if (cancellationRequested) break;
    }
    if (cancellationRequested) break;
  }
  if (cancellationRequested) {
    run.state = "canceled";
    run.ended_at = new Date().toISOString();
    run.evidence_redaction.private_paths.files_redacted += sanitizeEvidenceTree(context.runRoot, [context.root, process.env.HOME]);
    writeJsonAtomic(join(context.runRoot, "run.json"), run);
    return null;
  }
  run.evidence_redaction.private_paths.files_redacted += sanitizeEvidenceTree(context.runRoot, [context.root, process.env.HOME]);
  writeJsonAtomic(join(context.runRoot, "run.json"), run);
  return deriveSummary(context.runRoot, run, context.contract);
}

function trialRecords(runRoot) {
  return walkFiles(join(runRoot, "trials")).filter((path) => basename(path) === "trial.json").map((path) => ({ ...readJson(path), path: relative(runRoot, path).split(sep).join("/") })).sort((left, right) => left.path.localeCompare(right.path));
}

function emptyCounts() { return { pass: 0, fail: 0, unknown: 0, "harness-error": 0 }; }

function countOutcomes(records) {
  const counts = emptyCounts();
  for (const record of records) counts[record.outcome] += 1;
  return counts;
}

function wilsonInterval(passes, total) {
  if (!total) return null;
  const z = 1.959963984540054;
  const proportion = passes / total;
  const denominator = 1 + (z * z) / total;
  const center = (proportion + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((proportion * (1 - proportion)) / total + (z * z) / (4 * total * total))) / denominator;
  return { method: "wilson-score-95", lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function deriveSummary(runRoot, run = readJson(join(runRoot, "run.json")), contract = null) {
  if (!contract) fail("Contract is required to derive a summary", { code: "missing-contract" });
  const startingState = run.state;
  const records = trialRecords(runRoot);
  const candidate = records.filter((item) => item.configuration_role === "candidate");
  const counts = countOutcomes(candidate);
  const countsByConfiguration = Object.fromEntries([...new Set(records.map((item) => item.configuration_id))].map((id) => [id, countOutcomes(records.filter((item) => item.configuration_id === id))]));
  const caseRates = [...new Set(candidate.map((item) => String(item.case_id)))].sort().map((caseId) => {
    const caseRecords = candidate.filter((item) => String(item.case_id) === caseId);
    const caseCounts = countOutcomes(caseRecords);
    const decided = caseCounts.pass + caseCounts.fail;
    return { case_id: caseId, counts: caseCounts, decidable_pass_rate: decided ? caseCounts.pass / decided : null, uncertainty: wilsonInterval(caseCounts.pass, decided) };
  });
  const routing = candidate.filter((item) => item.stage === "routing");
  const routingCaseRates = [...new Set(routing.map((item) => String(item.case_id)))].map((caseId) => {
    const attempts = routing.filter((item) => String(item.case_id) === caseId);
    const matched = attempts.filter((item) => item.outcome === "pass").length;
    return { case_id: caseId, attempts: attempts.length, matched, match_rate: attempts.length ? matched / attempts.length : null, stable: matched === 0 || matched === attempts.length };
  });
  const selectedAll = run.coverage.selected_case_ids.length === run.coverage.available_case_ids.length;
  const selectedStages = new Set(run.coverage.selected_stages);
  const requiredStages = new Set(contract.scope?.stages ?? []);
  const fullStages = [...requiredStages].every((stage) => selectedStages.has(stage));
  const claimScope = selectedAll && fullStages ? "full-suite" : "selected-cases";
  const criticalFailures = [];
  if (contract.contract_version === CURRENT_CONTRACT_VERSION) {
    for (const record of candidate) {
      const mappings = (contract.analysis?.critical_assertions ?? []).filter((mapping) => String(mapping.case_id) === String(record.case_id));
      if (mappings.length === 0) continue;
      const gradePath = join(dirname(join(runRoot, record.path)), record.assertion_results);
      const grade = readJson(gradePath);
      for (const mapping of mappings) {
        const assertionResult = grade.assertions.find((item) => item.assertion === mapping.assertion);
        if (!assertionResult || assertionResult.result !== "pass") criticalFailures.push({
          gate: mapping.gate,
          case_id: String(record.case_id),
          configuration_id: record.configuration_id,
          trial_number: record.trial_number,
          assertion: mapping.assertion,
          result: assertionResult?.result ?? "unknown",
          evidence: assertionResult?.evidence ?? "Mapped critical assertion was absent from the grade.",
          grade: relative(runRoot, gradePath).split(sep).join("/"),
        });
      }
    }
  } else {
    const criticalIds = new Set((contract.analysis?.critical_case_ids ?? []).map(String));
    for (const record of candidate) if (criticalIds.has(String(record.case_id)) && record.outcome !== "pass") criticalFailures.push({ gate: null, case_id: String(record.case_id), configuration_id: record.configuration_id, trial_number: record.trial_number, assertion: null, result: record.outcome, evidence: "Legacy contract 2.0.0 case-level critical failure.", grade: record.assertion_results });
  }
  const criticalFailure = criticalFailures.length > 0;
  const total = candidate.length;
  const passRate = total ? counts.pass / total : 0;
  const threshold = Number(contract.analysis?.minimum_pass_rate ?? 1);
  let conclusion;
  if (!total || counts["harness-error"] || counts.unknown) conclusion = "Inconclusive";
  else if (criticalFailure || counts.fail === total) conclusion = "Unsupported";
  else if (counts.fail || passRate < threshold) conclusion = "Partially supported";
  else conclusion = "Supported";
  const limitations = [run.claim_ceiling, run.provenance.independence];
  for (const [label, record] of [["Host", run.environment.host], ["Model", run.environment.model], ["Active catalog identifier", run.environment.active_catalog], ["Authority policy", run.authority.policy]]) if (record.status === "declared") limitations.push(`${label} was declared by the caller and not independently verified.`);
  if (run.authority.network.value === "unobserved") limitations.push("Network activity was not observed or denied by the adapter.");
  if (claimScope === "selected-cases") limitations.push("Conclusion is limited to selected cases and stages; it is not a whole-suite conclusion.");
  if (routing.length && run.coverage.trials_per_case === 1) limitations.push("Single-attempt routing does not characterize a stochastic selection surface.");
  if (routingCaseRates.some((item) => !item.stable)) limitations.push("Routing selection varied across repeated trials; use the recorded rates.");
  if (run.environment.routing_mode.value !== "native-routing" && routing.length) limitations.push(`Routing evidence is ${run.environment.routing_mode.value}, not native host activation evidence.`);
  if (run.environment.credential_isolation.value !== "verified") limitations.push("Adapter credential isolation was not independently verified.");
  if (run.comparison.baseline_mode === "none") limitations.push("No baseline was executed; the run does not establish comparative skill value.");
  const summary = {
    schema_version: PROTOCOL_VERSION,
    run_id: run.run_id,
    counts,
    counts_by_configuration: countsByConfiguration,
    estimand: contract.estimand,
    case_rates: caseRates,
    coverage: run.coverage,
    routing_case_rates: routingCaseRates,
    pass_rate: passRate,
    threshold,
    critical_failure: criticalFailure,
    critical_failures: criticalFailures,
    conclusion,
    claim_scope: claimScope,
    limitations,
    trial_records: records.map((item) => item.path),
  };
  writeJsonAtomic(join(runRoot, "summary.json"), summary);
  const finalState = startingState === "running" ? "complete" : startingState;
  writeTextAtomic(join(runRoot, "report.md"), [
    `# Evaluation report: ${run.target.name}`,
    "",
    `- Run: \`${run.run_id}\``,
    `- State: \`${finalState}\``,
    `- Evidence class: \`${run.evidence_class}\``,
    `- Runner: \`${run.runner.implementation}@${run.runner.version}\` (${run.runner.selection_source})`,
    `- Conclusion: **${summary.conclusion}** (${summary.claim_scope})`,
    `- Candidate outcomes: ${JSON.stringify(counts)}`,
    `- Estimand: \`${contract.estimand.type}\``,
    `- Routing mode: \`${run.environment.routing_mode.value}\``,
    ...limitations.map((item) => `- Limitation: ${item}`),
    "",
    "This mechanically derived report does not interpret, audit, approve, publish, or promote the target.",
    "",
  ].join("\n"));
  run.state = finalState;
  if (startingState === "running") run.ended_at = new Date().toISOString();
  run.outcomes = counts;
  run.raw_evidence = walkFiles(runRoot).filter((path) => basename(path) !== "run.json").map((path) => ({ path: relative(runRoot, path).split(sep).join("/"), content_identity: pathIdentity(path) }));
  writeJsonAtomic(join(runRoot, "run.json"), run);
  return summary;
}

async function runEvaluation(args) {
  let context;
  try { context = await preflightRun(args); }
  catch (error) {
    if (error instanceof EvalError) {
      const root = resolve(args.root ?? process.cwd());
      let proposedWorkspace = null;
      if (args.package && args.runId) {
        try {
          const manifest = readJson(join(resolve(root, args.package), "skill.json"));
          proposedWorkspace = join(resolve(root, args.outputRoot ?? ".work/evals"), manifest.owner, "skills", manifest.name, args.runId);
        } catch { /* original error is authoritative */ }
      }
      error.disposition = { state: "reserved", proposed_workspace: proposedWorkspace, evidence_created: false };
    }
    throw error;
  }
  const run = createRun(context, args);
  mkdirSync(context.runRoot, { recursive: true });
  writeJsonAtomic(join(context.runRoot, "contract.json"), context.contract);
  try {
    const summary = await executeRun(context, run);
    if (!summary) return { run: readJson(join(context.runRoot, "run.json")), summary: null, exitCode: 3 };
    return { run: readJson(join(context.runRoot, "run.json")), summary, exitCode: summary.conclusion === "Supported" ? 0 : 1 };
  } catch (error) {
    run.state = cancellationRequested ? "canceled" : "failed";
    run.ended_at = new Date().toISOString();
    run.error = { code: error.code ?? "unhandled-runner-error", message: error.message };
    writeJsonAtomic(join(context.runRoot, "run.json"), run);
    throw error;
  }
}

function reconstructContext(root, runRoot, run) {
  const packageRoot = resolve(root, run.invocation.package);
  const adapter = resolve(root, run.invocation.adapter);
  const graderAdapter = resolve(root, run.invocation.grader_adapter);
  const suite = readJson(join(packageRoot, "evals", "evals.json"));
  const contract = readJson(join(packageRoot, "evals", "evaluation-contract.json"));
  const cases = suite.evals.filter((item) => run.coverage.selected_case_ids.includes(String(item.id)));
  const routingCatalogs = new Map(Object.entries(run.environment.routing_catalogs ?? {}).map(([caseId, catalog]) => [caseId, { ...catalog, trial: catalog.entries.map(({ name, description }) => ({ name, description })) }]));
  return {
    root, runRoot, packageRoot, adapter, graderAdapter,
    capabilities: run.adapters.host.capabilities,
    graderCapabilities: run.adapters.grader.capabilities,
    suite, contract, cases, routingCatalogs,
    evidenceClass: run.evidence_class,
    trials: run.coverage.trials_per_case,
    retries: run.budgets.retries.value,
    timeoutMs: run.budgets.timeout_ms.value,
    maximumOutputBytes: run.budgets.maximum_output_bytes.value,
    maximumInvocations: run.budgets.maximum_invocations.value,
    configurations: run.comparison.configurations,
    baselineMode: run.comparison.baseline_mode,
    target: run.target,
    runId: run.run_id,
    dependencies: run.dependencies,
  };
}

function verifyResumeIdentity(root, run) {
  const problems = [];
  const packageRoot = resolve(root, run.invocation.package);
  const adapter = resolve(root, run.invocation.adapter);
  const graderAdapter = resolve(root, run.invocation.grader_adapter);
  const matches = (compute, expected) => { try { return compute() === expected; } catch { return false; } };
  if (!matches(() => runnerIdentity(), run.runner.content_identity)) problems.push("runner identity changed");
  if (!matches(() => packageIdentity(root, packageRoot), run.target.package_content_identity)) problems.push("target identity changed");
  if (!matches(() => suiteIdentity(root, packageRoot), run.suite.suite_content_identity)) problems.push("suite identity changed");
  if (run.suite.contract_content_identity) {
    const snapshotPath = join(packageRoot, "evals", "evaluation-contract.json");
    if (!matches(() => jsonIdentity(readJson(snapshotPath)), run.suite.contract_content_identity)) problems.push("contract identity changed");
  }
  if (!matches(() => pathIdentity(adapter), run.adapters.host.content_identity)) problems.push("host adapter identity changed");
  if (!matches(() => pathIdentity(graderAdapter), run.adapters.grader.content_identity)) problems.push("grader adapter identity changed");
  for (const configuration of run.comparison.configurations) {
    if (configuration.role !== "baseline" || !configuration.target) continue;
    const baselineRoot = resolve(root, configuration.target.package_path);
    if (!matches(() => packageIdentity(root, baselineRoot), configuration.target.package_content_identity)) problems.push(`comparison target ${configuration.id} identity changed`);
  }
  for (const dependency of run.dependencies) {
    if (!matches(() => pathIdentity(resolve(root, dependency.source)), dependency.content_identity)) problems.push(`dependency ${dependency.source} identity changed`);
  }
  for (const [caseId, catalog] of Object.entries(run.environment.routing_catalogs ?? {})) {
    for (const entry of catalog.entries) if (!matches(() => pathIdentity(resolve(root, entry.source_path)), entry.content_identity)) problems.push(`routing catalog entry ${entry.name} for case ${caseId} identity changed`);
    if (jsonIdentity(catalog.entries) !== catalog.content_identity) problems.push(`routing catalog record for case ${caseId} changed`);
  }
  if (problems.length) fail(`Resume refused: ${problems.join(", ")}`, { code: "resume-identity-conflict" });
}

async function resumeEvaluation(args) {
  if (!args.run) fail("resume requires --run", { code: "missing-argument" });
  const root = resolve(args.root ?? process.cwd());
  const runRoot = resolve(root, args.run);
  const path = join(runRoot, "run.json");
  if (!existsSync(path)) fail(`Run record not found: ${path}`, { code: "missing-run" });
  const run = readJson(path);
  if (!RUN_STATES.has(run.state) || run.state === "complete") fail(`Run state ${run.state} is not resumable`, { code: "invalid-run-state" });
  if (run.suite.contract_content_identity) {
    const snapshotPath = join(runRoot, "contract.json");
    if (!existsSync(snapshotPath) || jsonIdentity(readJson(snapshotPath)) !== run.suite.contract_content_identity) fail("Resume refused: run contract snapshot identity changed", { code: "resume-identity-conflict" });
  }
  verifyResumeIdentity(root, run);
  run.state = "running";
  run.ended_at = null;
  delete run.error;
  const context = reconstructContext(root, runRoot, run);
  const summary = await executeRun(context, run);
  return { run: readJson(path), summary, exitCode: summary?.conclusion === "Supported" ? 0 : summary ? 1 : 3 };
}

function validateCommand(args) {
  const root = resolve(args.root ?? process.cwd());
  const packages = args.package ? [resolve(root, args.package)] : findSkillPackages(root);
  const findings = [];
  if (packages.length === 0) findings.push("No workspace-authored Agent Skill packages were discovered; pass --package explicitly.");
  for (const packageRoot of packages) validateSuite(packageRoot, findings);
  return { ok: findings.length === 0, packages: packages.map((path) => relative(root, path).split(sep).join("/")), findings };
}

function summarizeCommand(args) {
  if (!args.run) fail("summarize requires --run", { code: "missing-argument" });
  const root = resolve(args.root ?? process.cwd());
  const runRoot = resolve(root, args.run);
  const run = readJson(join(runRoot, "run.json"));
  if (run.state === "running") fail("Cannot summarize an incomplete running run", { code: "invalid-run-state" });
  const snapshotPath = join(runRoot, "contract.json");
  let contract;
  if (existsSync(snapshotPath)) {
    contract = readJson(snapshotPath);
    if (run.suite.contract_content_identity && jsonIdentity(contract) !== run.suite.contract_content_identity) fail("Run contract snapshot identity changed", { code: "summary-identity-conflict" });
  } else {
    const packageRoot = resolve(root, run.invocation.package);
    if (suiteIdentity(root, packageRoot) !== run.suite.suite_content_identity) fail("Legacy run suite identity changed and no contract snapshot is available", { code: "summary-identity-conflict" });
    contract = readJson(join(packageRoot, "evals", "evaluation-contract.json"));
  }
  return deriveSummary(runRoot, run, contract);
}

function inspectCommand(args) {
  if (!args.run) fail("inspect requires --run", { code: "missing-argument" });
  const root = resolve(args.root ?? process.cwd());
  const runRoot = resolve(root, args.run);
  const run = readJson(join(runRoot, "run.json"));
  const summary = existsSync(join(runRoot, "summary.json")) ? readJson(join(runRoot, "summary.json")) : null;
  return { run_id: run.run_id, state: run.state, evidence_class: run.evidence_class, target: run.target, suite: run.suite, runner: run.runner, adapters: run.adapters, environment: run.environment, authority: run.authority, comparison: run.comparison, dependencies: run.dependencies, coverage: run.coverage, budgets: run.budgets, conclusion: summary?.conclusion ?? null, claim_scope: summary?.claim_scope ?? null, limitations: summary?.limitations ?? [], path: relative(root, runRoot).split(sep).join("/") };
}

function usage() {
  return [
    "Agent Skill Evaluator", "", "Commands:",
    "  validate [--package PATH] [--root PATH] [--json]",
    "  run --package PATH --adapter PATH --host ID --model ID --configuration-id ID",
    "      --catalog-id ID --authority-policy-id ID --sandbox-mode MODE --network-mode MODE",
    "      --case-author-id ID --runner-id ID --reviewer-id ID --grader-id ID [options]",
    "  resume --run PATH [--root PATH] [--json]",
    "  summarize --run PATH [--root PATH] [--json]",
    "  inspect --run PATH [--root PATH] [--json]",
    "", "Run options include --grader-adapter, --case, --trials, --retries, --support-path,",
    "--allow-env, --baseline-mode, --baseline-package, --baseline-configuration-id,",
    "--timeout-ms, --max-output-bytes, --max-invocations, --token-budget,",
    "--cost-budget-usd, --run-id, --output-root, --evidence-class, and --selection-source.",
  ].join("\n");
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { cancellationRequested = true; terminateActiveChildren("SIGTERM"); });

async function main() {
  let args;
  try {
    args = process.argv[2] === "--help" || process.argv[2] === "-h" ? { help: true, case: [], supportPath: [], allowEnv: [] } : parseArgs(process.argv.slice(2));
    if (!args.command || args.help) { process.stdout.write(`${usage()}\n`); return; }
    let result;
    let exitCode = 0;
    if (args.command === "validate") { result = validateCommand(args); exitCode = result.ok ? 0 : 2; }
    else if (args.command === "run") { const outcome = await runEvaluation(args); result = { ok: outcome.exitCode === 0, run: outcome.run, summary: outcome.summary }; exitCode = outcome.exitCode; }
    else if (args.command === "resume") { const outcome = await resumeEvaluation(args); result = { ok: outcome.exitCode === 0, run: outcome.run, summary: outcome.summary }; exitCode = outcome.exitCode; }
    else if (args.command === "summarize") result = { ok: true, summary: summarizeCommand(args) };
    else if (args.command === "inspect") result = { ok: true, result: inspectCommand(args) };
    else fail(`Unknown command: ${args.command}`, { code: "invalid-command" });
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else if (args.command === "validate") process.stdout.write(result.ok ? `Validated ${result.packages.length} Agent Skill suite(s).\n` : `${result.findings.join("\n")}\n`);
    else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = exitCode;
  } catch (error) {
    const normalized = error instanceof EvalError ? error : new EvalError(error.message, { code: "unhandled-error", exitCode: 3 });
    const envelope = { ok: false, error: { code: normalized.code, message: normalized.message, details: normalized.details }, disposition: normalized.disposition };
    if (args?.json) process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    else process.stderr.write(`${normalized.message}\n`);
    process.exitCode = normalized.exitCode;
  }
}

await main();
