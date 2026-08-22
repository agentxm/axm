#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const skill = readFileSync(join(packageRoot, "src", "SKILL.md"), "utf8");
const manifest = JSON.parse(readFileSync(join(packageRoot, "skill.json"), "utf8"));
const suite = JSON.parse(readFileSync(join(packageRoot, "evals", "evals.json"), "utf8"));
const contract = JSON.parse(readFileSync(join(packageRoot, "evals", "evaluation-contract.json"), "utf8"));

const description = skill.match(/^description:\s*(.+)$/m)?.[1] ?? "";
const checks = [
  ["routing verbs", /\bformats?\b/i.test(description) && /\bnormalizes?\b/i.test(description)],
  ["publishing exclusion", /not for publishing/i.test(description)],
  ["registry alignment", /\bformats?\b/i.test(manifest.description ?? "") && /\bnormalizes?\b/i.test(manifest.description ?? "") && /not for publishing/i.test(manifest.description ?? "")],
  ["missing-input stop", /missing or cannot be read[\s\S]*stop without writing/i.test(skill)],
  ["positive routing case", suite.evals.some((item) => item.stage === "routing" && item.expected_selection === "format-release-notes")],
  ["publishing negative", suite.evals.some((item) => item.stage === "routing" && item.expected_selection === "clarify-or-abstain")],
  ["supplied-input execution", suite.evals.some((item) => item.stage === "execution" && /normalized local file/i.test(item.expected_output ?? ""))],
  ["missing-input execution", suite.evals.some((item) => item.stage === "execution" && /missing input path/i.test(item.expected_output ?? ""))],
  ["runner contract", contract.contract_version === "2.0.0" && contract.target_binding?.skill_name === manifest.name],
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) throw new Error(`Contract regression failed: ${failed.join(", ")}`);

process.stdout.write(`${JSON.stringify({ ok: true, checks: checks.map(([name]) => name) })}\n`);
