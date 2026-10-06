import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repository = resolve(import.meta.dirname, "..");
const fixtures: string[] = [];
const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !name.startsWith("GIT_") && !name.startsWith("NX_"),
  ),
);

const run = (root: string, command: string, args: string[], extra: Record<string, string> = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...environment,
      NX_DAEMON: "false",
      NX_ISOLATE_PLUGINS: "false",
      CHECK_LOG: `${root}/checks.log`,
      PATH: `${root}/bin:${process.env["PATH"]}`,
      ...extra,
    },
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
};

const git = (root: string, ...args: string[]) => {
  const result = run(root, "git", args);
  if (result.status !== 0) throw new Error(result.output);
  return result.output;
};

const write = (root: string, file: string, content: string) =>
  writeFileSync(join(root, file), content);
const value = (type: "string" | "number") =>
  `export const value: ${type} = ${type === "string" ? '"valid"' : "123"};\n`;
const stage = (root: string, file: string, content: string) => {
  write(root, file, content);
  git(root, "add", "--", file);
};
const check = (root: string, extra: Record<string, string> = {}) =>
  run(root, "bash", [".husky/pre-commit"], extra);
const log = (root: string) => readFileSync(join(root, "checks.log"), "utf8");

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "staged-typecheck-"));
  fixtures.push(root);
  for (const dir of ["scripts", ".husky", "bin", "producer", "consumer", "unrelated"])
    mkdirSync(join(root, dir));
  for (const file of [
    "scripts/check-staged.sh",
    "scripts/check-staged.config.mjs",
    ".husky/pre-commit",
  ])
    copyFileSync(join(repository, file), join(root, file));
  chmodSync(join(root, ".husky/pre-commit"), 0o755);
  // These are foreign-host adapters in a synthetic workspace. Nx, Git,
  // lint-staged, and the compiler stay real; unrelated repository gates have
  // controllable exit codes instead of requiring providers or the whole repo.
  writeFileSync(
    join(root, "bin/pnpm"),
    `#!/usr/bin/env bash
set -euo pipefail
while [[ "\${1:-}" == --config.* ]]; do shift; done
if [[ "$1" == install ]]; then
  if [[ "\${FAIL_GATE:-}" == install ]]; then exit 23; fi
  ln -s '${repository}/node_modules' node_modules; exit 0
fi
if [[ "$1 \${2:-}" == 'exec lint-staged' ]]; then
  shift 2
  if [[ "\${FAIL_GATE:-}" == fixes && " $* " == *' --no-stash '* ]]; then exit 23; fi
  exec node '${repository}/node_modules/lint-staged/bin/lint-staged.js' "$@"
fi
if [[ "$1 \${2:-}" == 'exec nx' && "\${3:-}" == affected ]]; then
  shift 2
  set +e
  node '${repository}/node_modules/nx/dist/bin/nx.js' "$@" > nx.log 2>&1
  result=$?
  cat nx.log >> "\${CHECK_LOG}"
  cat nx.log
  exit "$result"
fi
printf '%s\\n' "$*" >> "\${CHECK_LOG}"
if [[ -n "\${FAIL_GATE:-}" && "$*" == *"$FAIL_GATE"* ]]; then exit 23; fi
`,
    { mode: 0o755 },
  );
  write(root, ".gitignore", "node_modules\n.nx/\nchecks.log\nnx.log\n");
  write(
    root,
    "package.json",
    JSON.stringify({
      name: "fixture",
      private: true,
      type: "module",
      "lint-staged": { "*.ts": "node scripts/fix.mjs" },
    }),
  );
  write(
    root,
    "scripts/fix.mjs",
    `import { readFileSync, writeFileSync } from 'node:fs';\nfor (const file of process.argv.slice(2)) writeFileSync(file, readFileSync(file, 'utf8').replace('"AUTO_FIX"', '"valid"'));\n`,
  );
  write(
    root,
    "nx.json",
    JSON.stringify({
      defaultBase: "missing-branch",
      plugins: [],
      namedInputs: { default: ["{projectRoot}/**/*"] },
    }),
  );
  for (const name of ["producer", "consumer", "unrelated"]) {
    write(
      root,
      `${name}/project.json`,
      JSON.stringify({
        name,
        ...(name === "consumer" ? { implicitDependencies: ["producer"] } : {}),
        targets: {
          typecheck: {
            executor: "nx:run-commands",
            cache: true,
            inputs: ["default", "^default"],
            outputs: [],
            options: {
              command: `'${repository}/node_modules/.bin/tsc' -p ${name}/tsconfig.json --noEmit`,
            },
          },
        },
      }),
    );
    write(
      root,
      `${name}/tsconfig.json`,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ES2023",
          module: "NodeNext",
          types: [],
          skipLibCheck: true,
        },
        include: ["*.ts"],
      }),
    );
  }
  write(root, "producer/value.ts", 'export const value: string = "initial";\n');
  write(root, "producer/other.ts", "export const other = true;\n");
  write(
    root,
    "consumer/use.ts",
    'import { value } from "../producer/value.js";\nconst message: string = value;\n',
  );
  write(root, "unrelated/other.ts", "export const other = true;\n");
  // lint-staged prepends local binaries to PATH. Keep the gate adapter there
  // too, so a pnpm binary in the host installation cannot shadow the fixture.
  mkdirSync(join(root, "node_modules"));
  symlinkSync(join(root, "bin"), join(root, "node_modules/.bin"), "dir");
  for (const dependency of ["lint-staged", "nx"])
    symlinkSync(
      join(repository, "node_modules", dependency),
      join(root, "node_modules", dependency),
      "dir",
    );
  git(root, "init", "-q");
  git(root, "config", "user.name", "Hook regression");
  git(root, "config", "user.email", "hook-test@example.invalid");
  git(root, "add", ".");
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "Fixture baseline");
  return root;
};

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("staged compiler gate", () => {
  it("selects an unchanged consumer, invalidates its cached verdict, and excludes unrelated projects", () => {
    const root = fixture();
    stage(root, "producer/value.ts", 'export const value: string = "AUTO_FIX";\n');
    const valid = check(root, { NX_BASE: "not-a-base", NX_HEAD: "not-a-head" });
    expect(valid.status, valid.output).toBe(0);
    expect(git(root, "show", ":producer/value.ts")).toBe(value("string"));
    expect(log(root)).toContain("consumer:typecheck");
    expect(log(root)).not.toContain("unrelated:typecheck");
    expect(check(root).status).toBe(0);
    expect(log(root)).toMatch(/read the output from the cache|existing outputs match the cache/u);
    stage(root, "producer/value.ts", value("number"));
    const result = check(root);
    expect(result.status, result.output + log(root)).not.toBe(0);
    expect(result.output).toContain("consumer");
    expect(result.output).toContain("not assignable to type 'string'");
  }, 20_000);

  it("fails for an invalid index even when unstaged producer and consumer edits would repair it", () => {
    const root = fixture();
    stage(root, "producer/value.ts", value("number"));
    write(root, "producer/value.ts", value("string"));
    write(root, "consumer/use.ts", "export const repaired = true;\n");
    write(root, "consumer/extra.ts", "export const untracked = true;\n");
    const before = git(root, "status", "--porcelain=v1");
    const result = check(root);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("not assignable to type 'string'");
    expect(git(root, "show", ":producer/value.ts")).toBe(value("number"));
    expect(readFileSync(join(root, "producer/value.ts"), "utf8")).toBe(value("string"));
    expect(readFileSync(join(root, "consumer/use.ts"), "utf8")).toContain("repaired");
    expect(readFileSync(join(root, "consumer/extra.ts"), "utf8")).toContain("untracked");
    expect(git(root, "status", "--porcelain=v1")).toBe(before);
    expect(git(root, "stash", "list")).toBe("");
  });

  it("passes a valid index with broken unstaged, partially staged, and untracked sources, restoring them", () => {
    const root = fixture();
    stage(root, "producer/value.ts", 'export const value: string = "AUTO_FIX";\n');
    write(
      root,
      "producer/value.ts",
      'export const value: string = "AUTO_FIX";\nconst broken: number = "unstaged";\n',
    );
    write(root, "consumer/use.ts", 'const broken: number = "unstaged consumer";\n');
    write(root, "consumer/extra.ts", 'const broken: number = "untracked";\n');
    const valid = check(root);
    expect(valid.status, valid.output).toBe(0);
    expect(git(root, "show", ":producer/value.ts")).toBe(value("string"));
    expect(readFileSync(join(root, "producer/value.ts"), "utf8")).toContain('"unstaged"');
    expect(readFileSync(join(root, "consumer/use.ts"), "utf8")).toContain("unstaged consumer");
    expect(readFileSync(join(root, "consumer/extra.ts"), "utf8")).toContain("untracked");
    expect(git(root, "stash", "list")).toBe("");
  });

  it("checks a deletion-only commit against the index even if the deleted file exists unstaged", () => {
    const root = fixture();
    git(root, "rm", "producer/value.ts");
    write(root, "producer/value.ts", value("string"));
    const result = check(root);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("Cannot find module");
    expect(readFileSync(join(root, "producer/value.ts"), "utf8")).toBe(value("string"));
    expect(git(root, "diff", "--cached", "--name-status")).toContain("D\tproducer/value.ts");
  });

  it("includes both sides of a cross-project rename and accepts a coherent addition", () => {
    const root = fixture();
    git(root, "mv", "producer/value.ts", "unrelated/moved.ts");
    expect(check(root).status).not.toBe(0);
    expect(log(root)).toContain("consumer:typecheck");
    expect(log(root)).toContain("unrelated:typecheck");
    stage(
      root,
      "consumer/use.ts",
      'import { value } from "../unrelated/moved.js";\nconst message: string = value;\n',
    );
    stage(root, "consumer/added.ts", "export const added = true;\n");
    const valid = check(root);
    expect(valid.status, valid.output).toBe(0);
  });

  it("uses staged root configuration and excludes unstaged dependency-manifest changes", () => {
    const root = fixture();
    const config = {
      defaultBase: "missing-branch",
      plugins: [],
      namedInputs: { default: ["{projectRoot}/**/*", "{workspaceRoot}/compiler-policy.json"] },
    };
    stage(root, "nx.json", JSON.stringify(config));
    stage(root, "compiler-policy.json", "{}\n");
    write(root, "package.json", "invalid unstaged JSON\n");
    const result = check(root);
    expect(result.status, result.output).toBe(0);
    expect(log(root)).toContain("producer:typecheck");
    expect(log(root)).toContain("consumer:typecheck");
    expect(log(root)).toContain("unrelated:typecheck");
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain("invalid unstaged");
  });

  it("accepts staged package metadata changes and selects dependent consumers", () => {
    const root = fixture();
    stage(
      root,
      "producer/package.json",
      JSON.stringify({
        name: "producer",
        private: true,
        type: "module",
        dependencies: { example: "1.0.0" },
      }),
    );
    const result = check(root);
    expect(result.status, result.output).toBe(0);
    expect(log(root)).toContain("producer:typecheck");
    expect(log(root)).toContain("consumer:typecheck");
  });

  it("rejects newline filenames without weakening the selection protocol", () => {
    const root = fixture();
    stage(root, "producer/new\nfile.ts", "export const added = true;\n");
    const result = check(root);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("filename containing a newline");
  });

  it("validates a pathspec commit temporary index and preserves other staged changes", () => {
    const root = fixture();
    stage(root, "consumer/use.ts", 'const broken: number = "staged for another commit";\n');
    write(root, "producer/value.ts", value("string"));
    const result = run(root, "git", [
      "-c",
      "core.hooksPath=.husky",
      "commit",
      "--only",
      "producer/value.ts",
      "-m",
      "Producer update",
    ]);
    expect(result.status, result.output).toBe(0);
    expect(git(root, "show", "HEAD:producer/value.ts")).toBe(value("string"));
    expect(git(root, "show", ":consumer/use.ts")).toContain("staged for another commit");
    expect(git(root, "show", "HEAD:consumer/use.ts")).toContain("const message: string = value");
  });

  it("blocks a compiler failure from committing and removes its disposable worktree", () => {
    const root = fixture();
    stage(root, "producer/value.ts", value("number"));
    const result = run(root, "git", [
      "-c",
      "core.hooksPath=.husky",
      "commit",
      "-m",
      "Incompatible producer",
    ]);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("not assignable to type 'string'");
    expect(git(root, "log", "-1", "--format=%s").trim()).toBe("Fixture baseline");
    expect(git(root, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  });

  it("selects projects after a compiler configuration change", () => {
    const root = fixture();
    stage(
      root,
      "consumer/tsconfig.json",
      JSON.stringify({ compilerOptions: { types: [], noUnusedLocals: true }, include: ["*.ts"] }),
    );
    const result = check(root);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("never read");
  });

  it.each(["fixes", "install", "axm:local lint", "scan-secrets:staged"])(
    "stops a commit after the %s gate fails and restores unstaged work",
    (gate) => {
      const root = fixture();
      stage(root, "producer/value.ts", 'export const value: string = "AUTO_FIX";\n');
      write(root, "consumer/extra.ts", "export const untracked = true;\n");
      const before = git(root, "status", "--porcelain=v1");
      const result = run(
        root,
        "git",
        ["-c", "core.hooksPath=.husky", "commit", "-m", "Candidate"],
        { FAIL_GATE: gate },
      );
      expect(result.status, result.output).not.toBe(0);
      expect(git(root, "log", "-1", "--format=%s").trim()).toBe("Fixture baseline");
      expect(git(root, "show", ":producer/value.ts")).toBe(
        gate === "fixes" ? 'export const value: string = "AUTO_FIX";\n' : value("string"),
      );
      expect(git(root, "status", "--porcelain=v1")).toBe(before);
      expect(git(root, "stash", "list")).toBe("");
    },
  );
});
