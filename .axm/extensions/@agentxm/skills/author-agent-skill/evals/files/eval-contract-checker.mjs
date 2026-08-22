#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [suitePath, graderPath] = process.argv.slice(2);
if (!suitePath || !graderPath) {
  process.stderr.write("usage: eval-contract-checker.mjs SUITE GRADER\n");
  process.exit(2);
}

const suite = JSON.parse(readFileSync(suitePath, "utf8"));
const grader = JSON.parse(readFileSync(graderPath, "utf8"));
const execution = suite.evals?.find((item) => item.id === "execution-status");
const requiredAssertion = "The Markdown output contains the supplied title, status, and detail fields.";
const valid = execution?.assertions?.includes(requiredAssertion)
  && execution?.grader === "evals/graders/status-summary.json"
  && Array.isArray(grader.required_fields)
  && ["title", "status", "detail"].every((field) => grader.required_fields.includes(field));

if (!valid) {
  process.stderr.write("evaluation source does not bind the status field to the case and grader\n");
  process.exit(1);
}

process.stdout.write("evaluation source valid\n");
