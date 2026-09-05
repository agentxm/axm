#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error("Usage: format.mjs <input> <output>");

const root = realpathSync(resolve(process.cwd()));
const requestedInput = resolve(root, inputArg);
const output = resolve(root, outputArg);
if (!existsSync(requestedInput)) throw new Error("Input file does not exist");
const input = realpathSync(requestedInput);
const outputParent = realpathSync(dirname(output));
const insideRoot = (path) => {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === "" || pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
};

if (!insideRoot(input) || !insideRoot(output) || !insideRoot(outputParent)) {
  throw new Error("Paths and resolved symlink targets must remain under the working directory");
}
if (input === output) throw new Error("Input and output paths must differ");
if (existsSync(output)) throw new Error("Output already exists; refusing to overwrite it");

const normalized = `${readFileSync(input, "utf8").replace(/[ \t]+$/gm, "").replace(/\n*$/, "\n")}`;
writeFileSync(output, normalized, { flag: "wx" });
process.stdout.write(JSON.stringify({ output: outputArg, bytes: Buffer.byteLength(normalized) }));
