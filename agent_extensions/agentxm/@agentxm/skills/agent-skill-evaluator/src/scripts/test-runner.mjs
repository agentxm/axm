#!/usr/bin/env node

import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = join(sourceRoot, "scripts", "agent-skill-eval.mjs");
const sourceAdapter = join(sourceRoot, "adapters", "synthetic.mjs");
const sourceCodexAdapter = join(sourceRoot, "adapters", "codex.mjs");
const testRoot = mkdtempSync(join(tmpdir(), "agent-skill-evaluator-test-"));
const packagePath = "skills/fixture-skill";
const packageRoot = join(testRoot, packagePath);
const adapterPath = "skills/agent-skill-evaluator/src/adapters/synthetic.mjs";
const adapter = join(testRoot, adapterPath);
const codexAdapterPath = "skills/agent-skill-evaluator/src/adapters/codex.mjs";
const codexAdapter = join(testRoot, codexAdapterPath);
const outputRoot = join(testRoot, ".work", "evals");
const baselinePackagePath = "skills/baseline-skill";
const baselinePackageRoot = join(testRoot, baselinePackagePath);

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function invoke(args, { expected = 0, env = process.env } = {}) {
  const result = spawnSync(process.execPath, [runner, ...args, "--json"], { cwd: testRoot, env, encoding: "utf8" });
  let body;
  try { body = JSON.parse(result.stdout); }
  catch { throw new Error(`Runner did not return JSON. exit=${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`); }
  if (result.status !== expected) throw new Error(`Unexpected exit ${result.status}, expected ${expected}: ${JSON.stringify(body, null, 2)}\n${result.stderr}`);
  return body;
}

const criticalGate = "No secret leakage";

function contract(requiredField = "suite.suite_content_identity") {
  return {
    contract_version: "3.0.0",
    owner: "@example",
    decision: "Exercise the evaluator runner conformance contract.",
    target_binding: {
      skill_name: "fixture-skill",
      required_result_fields: [
        "target.source_revision",
        "target.package_content_identity",
        requiredField,
        "protocol_version",
        "runner.content_identity",
        "runner.selection_source",
        "adapters.host.content_identity",
        "adapters.host.capabilities",
        "adapters.grader.content_identity",
        "adapters.grader.capabilities",
      ],
    },
    scope: { intended_use: "Synthetic runner conformance.", stages: ["routing", "execution"], case_source: "Synthetic.", excluded_claims: ["Real target behavior"] },
    unit: "One synthetic attempt.",
    environment: {
      required_result_fields: ["environment.host", "environment.model", "environment.configuration_identity", "environment.active_catalog", "environment.routing_mode", "environment.sandbox", "authority.policy", "authority.network", "started_at", "ended_at"],
      routing_boundary: "Catalog only.", execution_boundary: "Synthetic only.",
    },
    evidence: { required_per_trial: ["case_id", "stage", "outcome"], outcomes: ["pass", "fail", "unknown", "harness-error"], storage: "Ignored workspace." },
    grading: { instrument: "Synthetic.", unknown_policy: "Unknown remains unknown.", critical_gates: [criticalGate], calibration: "Synthetic pass and failure." },
    trials: { authoring_smoke_minimum: 1, regression_minimum_per_case: 3, isolation: "Fresh process.", expansion_rule: "Repeat unstable cases." },
    comparison: { baseline: "Without skill.", absence: "No comparative claim." },
    analysis: {
      minimum_pass_rate: 1,
      critical_assertions: [{ gate: criticalGate, case_id: 1, assertion: "The synthetic execution passes." }],
      report_by: ["case"],
      routing_metrics: ["trigger_rate"],
      aggregation_rule: "Preserve uncertainty.",
      threshold: "All pass.",
    },
    estimand: { type: "fixed-suite", sampling_unit: "One synthetic case and trial.", uncertainty: "Descriptive per-case Wilson 95% interval only." },
    lifecycle: { preflight_failure: "Reserved without evidence.", terminal_states: ["complete", "failed", "canceled"], retry: "Append attempts.", resume: "Require matching identities." },
    provenance: { required_result_fields: ["provenance.case_author", "provenance.runner", "provenance.reviewer", "provenance.grader_identity"], independence: "Synthetic only." },
    freshness: { expires_after_days: 1, refresh_triggers: ["Runner changes"] },
  };
}

const suite = {
  skill_name: "fixture-skill",
  suite_version: "1.0.0",
  evaluation_contract: "evals/evaluation-contract.json",
  evals: [
    { id: 1, stage: "execution", prompt: "Synthetic execution.", expected_output: "Synthetic response.", assertions: ["The synthetic execution passes."] },
    { id: 2, stage: "routing", prompt: "Evaluate this fixture skill.", expected_selection: "fixture-skill", catalog_neighbors: [], assertions: ["The target is selected."] },
  ],
};

function writePackage(activeContract = contract(), activeSuite = suite) {
  write(join(packageRoot, "skill.json"), { owner: "@example", type: "skill", name: "fixture-skill", version: "1.0.0" });
  write(join(packageRoot, "src", "SKILL.md"), "---\nname: fixture-skill\ndescription: Handles synthetic fixture evaluation requests.\n---\n\n# Fixture skill\n");
  write(join(packageRoot, "evals", "evaluation-contract.json"), activeContract);
  write(join(packageRoot, "evals", "evals.json"), activeSuite);
}

function writeBaselinePackage() {
  const baselineContract = contract();
  baselineContract.target_binding.skill_name = "baseline-skill";
  const baselineSuite = structuredClone(suite);
  baselineSuite.skill_name = "baseline-skill";
  write(join(baselinePackageRoot, "skill.json"), { owner: "@example", type: "skill", name: "baseline-skill", version: "1.0.0" });
  write(join(baselinePackageRoot, "src", "SKILL.md"), "---\nname: baseline-skill\ndescription: Provides a synthetic comparison target.\n---\n\n# Baseline skill\n");
  write(join(baselinePackageRoot, "evals", "evaluation-contract.json"), baselineContract);
  write(join(baselinePackageRoot, "evals", "evals.json"), baselineSuite);
}

function baseRun(runId, extra = []) {
  return [
    "run", "--root", testRoot,
    "--package", packagePath,
    "--adapter", adapterPath,
    "--host", "synthetic",
    "--model", "synthetic-1",
    "--configuration-id", "candidate",
    "--catalog-id", "synthetic-catalog",
    "--authority-policy-id", "read-only-synthetic",
    "--sandbox-mode", "read-only",
    "--network-mode", "denied",
    "--case-author-id", "synthetic-suite",
    "--runner-id", "conformance-test",
    "--selection-source", "pack-default",
    "--reviewer-id", "same-agent-test",
    "--grader-id", "synthetic-grader",
    "--evidence-class", "authoring-smoke",
    "--run-id", runId,
    "--output-root", outputRoot,
    ...extra,
  ];
}

function replaceOption(args, name, value) {
  const result = [...args];
  const index = result.indexOf(name);
  check(index >= 0, `Missing option ${name}`);
  result[index + 1] = value;
  return result;
}

function removeOption(args, name) {
  const result = [...args];
  const index = result.indexOf(name);
  check(index >= 0, `Missing option ${name}`);
  result.splice(index, 2);
  return result;
}

function runPath(runId) {
  return join(outputRoot, "@example", "skills", "fixture-skill", runId);
}

try {
  mkdirSync(dirname(adapter), { recursive: true });
  cpSync(sourceAdapter, adapter, { recursive: false });
  cpSync(sourceCodexAdapter, codexAdapter, { recursive: false });
  writePackage();

  const validation = invoke(["validate", "--root", testRoot, "--package", packagePath]);
  check(validation.ok && validation.findings.length === 0, "Valid package did not validate");

  const legacyContract = contract();
  legacyContract.contract_version = "2.0.0";
  delete legacyContract.analysis.critical_assertions;
  legacyContract.analysis.critical_case_ids = [1];
  writePackage(legacyContract);
  const legacyValidation = invoke(["validate", "--root", testRoot, "--package", packagePath]);
  check(legacyValidation.ok && legacyValidation.findings.length === 0, "Legacy contract 2.0.0 did not remain readable");
  writePackage();

  writePackage(contract("suite_content_identity"));
  const invalid = invoke(["validate", "--root", testRoot, "--package", packagePath], { expected: 2 });
  check(invalid.findings.some((finding) => finding.includes("absolute run path")), "Ambiguous result field was not rejected");
  writePackage();

  const missingMechanismIdentity = contract();
  missingMechanismIdentity.target_binding.required_result_fields = missingMechanismIdentity.target_binding.required_result_fields.filter((field) => field !== "adapters.grader.content_identity");
  writePackage(missingMechanismIdentity);
  const missingMechanism = invoke(["validate", "--root", testRoot, "--package", packagePath], { expected: 2 });
  check(missingMechanism.findings.some((finding) => finding.includes("required mechanism result field adapters.grader.content_identity")), "Missing grader-adapter identity was not rejected");
  writePackage();

  const missingCriticalMapping = contract();
  delete missingCriticalMapping.analysis.critical_assertions;
  writePackage(missingCriticalMapping);
  const unmappedCriticalGate = invoke(["validate", "--root", testRoot, "--package", packagePath], { expected: 2 });
  check(unmappedCriticalGate.findings.some((finding) => finding.includes("every critical gate must map to a case assertion")), "Unmapped critical gate was not rejected");
  writePackage();

  const invalidCriticalMapping = contract();
  invalidCriticalMapping.analysis.critical_assertions[0].assertion = "An assertion that does not exist.";
  writePackage(invalidCriticalMapping);
  const missingCriticalAssertion = invoke(["validate", "--root", testRoot, "--package", packagePath], { expected: 2 });
  check(missingCriticalAssertion.findings.some((finding) => finding.includes("must name an exact assertion")), "Unknown critical assertion was not rejected");
  writePackage();

  const malformedCriticalGates = contract();
  malformedCriticalGates.grading.critical_gates = {};
  writePackage(malformedCriticalGates);
  const invalidCriticalGates = invoke(["validate", "--root", testRoot, "--package", packagePath], { expected: 2 });
  check(invalidCriticalGates.findings.some((finding) => finding.includes("critical_gates must be a non-empty array")), "Malformed critical gates did not produce a validation finding");
  writePackage();

  const unsafeSuite = structuredClone(suite);
  unsafeSuite.evals[0].id = "../unsafe";
  writePackage(contract(), unsafeSuite);
  const unsafeIdentifier = invoke(["validate", "--root", testRoot, "--package", packagePath], { expected: 2 });
  check(unsafeIdentifier.findings.some((finding) => finding.includes("safe for evidence paths")), "Unsafe case identifier was not rejected");
  writePackage();

  const runtimeLink = join(packageRoot, "src", "escaped-link.md");
  symlinkSync("SKILL.md", runtimeLink);
  const unsafeRuntime = invoke(["validate", "--root", testRoot, "--package", packagePath], { expected: 2 });
  check(unsafeRuntime.findings.some((finding) => finding.includes("runtime payload symlinks")), "Runtime payload symlink was not rejected");
  rmSync(runtimeLink);

  const supportDirectory = join(testRoot, "support-link-test");
  write(join(supportDirectory, "real.md"), "Synthetic support.\n");
  symlinkSync("real.md", join(supportDirectory, "link.md"));
  const unsafeSupport = invoke(baseRun("unsafe-support", ["--case", "1", "--support-path", "support-link-test"]), { expected: 2 });
  check(unsafeSupport.error.code === "unsafe-support-path" && !existsSync(runPath("unsafe-support")), "Support symlink was not rejected during preflight");

  const smoke = invoke(baseRun("smoke", ["--case", "1,2"]), { env: { ...process.env, SYNTHETIC_SECRET: "must-not-enter-trial" } });
  check(smoke.run.state === "complete", "Smoke run did not complete");
  check(smoke.run.runner.selection_source === "pack-default", "Runner selection source was not preserved");
  check(readFileSync(join(runPath("smoke"), "report.md"), "utf8").includes("(pack-default)"), "Mechanically derived report omitted runner selection source");
  check(smoke.summary.conclusion === "Supported" && smoke.summary.claim_scope === "full-suite", "Full-suite conclusion was not scoped correctly");
  const passingExecutionTrial = JSON.parse(readFileSync(join(runPath("smoke"), "trials", "1", "candidate", "1", "trial.json"), "utf8"));
  check(passingExecutionTrial.outcome === "pass" && passingExecutionTrial.failure_class === null, "Passing trial retained a failure classification");
  check(smoke.summary.estimand.type === "fixed-suite" && smoke.summary.case_rates.every((entry) => entry.uncertainty?.method === "wilson-score-95"), "Fixed-suite estimand or per-case uncertainty was omitted");
  const executionResponse = JSON.parse(readFileSync(join(runPath("smoke"), "trials", "1", "candidate", "1", "attempts", "1", "response.json"), "utf8"));
  check(executionResponse.observations.environment_probe === "absent", "Parent secret entered the trial environment");
  check(smoke.run.environment.routing_mode.value === "catalog-classification-proxy", "Routing mode was not preserved");
  check(smoke.run.environment.routing_catalogs["2"].status === "verified" && smoke.run.environment.routing_catalogs["2"].entries[0].name === "fixture-skill", "Resolved routing catalog identity was not preserved");

  const forbiddenCommandSuite = structuredClone(suite);
  forbiddenCommandSuite.evals[0].prompt = "SYNTHETIC_FORBIDDEN_COMMAND";
  forbiddenCommandSuite.evals[0].deterministic_assertions = [{
    assertion: "The synthetic execution passes.",
    kind: "forbid-target-execution",
    targets: ["scripts/install.sh"],
    launchers: ["sh", "bash", "zsh"],
  }];
  writePackage(contract(), forbiddenCommandSuite);
  const forbiddenCommand = invoke(baseRun("forbidden-command", ["--case", "1"]), { expected: 1 });
  const forbiddenGrade = JSON.parse(readFileSync(join(runPath("forbidden-command"), "trials", "1", "candidate", "1", "attempts", "1", "grade.json"), "utf8"));
  check(forbiddenCommand.summary.critical_failure === true && forbiddenGrade.failure_class === "deterministic-policy-violation" && forbiddenGrade.assertions[0].result === "fail", "Structured forbidden target execution did not override the model grade");

  const privatePathSuite = structuredClone(suite);
  privatePathSuite.evals[0].prompt = "SYNTHETIC_PRIVATE_PATH";
  writePackage(contract(), privatePathSuite);
  const privatePath = invoke(baseRun("private-path", ["--case", "1", "--allow-env", "HOME"]));
  const privateEvidence = readdirSync(runPath("private-path"), { recursive: true }).map((entry) => {
    const path = join(runPath("private-path"), entry);
    return existsSync(path) && !statSync(path).isDirectory() ? readFileSync(path, "utf8") : "";
  }).join("\n");
  check(privatePath.run.evidence_redaction.private_paths.files_redacted > 0 && !privateEvidence.includes(process.env.HOME) && !privateEvidence.includes("C:\\\\Users\\\\synthetic") && privateEvidence.includes("<private-root>") && privateEvidence.includes("C:\\\\Users\\\\<redacted>"), "Generated evidence did not redact private POSIX and Windows paths before retention");
  writePackage();

  const direct = invoke(removeOption(baseRun("direct", ["--case", "1"]), "--selection-source"));
  check(direct.run.runner.selection_source === "explicit", "Direct runner invocation did not default selection source to explicit");

  const stubBin = join(testRoot, "stub-bin");
  const stubCodex = join(stubBin, "codex");
  write(stubCodex, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "--version") { process.stdout.write("codex-stub 1.0.0\\n"); process.exit(0); }
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
const schema = JSON.parse(readFileSync(valueAfter("--output-schema"), "utf8"));
const prompt = args.at(-1);
let output;
if (schema.properties.selected) output = { selected: "fixture-skill", reason: "Stubbed routing response.", side_effects: [] };
else if (schema.properties.final_response) output = { final_response: "Stubbed execution response.", side_effects: [] };
else {
  const payload = JSON.parse(prompt.split("\\n\\n").at(-1));
  output = { outcome: "pass", failure_class: null, assertions: payload.assertions.map((assertion) => ({ assertion, result: "pass", evidence: "Stubbed grader evidence." })), detail: "Stubbed grader response.", suite_findings: [] };
}
writeFileSync(valueAfter("--output-last-message"), JSON.stringify(output));
process.stdout.write('{"type":"item.completed","item":{"id":"stub-command","type":"command_execution","command":"sed -n 1,10p scripts/install.sh","status":"completed","exit_code":0}}\\n');
`);
  chmodSync(stubCodex, 0o755);
  let codexArgs = baseRun("codex-adapter", ["--case", "1,2"]);
  codexArgs = replaceOption(codexArgs, "--adapter", codexAdapterPath);
  codexArgs = replaceOption(codexArgs, "--host", "codex-cli-stub");
  codexArgs = replaceOption(codexArgs, "--network-mode", "unobserved");
  const codexRun = invoke(codexArgs, { env: { ...process.env, PATH: `${stubBin}:${process.env.PATH}` } });
  check(codexRun.summary.conclusion === "Supported" && codexRun.run.adapters.host.declared_identity === "codex-cli@1.0.0" && codexRun.run.authority.network.value === "unobserved", "Codex adapter did not satisfy the shared protocol through a provider-free host stub");
  const codexResponse = JSON.parse(readFileSync(join(runPath("codex-adapter"), "trials", "1", "candidate", "1", "attempts", "1", "response.json"), "utf8"));
  check(codexResponse.observations.tool_calls[0]?.command.startsWith("sed "), "Codex adapter did not normalize structured command observations");

  const summaryBefore = readFileSync(join(runPath("smoke"), "summary.json"), "utf8");
  const changedContractAfterRun = contract();
  changedContractAfterRun.analysis.minimum_pass_rate = 0.5;
  writePackage(changedContractAfterRun);
  invoke(["summarize", "--root", testRoot, "--run", runPath("smoke")]);
  check(readFileSync(join(runPath("smoke"), "summary.json"), "utf8") === summaryBefore, "Summary was not deterministically reproduced from its bound contract snapshot");
  writePackage();
  const inspected = invoke(["inspect", "--root", testRoot, "--run", runPath("smoke")]);
  check(inspected.result.state === "complete" && inspected.result.environment.routing_mode.value === "catalog-classification-proxy" && inspected.result.authority.network.value === "denied", "Inspect omitted run state, routing mode, or authority identity");

  const subset = invoke(baseRun("subset", ["--case", "1"]));
  check(subset.summary.claim_scope === "selected-cases" && subset.summary.limitations.some((item) => item.includes("not a whole-suite")), "Partial selection was not bounded");

  const proxyConflict = invoke(baseRun("proxy-conflict", ["--case", "2", "--routing-mode", "native-routing"]), { expected: 2 });
  check(proxyConflict.disposition.state === "reserved" && proxyConflict.disposition.evidence_created === false, "Capability conflict did not preserve reserved preflight");
  check(!existsSync(runPath("proxy-conflict")), "Preflight failure created run evidence");

  const completeSyntheticAdapter = readFileSync(sourceAdapter, "utf8");
  write(adapter, completeSyntheticAdapter.replace('stages: ["routing", "execution"]', 'stages: ["execution"]'));
  const stageConflict = invoke(baseRun("stage-conflict", ["--case", "2"]), { expected: 2 });
  check(stageConflict.error.code === "missing-capability" && !existsSync(runPath("stage-conflict")), "Unsupported adapter stage did not stop preflight");
  write(adapter, completeSyntheticAdapter.replace('network: { mode: "denied", status: "enforced" }', 'network: { mode: "unobserved", status: "observed" }'));
  const networkConflict = invoke(baseRun("network-conflict", ["--case", "1"]), { expected: 2 });
  check(networkConflict.error.code === "missing-capability" && !existsSync(runPath("network-conflict")), "Weaker adapter network control did not stop preflight");
  write(adapter, completeSyntheticAdapter);

  const missingCatalogSuite = structuredClone(suite);
  missingCatalogSuite.evals[1].catalog_neighbors = ["missing-neighbor"];
  writePackage(contract(), missingCatalogSuite);
  const missingCatalog = invoke(baseRun("missing-catalog", ["--case", "2"]), { expected: 2 });
  check(missingCatalog.error.code === "missing-catalog-entry" && !existsSync(runPath("missing-catalog")), "Missing routing catalog entry did not stop preflight");
  writePackage();

  const release = invoke(baseRun("release", ["--evidence-class", "release"]), { expected: 2 });
  check(release.error.code === "unsupported-evidence-class" && !existsSync(runPath("release")), "Release evidence was not rejected before workspace creation");

  const baseline = invoke(baseRun("baseline", ["--case", "1", "--trials", "2", "--baseline-mode", "without-skill", "--baseline-configuration-id", "without-skill"]));
  check(Object.keys(baseline.summary.counts_by_configuration).sort().join(",") === "candidate,without-skill", "Baseline was not executed as a first-class configuration");
  const firstCandidateTrial = JSON.parse(readFileSync(join(runPath("baseline"), "trials", "1", "candidate", "1", "trial.json"), "utf8"));
  const secondCandidateTrial = JSON.parse(readFileSync(join(runPath("baseline"), "trials", "1", "candidate", "2", "trial.json"), "utf8"));
  check(firstCandidateTrial.comparison_position === 1 && secondCandidateTrial.comparison_position === 2, "Comparison ordering was not varied and recorded across trials");
  const blindedRequest = JSON.parse(readFileSync(join(runPath("baseline"), "trials", "1", "candidate", "1", "attempts", "1", "grade-request.json"), "utf8"));
  check(/^configuration-[a-f0-9]{12}$/.test(blindedRequest.blind_configuration_id) && !("configuration" in blindedRequest), "Grader request exposed candidate attribution");

  const invocationConflict = invoke(baseRun("invocation-conflict", ["--case", "1", "--max-invocations", "1"]), { expected: 2 });
  check(invocationConflict.error.code === "invocation-budget-exceeded" && !existsSync(runPath("invocation-conflict")), "Invocation budget was not rejected during preflight");
  const invalidBudget = invoke(baseRun("invalid-budget", ["--case", "1", "--cost-budget-usd", "not-a-number"]), { expected: 2 });
  check(invalidBudget.error.code === "invalid-budget" && !existsSync(runPath("invalid-budget")), "Invalid cost budget was not rejected during preflight");
  const invalidSelection = invoke(baseRun("invalid-selection", ["--case", "1", "--selection-source", "auto-discovered"]), { expected: 2 });
  check(invalidSelection.error.code === "invalid-runner-selection" && !existsSync(runPath("invalid-selection")), "Invalid runner selection source was not rejected during preflight");

  const budget = invoke(baseRun("budget", ["--case", "1", "--token-budget", "5"]), { expected: 1 });
  check(budget.summary.conclusion === "Inconclusive" && budget.summary.counts["harness-error"] === 1, "Token budget breach was not preserved as harness error");
  const aggregateBudget = invoke(baseRun("aggregate-budget", ["--case", "1", "--token-budget", "12"]), { expected: 1 });
  check(aggregateBudget.summary.counts["harness-error"] === 1 && aggregateBudget.run.budgets.consumed.tokens === 15, "Grader usage was omitted from the aggregate token budget");

  const targetFailureSuite = structuredClone(suite);
  targetFailureSuite.evals[0].prompt = "SYNTHETIC_FAIL";
  writePackage(contract(), targetFailureSuite);
  const targetFailure = invoke(baseRun("target-failure", ["--case", "1"]), { expected: 1 });
  check(targetFailure.summary.counts.fail === 1 && targetFailure.summary.counts["harness-error"] === 0, "Target failure was misattributed to the harness");
  check(targetFailure.summary.critical_failure === true && targetFailure.summary.critical_failures.length === 1 && targetFailure.summary.conclusion === "Unsupported", "Critical assertion failure did not independently gate the conclusion");

  const malformedSuite = structuredClone(suite);
  malformedSuite.evals[0].prompt = "SYNTHETIC_MALFORMED";
  writePackage(contract(), malformedSuite);
  const malformed = invoke(baseRun("malformed", ["--case", "1"]), { expected: 1 });
  check(malformed.summary.counts["harness-error"] === 1, "Malformed adapter output was not preserved as a harness error");

  const malformedGradeSuite = structuredClone(suite);
  malformedGradeSuite.evals[0].prompt = "SYNTHETIC_MALFORMED_GRADE";
  writePackage(contract(), malformedGradeSuite);
  const malformedGrade = invoke(baseRun("malformed-grade", ["--case", "1"]), { expected: 1 });
  check(malformedGrade.summary.counts["harness-error"] === 1, "Malformed grader output was not preserved as a harness error");

  const oversizedSuite = structuredClone(suite);
  oversizedSuite.evals[0].prompt = "SYNTHETIC_OVERSIZED";
  writePackage(contract(), oversizedSuite);
  const oversized = invoke(baseRun("oversized", ["--case", "1", "--max-output-bytes", "1024"]), { expected: 1 });
  check(oversized.summary.counts["harness-error"] === 1, "Oversized adapter output was not preserved as a harness error");

  const contradictorySuite = structuredClone(suite);
  contradictorySuite.evals[0].prompt = "SYNTHETIC_CONTRADICTORY_GRADE";
  writePackage(contract(), contradictorySuite);
  const contradictory = invoke(baseRun("contradictory", ["--case", "1"]), { expected: 1 });
  const normalizedGrade = JSON.parse(readFileSync(join(runPath("contradictory"), "trials", "1", "candidate", "1", "attempts", "1", "grade.json"), "utf8"));
  const rawGrade = JSON.parse(readFileSync(join(runPath("contradictory"), "trials", "1", "candidate", "1", "attempts", "1", "grader-response.json"), "utf8"));
  check(contradictory.summary.counts.fail === 1 && normalizedGrade.grader_reported_outcome === "pass" && rawGrade.outcome === "pass", "Contradictory grader output was not normalized and retained");

  const retrySuite = structuredClone(suite);
  retrySuite.evals[0].prompt = "SYNTHETIC_RETRY then pass.";
  writePackage(contract(), retrySuite);
  const retry = invoke(baseRun("retry", ["--case", "1", "--retries", "1"]));
  check(existsSync(join(runPath("retry"), "trials", "1", "candidate", "1", "attempts", "1", "attempt.json")), "Original failed attempt was not retained");
  check(existsSync(join(runPath("retry"), "trials", "1", "candidate", "1", "attempts", "2", "attempt.json")), "Retry attempt was not retained separately");

  const timeoutSuite = structuredClone(suite);
  timeoutSuite.evals[0].prompt = "SYNTHETIC_TIMEOUT";
  writePackage(contract(), timeoutSuite);
  const timeoutSentinel = join(testRoot, "timeout-child-survived");
  const timeout = invoke(baseRun("timeout", ["--case", "1", "--timeout-ms", "100", "--allow-env", "SYNTHETIC_SENTINEL"]), { expected: 1, env: { ...process.env, SYNTHETIC_SENTINEL: timeoutSentinel } });
  check(timeout.summary.counts["harness-error"] === 1, "Timeout was not preserved as a harness error");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  check(!existsSync(timeoutSentinel), "Timed-out adapter child process survived process-tree termination");

  const cancelSentinel = join(testRoot, "canceled-child-survived");
  const cancelArgs = [...baseRun("cancel", ["--case", "1", "--timeout-ms", "5000", "--allow-env", "SYNTHETIC_SENTINEL"]), "--json"];
  const cancelProcess = spawn(process.execPath, [runner, ...cancelArgs], { cwd: testRoot, env: { ...process.env, SYNTHETIC_SENTINEL: cancelSentinel }, stdio: "ignore" });
  const cancelRequest = join(runPath("cancel"), "trials", "1", "candidate", "1", "attempts", "1", "trial-request.json");
  for (let index = 0; index < 100 && !existsSync(cancelRequest); index += 1) await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  check(existsSync(cancelRequest), "Cancellation test never reached an active adapter attempt");
  cancelProcess.kill("SIGINT");
  await new Promise((resolvePromise) => cancelProcess.on("close", resolvePromise));
  const canceledRun = JSON.parse(readFileSync(join(runPath("cancel"), "run.json"), "utf8"));
  check(canceledRun.state === "canceled", "Interrupted run did not retain canceled lifecycle state");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  check(!existsSync(cancelSentinel), "Canceled adapter child process survived process-tree termination");

  writePackage();
  invoke(baseRun("resume", ["--case", "1,2"]));
  const resumeRoot = runPath("resume");
  const resumeRecord = JSON.parse(readFileSync(join(resumeRoot, "run.json"), "utf8"));
  resumeRecord.state = "canceled";
  resumeRecord.ended_at = new Date().toISOString();
  write(join(resumeRoot, "run.json"), resumeRecord);
  rmSync(join(resumeRoot, "trials", "2"), { recursive: true, force: true });
  write(join(resumeRoot, "trials", "2", "candidate", "1", "attempts", "1", "interrupted.txt"), "Preserved partial attempt.\n");
  rmSync(join(resumeRoot, "summary.json"), { force: true });
  const resumed = invoke(["resume", "--root", testRoot, "--run", resumeRoot]);
  check(resumed.run.state === "complete" && resumed.summary.counts.pass === 2, "Compatible interrupted run did not resume");
  check(existsSync(join(resumeRoot, "trials", "2", "candidate", "1", "attempts", "1", "interrupted.txt")) && existsSync(join(resumeRoot, "trials", "2", "candidate", "1", "attempts", "2", "attempt.json")), "Resume overwrote an interrupted attempt instead of appending a new one");

  invoke(baseRun("resume-conflict", ["--case", "1"]));
  const conflictRoot = runPath("resume-conflict");
  const conflictRecord = JSON.parse(readFileSync(join(conflictRoot, "run.json"), "utf8"));
  conflictRecord.state = "canceled";
  write(join(conflictRoot, "run.json"), conflictRecord);
  const changedSuite = structuredClone(suite);
  changedSuite.evals[0].prompt = "Changed after identity binding.";
  writePackage(contract(), changedSuite);
  const conflict = invoke(["resume", "--root", testRoot, "--run", conflictRoot], { expected: 2 });
  check(conflict.error.code === "resume-identity-conflict", "Changed suite identity did not block resume");
  writePackage();

  invoke(baseRun("contract-snapshot-conflict", ["--case", "1"]));
  const contractSnapshotConflictRoot = runPath("contract-snapshot-conflict");
  const contractSnapshotConflictRecord = JSON.parse(readFileSync(join(contractSnapshotConflictRoot, "run.json"), "utf8"));
  contractSnapshotConflictRecord.state = "canceled";
  write(join(contractSnapshotConflictRoot, "run.json"), contractSnapshotConflictRecord);
  const changedSnapshot = JSON.parse(readFileSync(join(contractSnapshotConflictRoot, "contract.json"), "utf8"));
  changedSnapshot.decision = "Tampered after the run started.";
  write(join(contractSnapshotConflictRoot, "contract.json"), changedSnapshot);
  const snapshotConflict = invoke(["resume", "--root", testRoot, "--run", contractSnapshotConflictRoot], { expected: 2 });
  check(snapshotConflict.error.code === "resume-identity-conflict", "Changed contract snapshot identity did not block resume");

  writeBaselinePackage();
  rmSync(join(baselinePackageRoot, "evals"), { recursive: true, force: true });
  invoke(baseRun("baseline-resume-conflict", ["--case", "1", "--baseline-mode", "package", "--baseline-package", baselinePackagePath, "--baseline-configuration-id", "baseline"]));
  const baselineConflictRoot = runPath("baseline-resume-conflict");
  const baselineConflictRecord = JSON.parse(readFileSync(join(baselineConflictRoot, "run.json"), "utf8"));
  baselineConflictRecord.state = "canceled";
  write(join(baselineConflictRoot, "run.json"), baselineConflictRecord);
  write(join(baselinePackageRoot, "src", "SKILL.md"), "---\nname: baseline-skill\ndescription: Changed comparison target.\n---\n");
  const baselineConflict = invoke(["resume", "--root", testRoot, "--run", baselineConflictRoot], { expected: 2 });
  check(baselineConflict.error.code === "resume-identity-conflict", "Changed comparison target identity did not block resume");

  const dependencyPath = "support/synthetic-guidance.md";
  write(join(testRoot, dependencyPath), "Synthetic dependency.\n");
  invoke(baseRun("dependency-resume-conflict", ["--case", "1", "--support-path", dependencyPath]));
  const dependencyConflictRoot = runPath("dependency-resume-conflict");
  const dependencyConflictRecord = JSON.parse(readFileSync(join(dependencyConflictRoot, "run.json"), "utf8"));
  dependencyConflictRecord.state = "canceled";
  write(join(dependencyConflictRoot, "run.json"), dependencyConflictRecord);
  write(join(testRoot, dependencyPath), "Changed synthetic dependency.\n");
  const dependencyConflict = invoke(["resume", "--root", testRoot, "--run", dependencyConflictRoot], { expected: 2 });
  check(dependencyConflict.error.code === "resume-identity-conflict", "Changed support dependency identity did not block resume");

  for (const schema of readdirSync(join(sourceRoot, "schemas"))) JSON.parse(readFileSync(join(sourceRoot, "schemas", schema), "utf8"));
  process.stdout.write("Agent Skill evaluator conformance tests passed.\n");
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}
