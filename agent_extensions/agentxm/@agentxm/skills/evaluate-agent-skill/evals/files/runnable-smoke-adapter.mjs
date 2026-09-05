import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [operation, requestPath, outputPath] = process.argv.slice(2);
const request = JSON.parse(readFileSync(resolve(requestPath), "utf8"));
const write = (name, value) => writeFileSync(join(resolve(outputPath), name), `${JSON.stringify(value, null, 2)}\n`);

if (operation === "capabilities") {
  write("capabilities.json", {
    schema_version: "1.0.0",
    adapter: { name: "evaluate-agent-skill-runnable-fixture", version: "1.0.0", host_cli: null },
    protocol_versions: ["1.0.0"],
    operations: ["trial", "grade"],
    stages: ["routing", "execution"],
    routing_mode: "catalog-classification-proxy",
    sandbox_modes: ["workspace-write"],
    sandbox_status: "enforced",
    enforced_budgets: ["wall-clock", "output-bytes", "invocations", "tokens", "cost"],
    evidence: ["response", "artifacts", "filesystem", "usage", "tool-calls"],
    network: { mode: "denied", status: "enforced" },
    credential_isolation: "verified",
    lifecycle: { cancellation: "process-tree-signal", retry: "runner-reinvocation", resume: "stateless" }
  });
} else if (operation === "trial") {
  const common = {
    schema_version: "1.0.0",
    side_effects: [],
    artifacts: [],
    observations: { filesystem: [], subprocesses: [], tool_calls: [], network: "denied" },
    usage: { tokens: 0, cost_usd: 0 }
  };
  write("response.json", request.stage === "routing"
    ? { ...common, selected: request.target.name, reason: "Deterministic fixture selection for workflow-mechanics evidence only." }
    : { ...common, final_response: "## Added\n\n- Added login retry.\n" });
} else if (operation === "grade") {
  write("grade.json", {
    schema_version: "1.0.0",
    outcome: "pass",
    failure_class: null,
    assertions: request.assertions.map((assertion) => ({ assertion, result: "pass", evidence: "Deterministic runnable-smoke fixture evidence." })),
    detail: "This adapter establishes workflow mechanics only and does not support production target, native-routing, release, or approval claims.",
    suite_findings: [],
    usage: { tokens: 0, cost_usd: 0 }
  });
} else {
  process.stderr.write("Expected capabilities, trial, or grade operation.\n");
  process.exit(2);
}
