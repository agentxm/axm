/** Diagnostic-only Node API counters for the isolated lifecycle fixture. */

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const moduleApi = require("node:module");
const path = require("node:path");

const output = process.env.AXM_BENCH_DIAGNOSTICS_FILE;
if (output) {
  const metrics = { directoryCalls: 0, hashBytes: 0, gitProcesses: 0, writeCalls: 0 };
  const count = (target, name, metric) => {
    const original = target[name];
    if (typeof original !== "function") return;
    target[name] = function (...args) {
      metrics[metric] += 1;
      return original.apply(this, args);
    };
  };
  for (const name of ["readdir", "readdirSync", "opendir", "opendirSync"]) {
    count(fs, name, "directoryCalls");
  }
  for (const name of ["writeFile", "writeFileSync", "appendFile", "appendFileSync"]) {
    count(fs, name, "writeCalls");
  }
  for (const name of ["readdir", "opendir"]) {
    count(fs.promises, name, "directoryCalls");
  }
  for (const name of ["writeFile", "appendFile"]) {
    count(fs.promises, name, "writeCalls");
  }
  const createHash = crypto.createHash;
  crypto.createHash = function (...args) {
    const hash = createHash.apply(this, args);
    const update = hash.update;
    hash.update = function (value, ...rest) {
      const bytes =
        typeof value === "string" ? Buffer.byteLength(value, rest[0]) : value?.byteLength;
      if (typeof bytes === "number") metrics.hashBytes += bytes;
      return update.call(this, value, ...rest);
    };
    return hash;
  };
  const isGit = (executable) =>
    typeof executable === "string" && /^(?:git|git\.exe)$/iu.test(path.basename(executable));
  for (const name of ["spawn", "execFile"]) {
    const original = childProcess[name];
    childProcess[name] = function (executable, ...args) {
      if (isGit(executable)) metrics.gitProcesses += 1;
      return original.call(this, executable, ...args);
    };
  }
  moduleApi.syncBuiltinESMExports();
  process.once("exit", () => {
    fs.writeFileSync(output, JSON.stringify(metrics));
  });
}
