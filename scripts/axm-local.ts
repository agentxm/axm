#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createAxmLocalInvocation } from "./axm-local-shared.js";

const scriptPath = fileURLToPath(import.meta.url);

const invocation = createAxmLocalInvocation({
  scriptPath,
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: process.env,
});

const result = spawnSync(invocation.command, invocation.args, {
  cwd: invocation.cwd,
  env: invocation.env,
  stdio: "inherit",
});

if (result.error != null) {
  throw result.error;
}

process.exit(result.status ?? 1);
