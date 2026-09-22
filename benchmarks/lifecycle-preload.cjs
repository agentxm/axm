/** Diagnostic-only Node API counters for the isolated lifecycle fixture. */

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const moduleApi = require("node:module");
const path = require("node:path");

if (process.env.AXM_BENCH_DIAGNOSTICS === "1") {
  const directoryCallsByRoot = {
    nxCache: 0,
    extensions: 0,
    agentTargets: 0,
    workspaceOther: 0,
    userHome: 0,
    outside: 0,
  };
  const metrics = {
    directoryCalls: 0,
    directoryCallsByRoot,
    hashBytes: 0,
    gitProcesses: 0,
    writeCalls: 0,
  };
  const directoryRoot = (value) => {
    if (typeof value !== "string" && !Buffer.isBuffer(value)) return "outside";
    const absolute = path.resolve(String(value));
    const workspaceRelative = path.relative(process.cwd(), absolute);
    if (workspaceRelative === ".nx" || workspaceRelative.startsWith(`.nx${path.sep}`))
      return "nxCache";
    if (
      workspaceRelative === "agent_extensions" ||
      workspaceRelative.startsWith(`agent_extensions${path.sep}`)
    )
      return "extensions";
    if (
      workspaceRelative === ".claude" ||
      workspaceRelative.startsWith(`.claude${path.sep}`) ||
      workspaceRelative === ".agents" ||
      workspaceRelative.startsWith(`.agents${path.sep}`)
    )
      return "agentTargets";
    if (
      workspaceRelative === "" ||
      (!workspaceRelative.startsWith("..") && !path.isAbsolute(workspaceRelative))
    )
      return "workspaceOther";
    const home = process.env.AXM_USER_HOME;
    if (home) {
      const homeRelative = path.relative(home, absolute);
      if (homeRelative === "" || (!homeRelative.startsWith("..") && !path.isAbsolute(homeRelative)))
        return "userHome";
    }
    return "outside";
  };
  const count = (target, name, metric) => {
    const original = target[name];
    if (typeof original !== "function") return;
    target[name] = function (...args) {
      metrics[metric] += 1;
      if (metric === "directoryCalls") directoryCallsByRoot[directoryRoot(args[0])] += 1;
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
    try {
      fs.writeSync(3, JSON.stringify(metrics));
    } catch {
      // The diagnostic pipe may have closed when the benchmark stopped the child.
    }
  });
}
