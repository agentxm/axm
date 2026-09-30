import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { startBoundaryClaimProcess } from "./test-support/boundary-claim-process.js";

export const specification = defineSpecification({
  requirement: "workspace/locations/authorities-refuse-overlapping-physical-boundaries",
  title: "Active workspace authorities refuse overlapping physical mutation boundaries",
  statement:
    "Within a shared OS-principal coordination domain, AXM shall refuse a distinct active workspace authority before reading or mutating an overlapping physical boundary, including aliases and either parent/child admission order; retain exclusion through rollback; and allow unrelated boundaries to proceed independently.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Independent Node processes hold the published transaction and shared-file write boundary while another authority attempts a physically overlapping or independent write.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const fixture = () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-boundary-claims-")));
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  const owner = (name: string) => {
    const directory = path.join(root, name);
    fs.mkdirSync(path.join(directory, ".axm"), { recursive: true });
    fs.writeFileSync(path.join(directory, "axm.json"), "original settings");
    return directory;
  };
  const firstOwner = owner("first");
  const secondOwner = owner("second");
  const shared = path.join(root, "shared");
  const directory = path.join(shared, "vendor");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "config.json");
  fs.writeFileSync(file, "original");
  const namespace = path.join(root, "runtime");
  const start = (options: Parameters<typeof startBoundaryClaimProcess>[0]) => {
    const worker = startBoundaryClaimProcess(options);
    cleanups.push(worker.stop);
    return worker;
  };
  return { root, firstOwner, secondOwner, shared, directory, file, namespace, start };
};

for (const overlap of ["same file through alias", "parent first", "child first"] as const) {
  it(`refuses ${overlap} before decision read and restores earlier independent writes`, async () => {
    const f = fixture();
    const alias = path.join(f.root, "alias");
    fs.symlinkSync(f.directory, alias, "junction");
    const firstTarget = overlap === "parent first" ? f.directory : f.file;
    const secondTarget =
      overlap === "child first"
        ? f.directory
        : overlap === "same file through alias"
          ? path.join(alias, "config.json")
          : f.file;
    const first = f.start({
      owner: f.firstOwner,
      namespace: f.namespace,
      nativeRoot: f.shared,
      target: firstTarget,
      file: f.file,
      label: "first",
      hold: true,
    });
    await first.waitFor("written");
    const second = f.start({
      owner: f.secondOwner,
      namespace: f.namespace,
      nativeRoot: overlap === "same file through alias" ? alias : f.directory,
      target: secondTarget,
      file: f.file,
      label: "second",
    });
    await second.waitFor("refused");
    expect(await second.completion).toBe(0);
    expect(second.events).not.toContain("read-entered");
    expect(second.events).toContain("conflict:overlap");
    expect(fs.readFileSync(f.file, "utf8")).toBe("first");
    expect(fs.readFileSync(path.join(f.secondOwner, "axm.json"), "utf8")).toBe("original settings");
    first.release();
    await first.waitFor("committed");
    expect(await first.completion).toBe(0);
    expect(fs.existsSync(path.join(f.namespace, "active.json"))).toBe(false);
    const retry = f.start({
      owner: f.secondOwner,
      namespace: f.namespace,
      nativeRoot: f.directory,
      target: f.file,
      file: f.file,
      label: "retry",
    });
    await retry.waitFor("committed");
    expect(await retry.completion).toBe(0);
    expect(fs.readFileSync(f.file, "utf8")).toBe("retry");
  });
}

describe("claim lifetime and independence", () => {
  it("admits a sibling file while another authority remains held", async () => {
    const f = fixture();
    const sibling = path.join(f.directory, "sibling.json");
    fs.writeFileSync(sibling, "original sibling");
    const first = f.start({
      owner: f.firstOwner,
      namespace: f.namespace,
      nativeRoot: f.shared,
      target: f.file,
      file: f.file,
      label: "first",
      hold: true,
    });
    await first.waitFor("written");
    const second = f.start({
      owner: f.secondOwner,
      namespace: f.namespace,
      nativeRoot: f.directory,
      target: sibling,
      file: sibling,
      label: "second",
    });
    await second.waitFor("committed");
    expect(await second.completion).toBe(0);
    expect(first.events).not.toContain("closed");
    expect(fs.readFileSync(sibling, "utf8")).toBe("second");
    first.release();
    await first.waitFor("committed");
    expect(await first.completion).toBe(0);
  });

  it("keeps claims while rollback is held and releases only after exact restoration", async () => {
    const f = fixture();
    const first = f.start({
      owner: f.firstOwner,
      namespace: f.namespace,
      nativeRoot: f.shared,
      target: f.file,
      file: f.file,
      label: "first",
      fail: true,
      holdRollback: true,
    });
    await first.waitFor("restoring");
    const second = f.start({
      owner: f.secondOwner,
      namespace: f.namespace,
      nativeRoot: f.directory,
      target: f.file,
      file: f.file,
      label: "second",
    });
    await second.waitFor("refused");
    expect(await second.completion).toBe(0);
    expect(second.events).not.toContain("read-entered");
    expect(fs.readFileSync(f.file, "utf8")).toBe("first");
    first.restore();
    await first.waitFor("refused");
    expect(await first.completion).toBe(0);
    expect(fs.readFileSync(f.file, "utf8")).toBe("original");
    expect(fs.readFileSync(path.join(f.firstOwner, "axm.json"), "utf8")).toBe("original settings");
    expect(fs.existsSync(path.join(f.namespace, "active.json"))).toBe(false);
  });

  it("refuses malformed coordination metadata before settings or native mutation", async () => {
    const f = fixture();
    fs.mkdirSync(f.namespace);
    fs.writeFileSync(path.join(f.namespace, "active.json"), "{broken");
    const worker = f.start({
      owner: f.firstOwner,
      namespace: f.namespace,
      nativeRoot: f.shared,
      target: f.file,
      file: f.file,
      label: "changed",
    });
    await worker.waitFor("refused");
    expect(await worker.completion).toBe(0);
    expect(worker.events).not.toContain("read-entered");
    expect(fs.readFileSync(f.file, "utf8")).toBe("original");
    expect(fs.readFileSync(path.join(f.firstOwner, "axm.json"), "utf8")).toBe("original settings");
    expect(fs.readFileSync(path.join(f.namespace, "active.json"), "utf8")).toBe("{broken");
  });
});

for (const corruption of ["missing table", "uncertain lease holder"] as const) {
  it(`fails closed for ${corruption} while another process holds a claim`, async () => {
    const f = fixture();
    const first = f.start({
      owner: f.firstOwner,
      namespace: f.namespace,
      nativeRoot: f.shared,
      target: f.file,
      file: f.file,
      label: "first",
      hold: true,
    });
    await first.waitFor("written");
    const tokens = fs.readdirSync(path.join(f.namespace, "leases"));
    expect(tokens).toHaveLength(1);
    const token = tokens[0];
    if (token === undefined) throw new Error("Missing active lease");
    const metadata =
      corruption === "missing table"
        ? path.join(f.namespace, "active.json")
        : path.join(
            f.namespace,
            "leases",
            token,
            "tmp",
            "workspace-transition.lock",
            "holder.json",
          );
    const original = fs.readFileSync(metadata, "utf8");
    if (corruption === "missing table") fs.rmSync(metadata);
    else fs.writeFileSync(metadata, "{}");
    const second = f.start({
      owner: f.secondOwner,
      namespace: f.namespace,
      nativeRoot: f.directory,
      target: f.file,
      file: f.file,
      label: "second",
    });
    await second.waitFor("refused");
    expect(await second.completion).toBe(0);
    expect(second.events).not.toContain("read-entered");
    expect(fs.readFileSync(f.file, "utf8")).toBe("first");
    fs.writeFileSync(metadata, original);
    first.release();
    await first.waitFor("committed");
    expect(await first.completion).toBe(0);
  });
}

it("reclaims a crashed invocation only after its physical lease is stale and acquired", async () => {
  const f = fixture();
  const first = f.start({
    owner: f.firstOwner,
    namespace: f.namespace,
    nativeRoot: f.shared,
    target: f.file,
    file: f.file,
    label: "first",
    hold: true,
  });
  await first.waitFor("written");
  const token = fs.readdirSync(path.join(f.namespace, "leases"))[0];
  if (token === undefined) throw new Error("Missing active lease");
  first.stop();
  await first.completion;
  // Model an expired library lease after confirmed process death; no PID inference admits it.
  const lease = path.join(f.namespace, "leases", token, "tmp", "workspace-transition.lock");
  fs.utimesSync(lease, new Date(0), new Date(0));
  const second = f.start({
    owner: f.secondOwner,
    namespace: f.namespace,
    nativeRoot: f.directory,
    target: f.file,
    file: f.file,
    label: "second",
  });
  await second.waitFor("committed");
  expect(await second.completion).toBe(0);
  expect(fs.readFileSync(f.file, "utf8")).toBe("second");
  expect(fs.existsSync(path.join(f.namespace, "active.json"))).toBe(false);
});

it("stops a compromised claim owner without restoring over a possible successor", async () => {
  const f = fixture();
  const first = f.start({
    owner: f.firstOwner,
    namespace: f.namespace,
    nativeRoot: f.shared,
    target: f.file,
    file: f.file,
    label: "first",
    hold: true,
  });
  await first.waitFor("written");
  const token = fs.readdirSync(path.join(f.namespace, "leases"))[0];
  if (token === undefined) throw new Error("Missing active lease");
  fs.rmSync(path.join(f.namespace, "leases", token, "tmp", "workspace-transition.lock"), {
    recursive: true,
  });
  fs.writeFileSync(f.file, "successor");
  await first.waitFor("retained");
  expect(await first.completion).toBe(0);
  expect(fs.readFileSync(f.file, "utf8")).toBe("successor");
  const second = f.start({
    owner: f.secondOwner,
    namespace: f.namespace,
    nativeRoot: f.directory,
    target: f.file,
    file: f.file,
    label: "second",
  });
  await second.waitFor("committed");
  expect(await second.completion).toBe(0);
  expect(fs.readFileSync(f.file, "utf8")).toBe("second");
}, 15000);

const uncertainSpellings = [
  { label: "case", first: "Future.json", second: "future.json" },
  { label: "Unicode normalization", first: "caf\u00e9.json", second: "cafe\u0301.json" },
  { label: "Unicode sigma case closure", first: "\u03c3.json", second: "\u03c2.json" },
  { label: "Unicode sharp-S case closure", first: "\u00df.json", second: "ss.json" },
] as const;

for (const spelling of uncertainSpellings) {
  it(`refuses uncertain ${spelling.label} overlap while future entries remain absent`, async () => {
    const f = fixture();
    const upper = path.join(f.directory, spelling.first);
    const lower = path.join(f.directory, spelling.second);
    const first = f.start({
      owner: f.firstOwner,
      namespace: f.namespace,
      nativeRoot: f.shared,
      target: upper,
      file: upper,
      label: "first",
      holdBeforeWrite: true,
    });
    await first.waitFor("claimed");
    expect(fs.existsSync(upper)).toBe(false);
    const second = f.start({
      owner: f.secondOwner,
      namespace: f.namespace,
      nativeRoot: f.directory,
      target: lower,
      file: lower,
      label: "second",
    });
    await second.waitFor("refused");
    expect(await second.completion).toBe(0);
    expect(second.events).not.toContain("read-entered");
    expect(fs.existsSync(lower)).toBe(false);
    expect(second.events).toContain("conflict:ambiguous-spelling");
    first.release();
    await first.waitFor("committed");
    expect(await first.completion).toBe(0);
  });

  it(`preserves distinct existing ${spelling.label} entries as independent boundaries`, async ({
    skip,
  }) => {
    const f = fixture();
    const upper = path.join(f.directory, spelling.first);
    const lower = path.join(f.directory, spelling.second);
    fs.writeFileSync(upper, "upper");
    fs.writeFileSync(lower, "lower");
    if (fs.statSync(upper, { bigint: true }).ino === fs.statSync(lower, { bigint: true }).ino)
      return skip("The temporary volume folds these spellings");
    expect(fs.statSync(upper, { bigint: true }).ino).not.toBe(
      fs.statSync(lower, { bigint: true }).ino,
    );
    const first = f.start({
      owner: f.firstOwner,
      namespace: f.namespace,
      nativeRoot: f.shared,
      target: upper,
      file: upper,
      label: "first",
      hold: true,
    });
    await first.waitFor("written");
    const second = f.start({
      owner: f.secondOwner,
      namespace: f.namespace,
      nativeRoot: f.directory,
      target: lower,
      file: lower,
      label: "second",
    });
    await second.waitFor("committed");
    expect(await second.completion).toBe(0);
    expect(fs.readFileSync(lower, "utf8")).toBe("second");
    expect(first.events).not.toContain("closed");
    first.release();
    await first.waitFor("committed");
    expect(await first.completion).toBe(0);
  });
}

for (const runtime of ["node", "bun"] as const) {
  it(`shares the production namespace in ${runtime} despite distinct HOME, AXM_USER_HOME, and TMPDIR`, async () => {
    const f = fixture();
    const first = f.start({
      owner: f.firstOwner,
      runtime,
      nativeRoot: f.shared,
      target: f.file,
      file: f.file,
      label: "first",
      hold: true,
    });
    await first.waitFor("written");
    const second = f.start({
      owner: f.secondOwner,
      runtime,
      nativeRoot: f.directory,
      target: f.file,
      file: f.file,
      label: "second",
    });
    await second.waitFor("refused");
    expect(await second.completion).toBe(0);
    expect(second.events).not.toContain("read-entered");
    expect(fs.readFileSync(f.file, "utf8")).toBe("first");
    first.release();
    await first.waitFor("committed");
    expect(await first.completion).toBe(0);
  });
}

it("refuses a mutation containing the coordination namespace", async () => {
  const f = fixture();
  fs.mkdirSync(f.namespace);
  const sentinel = path.join(f.namespace, "sentinel.txt");
  fs.writeFileSync(sentinel, "keep");
  const worker = f.start({
    owner: f.firstOwner,
    namespace: f.namespace,
    nativeRoot: f.namespace,
    target: f.namespace,
    file: sentinel,
    label: "changed",
  });
  await worker.waitFor("refused");
  expect(await worker.completion).toBe(0);
  expect(worker.events).not.toContain("read-entered");
  expect(fs.readFileSync(sentinel, "utf8")).toBe("keep");
  expect(fs.readFileSync(path.join(f.firstOwner, "axm.json"), "utf8")).toBe("original settings");
});

it("refuses existing case aliases on a case-folding volume", async ({ skip }) => {
  const f = fixture();
  const upper = path.join(f.directory, "Existing.json");
  const lower = path.join(f.directory, "existing.json");
  fs.writeFileSync(upper, "original");
  if (
    !fs.existsSync(lower) ||
    fs.statSync(upper, { bigint: true }).ino !== fs.statSync(lower, { bigint: true }).ino
  )
    return skip("The temporary volume distinguishes these spellings");
  const first = f.start({
    owner: f.firstOwner,
    namespace: f.namespace,
    nativeRoot: f.shared,
    target: upper,
    file: upper,
    label: "first",
    hold: true,
  });
  await first.waitFor("written");
  const second = f.start({
    owner: f.secondOwner,
    namespace: f.namespace,
    nativeRoot: f.directory,
    target: lower,
    file: lower,
    label: "second",
  });
  await second.waitFor("refused");
  expect(await second.completion).toBe(0);
  expect(second.events).toContain("conflict:overlap");
  expect(second.events).not.toContain("read-entered");
  expect(fs.readFileSync(upper, "utf8")).toBe("first");
  first.release();
  await first.waitFor("committed");
  expect(await first.completion).toBe(0);
});

for (const parentFirst of [true, false]) {
  it(`refuses existing parent-case aliases with ${parentFirst ? "parent" : "child"} admitted first`, async ({
    skip,
  }) => {
    const f = fixture();
    const upper = path.join(f.directory, "Existing");
    const lower = path.join(f.directory, "existing");
    fs.mkdirSync(upper);
    const file = path.join(upper, "config.json");
    fs.writeFileSync(file, "original");
    if (
      !fs.existsSync(lower) ||
      fs.statSync(upper, { bigint: true }).ino !== fs.statSync(lower, { bigint: true }).ino
    )
      return skip("The temporary volume distinguishes these spellings");
    const first = f.start({
      owner: f.firstOwner,
      namespace: f.namespace,
      nativeRoot: f.shared,
      target: parentFirst ? upper : file,
      file,
      label: "first",
      hold: true,
    });
    await first.waitFor("written");
    const secondFile = path.join(lower, "config.json");
    const second = f.start({
      owner: f.secondOwner,
      namespace: f.namespace,
      nativeRoot: f.directory,
      target: parentFirst ? secondFile : lower,
      file: secondFile,
      label: "second",
    });
    await second.waitFor("refused");
    expect(await second.completion).toBe(0);
    expect(second.events).toContain("conflict:overlap");
    expect(second.events).not.toContain("read-entered");
    expect(fs.readFileSync(file, "utf8")).toBe("first");
    expect(fs.readFileSync(path.join(f.secondOwner, "axm.json"), "utf8")).toBe("original settings");
    first.release();
    await first.waitFor("committed");
    expect(await first.completion).toBe(0);
  });
}
