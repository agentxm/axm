#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [operation, requestArg, outputArg] = process.argv.slice(2);
if (!new Set(["capabilities", "trial", "grade"]).has(operation) || !requestArg || !outputArg) {
  process.stderr.write("Usage: synthetic.mjs <capabilities|trial|grade> REQUEST_JSON OUTPUT_DIR\n");
  process.exit(2);
}

const request = JSON.parse(readFileSync(resolve(requestArg), "utf8"));
const outputRoot = resolve(outputArg);
const write = (name, value) =>
  writeFileSync(join(outputRoot, name), `${JSON.stringify(value, null, 2)}\n`);

if (operation === "capabilities") {
  write("capabilities.json", {
    schema_version: "1.0.0",
    adapter: { name: "synthetic-conformance", version: "1.0.0", host_cli: null },
    protocol_versions: ["1.0.0"],
    operations: ["trial", "grade"],
    stages: ["routing", "execution"],
    routing_mode: "catalog-classification-proxy",
    sandbox_modes: ["read-only", "workspace-write"],
    sandbox_status: "enforced",
    enforced_budgets: ["wall-clock", "output-bytes", "invocations", "tokens", "cost"],
    evidence: ["response", "artifacts", "filesystem", "usage", "tool-calls"],
    network: { mode: "denied", status: "enforced" },
    credential_isolation: "verified",
    lifecycle: {
      cancellation: "process-tree-signal",
      retry: "runner-reinvocation",
      resume: "stateless",
    },
  });
} else if (operation === "trial") {
  if (request.prompt.includes("SYNTHETIC_HARNESS_ERROR")) process.exit(23);
  if (request.prompt.includes("SYNTHETIC_RETRY") && request.attempt_number === 1) process.exit(23);
  if (request.prompt.includes("SYNTHETIC_MALFORMED")) {
    writeFileSync(join(outputRoot, "response.json"), "{not-json\n");
    process.exit(0);
  }
  if (request.prompt.includes("SYNTHETIC_TIMEOUT")) {
    spawn(
      process.execPath,
      [
        "-e",
        "setTimeout(() => require('node:fs').writeFileSync(process.env.SYNTHETIC_SENTINEL, 'survived\\n'), 1200)",
      ],
      { stdio: "ignore" },
    );
    setInterval(() => {}, 1000);
  }
  let selected = request.target?.name ?? "clarify-or-abstain";
  if (/create evaluation cases/i.test(request.prompt)) selected = ["axm", "author-agent-skill"];
  else if (/audit .*security|audit .*provenance/i.test(request.prompt))
    selected = "audit-agent-skill";
  else if (/standalone system prompt|check this skill/i.test(request.prompt))
    selected = "clarify-or-abstain";
  const common = {
    schema_version: "1.0.0",
    side_effects: [],
    artifacts: [],
    observations: {
      routing_mode: request.stage === "routing" ? "catalog-classification-proxy" : null,
      filesystem: [],
      subprocesses: [],
      tool_calls: request.prompt.includes("SYNTHETIC_FORBIDDEN_COMMAND")
        ? [
            {
              type: "command_execution",
              command: "/bin/zsh -lc 'sh scripts/install.sh demo'",
              status: "failed",
              exit_code: 127,
            },
          ]
        : [],
      network: "denied",
      environment_probe: process.env.SYNTHETIC_SECRET === undefined ? "absent" : "present",
    },
    usage: { tokens: 10, cost_usd: 0.001 },
  };
  write(
    "response.json",
    request.stage === "routing"
      ? {
          ...common,
          selected,
          reason: "Synthetic deterministic routing for runner conformance only.",
        }
      : {
          ...common,
          final_response: request.prompt.includes("SYNTHETIC_OVERSIZED")
            ? "x".repeat(16384)
            : request.prompt.includes("SYNTHETIC_MALFORMED_GRADE")
              ? "SYNTHETIC_MALFORMED_GRADE"
              : request.prompt.includes("SYNTHETIC_CONTRADICTORY_GRADE")
                ? "SYNTHETIC_CONTRADICTORY_GRADE"
                : request.prompt.includes("SYNTHETIC_FAIL")
                  ? "SYNTHETIC_FAIL"
                  : request.prompt.includes("SYNTHETIC_PRIVATE_PATH")
                    ? `${process.env.HOME}/private/repo\nC:\\Users\\synthetic\\private`
                    : "Synthetic execution response for runner conformance only.",
        },
  );
} else {
  if (request.response?.final_response === "SYNTHETIC_MALFORMED_GRADE") {
    write("grade.json", {
      schema_version: "1.0.0",
      outcome: "not-an-outcome",
      failure_class: null,
      assertions: [],
      detail: "Malformed synthetic grade.",
      suite_findings: [],
      usage: { tokens: 5, cost_usd: 0.0005 },
    });
    process.exit(0);
  }
  const contradictory = request.response?.final_response === "SYNTHETIC_CONTRADICTORY_GRADE";
  const result = request.response?.final_response === "SYNTHETIC_FAIL" ? "fail" : "pass";
  write("grade.json", {
    schema_version: "1.0.0",
    outcome: result,
    failure_class: result === "pass" ? null : "synthetic-target",
    assertions: request.assertions.map((assertion) => ({
      assertion,
      result: contradictory ? "fail" : result,
      evidence: "Synthetic conformance grade.",
    })),
    detail: "Synthetic adapter verifies runner mechanics only.",
    suite_findings: [],
    usage: { tokens: 5, cost_usd: 0.0005 },
  });
}
