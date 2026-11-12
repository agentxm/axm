import type {
  BenchmarkOperation,
  BenchmarkReceipt,
  BenchmarkReportIdentity,
  OperationAllocation,
  ScenarioDeclaration,
} from "./model.js";
import { benchmarkProtocol } from "./protocol.js";
import { ScenarioDimensionsSchema } from "./model.js";
import * as Schema from "effect/Schema";

const key = (operationId: string, modeId: string): string => `${operationId} [${modeId}]`;

/** A valid-looking receipt from another collection cannot inherit this report's identity. */
export const receiptIdentityProblems = (
  report: BenchmarkReportIdentity,
  receipts: ReadonlyArray<BenchmarkReceipt>,
): ReadonlyArray<string> => {
  const problems: string[] = [];
  const protocolId = report.smoke ? `${benchmarkProtocol.id}-smoke` : benchmarkProtocol.id;
  for (const receipt of receipts) {
    for (const field of ["subject", "revision", "binarySha256", "hostId"] as const)
      if (receipt[field] !== report[field])
        problems.push(`${receipt.scenarioId}: ${field} does not match report`);
    if (receipt.protocolId !== protocolId)
      problems.push(`${receipt.scenarioId}: protocolId does not match report`);
  }
  return problems;
};

export interface CoverageInput {
  readonly operations: ReadonlyArray<BenchmarkOperation>;
  readonly scenarios: ReadonlyArray<ScenarioDeclaration>;
  readonly receipts: ReadonlyArray<BenchmarkReceipt>;
}

export const scenarioCoverageProblems = (
  operations: ReadonlyArray<BenchmarkOperation>,
  scenarios: ReadonlyArray<ScenarioDeclaration>,
): ReadonlyArray<string> => {
  const problems: string[] = [];
  if (new Set(operations.map((operation) => operation.id)).size !== operations.length)
    problems.push("duplicate operation id");
  if (new Set(scenarios.map((scenario) => scenario.id)).size !== scenarios.length)
    problems.push("duplicate scenario id");
  for (const operation of operations) {
    for (const flag of operation.flagClassifications)
      if (flag.category === "unclassified")
        problems.push(`unclassified flag: ${operation.id} --${flag.name}`);
    if (new Set(operation.modes.map((mode) => mode.id)).size !== operation.modes.length)
      problems.push(`duplicate mode: ${operation.id}`);
    for (const mode of operation.modes)
      if (
        !scenarios.some(
          (scenario) => scenario.operationId === operation.id && scenario.modeId === mode.id,
        )
      )
        problems.push(`missing scenario: ${key(operation.id, mode.id)}`);
  }
  for (const scenario of scenarios) {
    if (
      !operations.some(
        (operation) =>
          operation.id === scenario.operationId &&
          operation.modes.some((mode) => mode.id === scenario.modeId),
      )
    )
      problems.push(`unregistered scenario: ${scenario.id}`);
    if (
      !Schema.is(ScenarioDimensionsSchema)(scenario.dimensions) ||
      scenario.dimensions.format.trim() === ""
    )
      problems.push(`missing scenario dimensions: ${scenario.id}`);
  }
  return problems;
};

/** Missing, skipped, stale and incomparable measurements are all incomplete. */
export const benchmarkCoverageProblems = ({
  operations,
  scenarios,
  receipts,
}: CoverageInput): ReadonlyArray<string> => {
  const problems = [...scenarioCoverageProblems(operations, scenarios)];
  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  for (const scenario of scenarios) {
    const operation = operationById.get(scenario.operationId);
    const mode = operation?.modes.find((candidate) => candidate.id === scenario.modeId);
    if (operation === undefined || mode === undefined) {
      problems.push(`unregistered scenario: ${scenario.id}`);
      continue;
    }
    const pair: BenchmarkReceipt[] = [];
    for (const subject of ["baseline", "candidate"] as const) {
      const matches = receipts.filter(
        (receipt) => receipt.scenarioId === scenario.id && receipt.subject === subject,
      );
      if (matches.length !== 1) {
        problems.push(`${scenario.id}: expected one ${subject} receipt, found ${matches.length}`);
        continue;
      }
      const receipt = matches[0];
      if (receipt === undefined) continue;
      pair.push(receipt);
      const label = `${scenario.id}/${subject}`;
      if (receipt.operationId !== scenario.operationId || receipt.modeId !== scenario.modeId)
        problems.push(`${label}: route/mode mismatch`);
      if (receipt.status !== "passed") problems.push(`${label}: ${receipt.status}`);
      if (!/^[a-f0-9]{40}$/u.test(receipt.revision))
        problems.push(`${label}: missing full source revision`);
      if (!/^[a-f0-9]{64}$/u.test(receipt.binarySha256))
        problems.push(`${label}: missing binary digest`);
      if (receipt.protocolId !== benchmarkProtocol.id)
        problems.push(`${label}: incompatible protocol`);
      if (receipt.fixtureId !== scenario.fixtureId) problems.push(`${label}: fixture mismatch`);
      if (receipt.hostId.trim() === "" || receipt.evidencePath.trim() === "")
        problems.push(`${label}: missing host or evidence identity`);
      for (const [phase, count] of [
        ["first", benchmarkProtocol.firstInvocations],
        ["warmup", benchmarkProtocol.warmups],
        ["measured", benchmarkProtocol.repetitions],
      ] as const) {
        const samples = receipt.samples.filter((sample) => sample.phase === phase);
        if (samples.length !== count)
          problems.push(`${label}: expected ${count} ${phase} samples, found ${samples.length}`);
        if (new Set(samples.map((sample) => sample.ordinal)).size !== samples.length)
          problems.push(`${label}: duplicate ${phase} sample ordinal`);
      }
      for (const sample of receipt.samples) {
        if (
          !Number.isFinite(sample.durationMs) ||
          sample.durationMs < 0 ||
          sample.exitCode !== sample.expectedExitCode
        )
          problems.push(`${label}: invalid or failed sample ${sample.ordinal}`);
        if (!operation.route.every((part, index) => sample.args[index] === part))
          problems.push(`${label}: measured another route`);
        if (
          !mode.flags.every((flag) => sample.args.includes(flag)) ||
          !mode.arguments.every((argument) => sample.args.includes(argument))
        )
          problems.push(`${label}: measured another mode`);
        if (
          mode.kind === "operation" &&
          sample.args.some(
            (argument) => argument === "--help" || argument === "-h" || argument === "--version",
          )
        )
          problems.push(`${label}: static output cannot substitute for operation execution`);
      }
    }
    const before = pair.find((receipt) => receipt.subject === "baseline");
    const after = pair.find((receipt) => receipt.subject === "candidate");
    if (before !== undefined && after !== undefined) {
      if (
        before.hostId !== after.hostId ||
        before.fixtureId !== after.fixtureId ||
        before.protocolId !== after.protocolId
      )
        problems.push(`${scenario.id}: incomparable baseline and candidate`);
    }
  }
  for (const receipt of receipts)
    if (!scenarioById.has(receipt.scenarioId))
      problems.push(`undeclared receipt: ${receipt.scenarioId}`);
  return [...new Set(problems)];
};

/** Architecture-inapplicable routes still go through benchmarkCoverageProblems. */
export const allocationCoverageProblems = (
  operations: ReadonlyArray<BenchmarkOperation>,
  allocations: ReadonlyArray<OperationAllocation>,
): ReadonlyArray<string> => {
  const problems: string[] = [];
  for (const operation of operations) {
    const matches = allocations.filter((allocation) => allocation.operationId === operation.id);
    const row = matches[0];
    if (matches.length !== 1 || row === undefined) {
      problems.push(`missing or duplicate architecture allocation: ${operation.id}`);
      continue;
    }
    if (
      row.owner.trim() === "" ||
      row.rationale.trim() === "" ||
      row.evidence.length === 0 ||
      row.evidence.some((evidence) => evidence.trim() === "")
    )
      problems.push(`unsupported architecture allocation: ${operation.id}`);
  }
  for (const allocation of allocations)
    if (!operations.some((operation) => operation.id === allocation.operationId))
      problems.push(`unregistered architecture allocation: ${allocation.operationId}`);
  return problems;
};
