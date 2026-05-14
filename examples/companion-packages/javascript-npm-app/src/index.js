#!/usr/bin/env node
// @ts-check

import { CommanderError } from "commander";

import { ExitError, PawMatchCli } from "./pawmatch-cli.js";

const cli = new PawMatchCli();
const program = cli.buildRootCommand();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof ExitError) {
    process.exit(error.code);
  }
  if (error instanceof CommanderError) {
    process.exit(error.exitCode ?? 1);
  }
  throw error;
}
