import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import {
  comparePhysicalWork,
  locateStrace,
  physicalWorkComparisonDocument,
  physicalWorkConfiguration,
  physicalWorkDigest,
  projectPhysicalPath,
  reducePhysicalWork,
} from "../benchmarks/observability-physical-work.js";
import { runObservedProcess } from "../benchmarks/observability-process.js";

const fixtureRoot = "/tmp/axm-observability-AbC123";
const workspace = fixtureRoot + "/sample/workspace";
const home = fixtureRoot + "/sample/home";
const roots = [
  { token: "<ws>", directory: workspace },
  { token: "<home>", directory: home },
  { token: "<fixture>", directory: fixtureRoot },
  { token: "<account-home>", directory: "/home/someone" },
  { token: "<tmp>", directory: "/tmp" },
];
const context = { workingDirectory: workspace, roots };
const failure = <A>(effect: Effect.Effect<A, { readonly message: string }>) =>
  Effect.flip(effect).pipe(Effect.map(({ message }) => message));

describe("physical-work reduction", () => {
  it("joins split calls per process and counts each path's work once", () => {
    const W = workspace;
    const excerpt = String.raw`
101 openat(AT_FDCWD<${W}>, "axm.json", O_RDONLY|O_CLOEXEC <unfinished ...>
102 openat(AT_FDCWD<${W}>, "${W}/axm.lock", O_RDONLY|O_CLOEXEC) = 7<${W}/axm.lock>
101 <... openat resumed>) = 6<${W}/axm.json>
102 read(7<${W}/axm.lock>,  <unfinished ...>
101 read(6<${W}/axm.json>, "{\"a\":1}", 8192) = 7
102 <... read resumed>"{}", 8192) = 2
101 read(6<${W}/axm.json>, "", 8192) = 0
101 openat(AT_FDCWD<${W}>, "missing.json", O_RDONLY) = -1 ENOENT (No such file or directory)
101 openat(AT_FDCWD<${W}>, "${W}", O_RDONLY|O_CLOEXEC|O_PATH) = 8<${W}>
101 openat(AT_FDCWD<${W}>, "agent_extensions", O_RDONLY|O_CLOEXEC|O_DIRECTORY) = 9<${W}/agent_extensions>
103 getdents64(9<${W}/agent_extensions>,  <unfinished ...>
101 statx(8<${W}>, "", AT_STATX_SYNC_AS_STAT|AT_EMPTY_PATH, STATX_ALL, {stx_mask=STATX_ALL, stx_mode=S_IFDIR|0775, ...}) = 0
103 <... getdents64 resumed>0x7f00 /* 3 entries */, 32768) = 80
103 getdents64(9<${W}/agent_extensions>, 0x7f00 /* 0 entries */, 32768) = 0
104 openat(AT_FDCWD<${W}/sub>, "../axm.json.tmp.20c40.1.c00e6j", O_WRONLY|O_CREAT|O_EXCL, 0666) = 10<${W}/axm.json.tmp.20c40.1.c00e6j>
104 write(10<${W}/axm.json.tmp.20c40.1.c00e6j>, "{\"a\":2}", 7) = 7
104 rename("${W}/axm.json.tmp.20c40.1.c00e6j", "${W}/axm.json") = 0
104 renameat2(AT_FDCWD<${W}>, "a", AT_FDCWD<${W}>, "b", RENAME_NOREPLACE) = -1 EEXIST (File exists)
101 write(1<pipe:[4242]>, "{}\n", 3) = 3
101 unlinkat(11</tmp/axm-account-home-Xy9Zq1>, "8c66e7ecb46a.toml", 0) = 0
101 mkdir("/home/someone/.axm-runtime/0ae50844-bfe9-4883-95e1-06e25b048b3e", 0777) = -1 EEXIST (File exists)
101 readlink("/proc/self/fd/8", "/tmp/axm-observability-AbC123/sa"..., 4096) = 46
101 openat(AT_FDCWD<${W}>, "${fixtureRoot}/templates/typed/axm.json", O_RDONLY) = 12<${fixtureRoot}/templates/typed/axm.json>
101 copy_file_range(12<${fixtureRoot}/templates/typed/axm.json>, [0], 13<${home}/snap>, [0], 219, 0) = 219
101 access("${home}/.config", R_OK) = -1 ENOENT (No such file or directory)
101 stat("legacy/relative", 0x7ffc) = -1 ENOENT (No such file or directory)
101 openat(AT_FDCWD<${W}>, "a\76b \"c\" \303\251", O_RDONLY) = -1 ENOENT (No such file or directory)
101 symlinkat("target", 14<${W}/.axm-instructions-symlink-probe-vENnI0>, "link") = 0
101 --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=104, si_status=0} ---
105 newfstatat(AT_FDCWD<${W}>, "x",  <unfinished ...>
`;
    const reduction = reducePhysicalWork(excerpt.split("\n"), context);
    expect(reduction.paths).toEqual({
      "<account-home>/.axm-runtime/<uuid>": { mkdirCalls: 1 },
      "<fixture>/templates/typed/axm.json": { readOpens: 1, readCalls: 1, readBytes: 219 },
      "<home>/.config": { access: 1 },
      "<home>/snap": { writeCalls: 1, writeBytes: 219 },
      "<proc-fd>": { readlinks: 1 },
      "<tmp>/axm-account-home-<random>/<random>.toml": { removed: 1 },
      "<ws>": { pathOpens: 1, stats: 1 },
      "<ws>/.axm-instructions-symlink-probe-<random>/link": { linked: 1 },
      '<ws>/a>b "c" é': { openFailed: 1 },
      "<ws>/agent_extensions": { directoryOpens: 1, directoryReads: 1 },
      "<ws>/axm.json": { readOpens: 1, readCalls: 1, readBytes: 7, renamedTo: 1 },
      "<ws>/axm.json.tmp.<atomic>": { writeOpens: 1, writeCalls: 1, writeBytes: 7 },
      "<ws>/axm.lock": { readOpens: 1, readCalls: 1, readBytes: 2 },
      "<ws>/legacy/relative": { stats: 1 },
      "<ws>/missing.json": { openFailed: 1 },
      "<ws>/x": { stats: 1 },
    });
    expect(reduction.syscalls).toEqual({
      access: 1,
      copy_file_range: 1,
      getdents64: 2,
      mkdir: 1,
      newfstatat: 1,
      openat: 8,
      read: 3,
      readlink: 1,
      rename: 1,
      renameat2: 1,
      stat: 1,
      statx: 1,
      symlinkat: 1,
      unlinkat: 1,
      write: 2,
    });
    expect(reduction.accounting).toEqual({
      lines: 30,
      calls: 26,
      joinedResumptions: 3,
      unfinishedAtEnd: 1,
      unmatchedResumptions: 0,
      processEvents: 1,
      unparsedLines: 0,
      unresolvedPaths: 0,
      nonPathDescriptorCalls: 1,
    });
  });

  it("resolves relative paths against each process's own working directory", () => {
    const W = workspace;
    const clone = "/tmp/axm-source-commit-Ab12Cd";
    const discovery = "/tmp/axm-source-discovery-Qw3Er5";
    const excerpt = String.raw`
201 openat(AT_FDCWD<${W}>, "axm.json", O_RDONLY) = 3<${W}/axm.json>
202 openat(AT_FDCWD<${clone}>, ".git/objects/86", O_RDONLY|O_DIRECTORY) = 4<${clone}/.git/objects/86>
202 mkdir(".git/objects/ea", 0777) = 0
202 access(".git/config", R_OK) = 0
201 mkdir("vendor", 0777) = 0
203 access(".git/config", R_OK) = 0
203 chdir("${discovery}") = 0
203 mkdir("vendor", 0777 <unfinished ...>
201 stat("axm.lock", 0x7ffc) = 0
203 <... mkdir resumed>) = 0
203 chdir("vendor") = 0
203 stat("src", 0x7ffc) = -1 ENOENT (No such file or directory)
203 fchdir(5<${discovery}/vendor/bench-git>) = 0
203 unlink("index.lock") = 0
203 chdir("missing") = -1 ENOENT (No such file or directory)
203 rmdir("old") = 0
204 chdir("relative") = 0
204 link("a", "b") = 0
`;
    const reduction = reducePhysicalWork(excerpt.split("\n"), context);
    expect(reduction.paths).toEqual({
      "<tmp>/axm-source-commit-<random>/.git/config": { access: 1 },
      "<tmp>/axm-source-commit-<random>/.git/objects/<fanout>": {
        directoryOpens: 1,
        mkdirCalls: 1,
      },
      "<tmp>/axm-source-discovery-<random>/vendor": { mkdirCalls: 1 },
      "<tmp>/axm-source-discovery-<random>/vendor/bench-git/index.lock": { removed: 1 },
      "<tmp>/axm-source-discovery-<random>/vendor/bench-git/old": { removed: 1 },
      "<tmp>/axm-source-discovery-<random>/vendor/src": { stats: 1 },
      "<ws>/axm.json": { readOpens: 1 },
      "<ws>/axm.lock": { stats: 1 },
      "<ws>/vendor": { mkdirCalls: 1 },
    });
    // Process 203's first access and process 204's link precede any observed
    // working directory, so they are unresolved rather than charged to <ws>.
    expect(reduction.accounting).toMatchObject({ unresolvedPaths: 2, joinedResumptions: 1 });
    expect(reduction.syscalls).toMatchObject({ chdir: 4, fchdir: 1 });
  });

  it("accounts for resumptions without a start and unrecognized lines instead of dropping them", () => {
    const reduction = reducePhysicalWork(
      [
        "7 <... read resumed>) = 1",
        '8 openat(AT_FDCWD, "a" <unfinished ...>',
        "8 <... statx resumed>) = 0",
        "not a strace line",
        '9 read(3, "x", 1) = 1',
      ],
      context,
    );
    expect(reduction.accounting).toMatchObject({
      calls: 2,
      unmatchedResumptions: 2,
      unparsedLines: 1,
      unfinishedAtEnd: 0,
    });
    // The interrupted open has no result, so it is neither a success nor a failure.
    expect(reduction.syscalls).toEqual({ openat: 1, read: 1 });
    expect(reduction.paths).toEqual({});
  });

  it("projects fixture, account and temporary roots and per-invocation names to stable tokens", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      [workspace + "/axm.json", "<ws>/axm.json"],
      [home + "/.cache/axm", "<home>/.cache/axm"],
      [fixtureRoot + "/templates/typed", "<fixture>/templates/typed"],
      [fixtureRoot, "<fixture>"],
      ["/tmp/axm-observability-AbC123x/other", "<tmp>/axm-observability-AbC123x/other"],
      [
        "/home/someone/.axm-runtime/physical-boundaries/0AE50844-bfe9-4883-95e1-06e25b048b3e.tmp",
        "<account-home>/.axm-runtime/physical-boundaries/<uuid>.tmp",
      ],
      ["/home/someoneelse/x", "/home/someoneelse/x"],
      [
        "/tmp/axm-registry-package-Pwj4wy/skill.json",
        "<tmp>/axm-registry-package-<random>/skill.json",
      ],
      [workspace + "/.axm-retired-wjnLz3", "<ws>/.axm-retired-<random>"],
      [workspace + "/.axm-backup", "<ws>/.axm-backup"],
      [workspace + "/bench-member", "<ws>/bench-member"],
      [workspace + "/x/.publication-ZotsAK/owner.json", "<ws>/x/.publication-<random>/owner.json"],
      [workspace + "/.agents/axm.json.tmp.20c40.1.c00e6j", "<ws>/.agents/axm.json.tmp.<atomic>"],
      [workspace + "/axm.lock.tmp.29s5p.a.16amo", "<ws>/axm.lock.tmp.<atomic>"],
      [
        "/tmp/axm-account-home-RhSqkp/82ec8d2e7738.toml",
        "<tmp>/axm-account-home-<random>/<random>.toml",
      ],
      [workspace + "/82ec8d2e7738.toml", "<ws>/82ec8d2e7738.toml"],
      [
        "/tmp/axm-source-commit-BmeGY4/.git/objects/86/ee60482235f413cd4b924285a33e73b006a562",
        "<tmp>/axm-source-commit-<random>/.git/objects/<fanout>/<object>",
      ],
      [
        "/tmp/r/.git/objects/pack/pack-257e9e07cef004b507b207fda589479b732cb704.pack",
        "<tmp>/r/.git/objects/pack/pack-<hash>.pack",
      ],
      ["/tmp/r/.git/objects/pack/tmp_idx_dkJbUf", "<tmp>/r/.git/objects/pack/tmp_idx_<random>"],
      [
        "/tmp/axm-source-commit-dBVV8A/.git/tQOMsnn",
        "<tmp>/axm-source-commit-<random>/.git/t<random>",
      ],
      [workspace + "/.git/config", "<ws>/.git/config"],
      [workspace + "/src/tQOMsnn", "<ws>/src/tQOMsnn"],
      ["/proc/self/fd/12", "<proc-fd>"],
      ["/proc/4242/fd/3", "<proc-fd>"],
      ["/proc/4242/fd", "/proc/<pid>/fd"],
      ["/proc/self/task/77/stat", "/proc/<pid>/stat"],
      ["/proc/4242/statm", "/proc/<pid>/statm"],
      ["/proc/sys/vm/overcommit_memory", "/proc/sys/vm/overcommit_memory"],
      ["/usr/lib/x86_64-linux-gnu/libc.so.6", "/usr/lib/x86_64-linux-gnu/libc.so.6"],
    ];
    expect(cases.map(([absolute]) => projectPhysicalPath(absolute, roots))).toEqual(
      cases.map(([, projected]) => projected),
    );
  });
});

describe("physical-work comparison", () => {
  const baseline = {
    syscalls: { openat: 4, read: 2 },
    paths: {
      "<ws>/axm.json": { readOpens: 3, readCalls: 2, readBytes: 10 },
      "<ws>/axm.lock": { readOpens: 1 },
    },
  };

  it("lists every differing path counter and syscall total in a deterministic order", () => {
    const candidate = {
      syscalls: { openat: 2, read: 2, statx: 1 },
      paths: {
        "<ws>/axm.json": { readOpens: 1, readCalls: 2, readBytes: 10, stats: 1 },
        "<ws>/.axm": { mkdirCalls: 1 },
      },
    };
    expect(comparePhysicalWork(baseline, candidate)).toEqual({
      differences: [
        { path: "<ws>/.axm", counter: "mkdirCalls", baseline: 0, candidate: 1 },
        { path: "<ws>/axm.json", counter: "readOpens", baseline: 3, candidate: 1 },
        { path: "<ws>/axm.json", counter: "stats", baseline: 0, candidate: 1 },
        { path: "<ws>/axm.lock", counter: "readOpens", baseline: 1, candidate: 0 },
      ],
      syscallDifferences: [
        { syscall: "openat", baseline: 4, candidate: 2 },
        { syscall: "statx", baseline: 0, candidate: 1 },
      ],
    });
    expect(physicalWorkDigest(candidate)).not.toBe(physicalWorkDigest(baseline));
  });

  it("reports identical reductions as no differences and summarizes scenarios without a verdict", () => {
    const same = structuredClone(baseline);
    expect(physicalWorkDigest(same)).toBe(physicalWorkDigest(baseline));
    const record = (sample: string, reduction: typeof baseline) => ({
      sample,
      reductionSha256: physicalWorkDigest(reduction),
      reduction,
    });
    const changed = { ...baseline, syscalls: { openat: 5, read: 2 } };
    const document = physicalWorkComparisonDocument([
      {
        scenario: "z/changed",
        baseline: record("b/z", baseline),
        candidate: record("c/z", changed),
      },
      { scenario: "a/same", baseline: record("b/a", baseline), candidate: record("c/a", same) },
    ]);
    expect(document.scenarios.map((entry) => entry.scenario)).toEqual(["a/same", "z/changed"]);
    expect(document.scenarios[0]).toEqual({
      scenario: "a/same",
      baseline: { sample: "b/a", reductionSha256: physicalWorkDigest(baseline) },
      candidate: { sample: "c/a", reductionSha256: physicalWorkDigest(baseline) },
      differences: [],
      syscallDifferences: [],
    });
    expect(document.scenarios[1]?.syscallDifferences).toEqual([
      { syscall: "openat", baseline: 4, candidate: 5 },
    ]);
    expect(document.summary).toEqual({ scenariosCaptured: 2, scenariosWithDifferences: 1 });
    expect(Object.keys(document)).not.toContain("passed");
  });
});

describe("physical-work configuration", () => {
  it.effect("is inert when unset and refuses other values, measure mode and other hosts", () =>
    Effect.gen(function* () {
      for (const runMode of ["fixtures", "measure", "compare"] as const)
        for (const platform of ["linux", "darwin"] as const)
          expect(
            yield* physicalWorkConfiguration({ value: undefined, runMode, platform }),
          ).toBeUndefined();
      for (const runMode of ["fixtures", "compare"] as const)
        expect(
          yield* physicalWorkConfiguration({ value: "strace", runMode, platform: "linux" }),
        ).toBe("strace");
      expect(
        yield* failure(
          physicalWorkConfiguration({ value: "strace", runMode: "measure", platform: "linux" }),
        ),
      ).toMatch(/refused in measure mode/);
      expect(
        yield* failure(
          physicalWorkConfiguration({ value: "strace", runMode: "fixtures", platform: "darwin" }),
        ),
      ).toMatch(/requires Linux/);
      for (const value of ["", "1", "STRACE", "perf"])
        expect(
          yield* failure(
            physicalWorkConfiguration({ value, runMode: "fixtures", platform: "linux" }),
          ),
        ).toMatch(/^AXM_OBSERVABILITY_PHYSICAL_WORK must be strace or unset/);
    }),
  );

  it.effect(
    "fails configuration when strace is absent or cannot run, and records its version",
    () =>
      Effect.gen(function* () {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-physical-work-test-"));
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => fs.rmSync(directory, { recursive: true, force: true })),
        );
        const broken = path.join(directory, "broken");
        const rejecting = path.join(directory, "rejecting");
        const working = path.join(directory, "working");
        fs.mkdirSync(broken);
        fs.mkdirSync(rejecting);
        fs.mkdirSync(working);
        fs.writeFileSync(path.join(broken, "strace"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
        // Reports a version but refuses the capture prefix, as an older strace
        // does for an unknown syscall name or a host does when ptrace is denied.
        fs.writeFileSync(
          path.join(rejecting, "strace"),
          [
            "#!/bin/sh",
            'if [ "$1" = -V ]; then echo "strace -- version 5.10"; exit 0; fi',
            "echo \"strace: invalid system call 'fchmodat2'\" >&2",
            "exit 1",
            "",
          ].join("\n"),
          { mode: 0o755 },
        );
        fs.writeFileSync(
          path.join(working, "strace"),
          "#!/bin/sh\necho 'strace -- version 9.9'\n",
          {
            mode: 0o755,
          },
        );
        expect(yield* failure(locateStrace(directory))).toMatch(/strace was not found on PATH/);
        expect(yield* failure(locateStrace(broken))).toMatch(
          /^AXM_OBSERVABILITY_PHYSICAL_WORK=strace requires an executable strace/,
        );
        expect(yield* failure(locateStrace(rejecting))).toMatch(
          /^AXM_OBSERVABILITY_PHYSICAL_WORK=strace requires an executable strace: .* -f -qq -y -e trace=.* exited with 1: strace: invalid system call 'fchmodat2'$/s,
        );
        expect(yield* locateStrace(["relative", working].join(path.delimiter))).toEqual({
          executable: path.join(working, "strace"),
          version: "strace -- version 9.9",
        });
      }).pipe(Effect.scoped),
  );

  // A command prefix substitutes for strace here; the fixtures smoke run is the
  // evidence that strace itself leaves product output and exit status unchanged.
  // The default case runs inside the /usr/bin/time elapsed/RSS wrapper, as the
  // capture does; the benchmark already requires that wrapper on Linux.
  for (const measureRss of [undefined, false] as const)
    it.effect(
      "runs a command prefix before the executable without changing its output or exit" +
        (measureRss === false ? " (no RSS wrapper)" : " (inside the RSS wrapper)"),
      () =>
        Effect.gen(function* () {
          const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-physical-work-prefix-"));
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => fs.rmSync(directory, { recursive: true, force: true })),
          );
          const observed = yield* runObservedProcess({
            executable: process.execPath,
            args: [
              "-e",
              "process.stdout.write('out:' + process.env.PREFIXED); process.stderr.write('err'); process.exit(3)",
            ],
            cwd: directory,
            environment: { PATH: process.env["PATH"] },
            artifacts: directory,
            ...(measureRss === undefined ? {} : { measureRss }),
            prefix: ["env", "PREFIXED=yes"],
          });
          expect(observed).toMatchObject({ exitCode: 3, stdout: "out:yes", stderr: "err" });
          if (measureRss === false) expect(observed.peakRssBytes).toBe(0);
          else expect(observed.peakRssBytes).toBeGreaterThan(0);
        }).pipe(Effect.scoped),
    );
});
