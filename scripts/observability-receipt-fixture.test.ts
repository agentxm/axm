import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import type { ContainerIdentity } from "@agentxm/workspace-kernel/locations";
import {
  captureContainerReceiptEvidence,
  verifyContainerReceiptEvidence,
  type WorkspaceTemplate,
} from "../benchmarks/observability-fixtures.js";

const temporaryRoot = Effect.acquireRelease(
  Effect.try(() => fs.mkdtempSync(path.join(os.tmpdir(), "axm-receipt-oracle-"))),
  (root, exit) =>
    Exit.isFailure(exit)
      ? Effect.logError("Receipt fixture native evidence retained at " + root)
      : Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
);

// The oracle reads Node metadata directly, without the product's identity capture/verifier.
const nativeIdentity = (target: string) => {
  const stat = fs.statSync(target, { bigint: true });
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    birthtime: stat.birthtime.getTime(),
    mode: Number(stat.mode),
  };
};

const directoryProof = (
  workspace: string,
  target: string,
  parents: string[],
): ContainerIdentity => ({
  nativeRoot: workspace,
  ownerRoot: workspace,
  identityOwnerRoot: workspace,
  target,
  physicalPath: target,
  owner: { path: workspace, identity: nativeIdentity(workspace) },
  root: { path: workspace, identity: nativeIdentity(workspace) },
  entry: nativeIdentity(target),
  parents: parents.map((parent) => ({ path: parent, identity: nativeIdentity(parent) })),
  aliases: [{ path: target, entryPath: target, referentPath: target }],
});

const makeTemplate = (root: string): WorkspaceTemplate => {
  const template = {
    workspace: path.join(root, "template/workspace"),
    home: path.join(root, "template/home"),
  };
  fs.mkdirSync(path.join(template.workspace, ".axm"), { recursive: true });
  fs.mkdirSync(template.home, { recursive: true });
  return template;
};

const makeSample = (root: string, name: string, template: WorkspaceTemplate) => {
  const fixture = {
    workspace: path.join(root, name, "workspace"),
    home: path.join(root, name, "home"),
  };
  const runtime = path.join(fixture.workspace, ".axm");
  fs.mkdirSync(runtime, { recursive: true });
  fs.mkdirSync(fixture.home, { recursive: true });
  // This unit fixture supplies a synthetic process window, not child timing.
  // Leave room for filesystem timestamp quantization around immediate mkdir;
  // real preflight still uses the unmodified measured child start/end bounds.
  const startedAtMillis = Date.now() - 1000;
  const scratch = path.join(runtime, "tmp");
  fs.mkdirSync(scratch);
  const history = directoryProof(fixture.workspace, scratch, [runtime]);
  fs.rmdirSync(scratch);
  const liveTarget = path.join(runtime, "live", "nested");
  fs.mkdirSync(liveTarget, { recursive: true });
  const live = directoryProof(fixture.workspace, liveTarget, [path.dirname(liveTarget), runtime]);
  const endedAtMillis = Date.now();
  expect(history.entry.birthtime).toBeGreaterThanOrEqual(startedAtMillis);
  expect(history.entry.birthtime).toBeLessThanOrEqual(endedAtMillis);
  const inherited = directoryProof(template.workspace, path.join(template.workspace, ".axm"), []);
  const before = { version: 1, entries: [], createdDirectories: [inherited] };
  const after = {
    ...before,
    entries: [{ unit: "live-unit", kind: "created-directory", identity: live }],
    createdDirectories: [inherited, history],
  };
  const beforePath = path.join(root, name, "before-receipt.json");
  const afterPath = path.join(runtime, "projection-containers.json");
  fs.mkdirSync(path.dirname(beforePath), { recursive: true });
  fs.writeFileSync(beforePath, JSON.stringify(before));
  fs.writeFileSync(afterPath, JSON.stringify(after));
  const observed = {
    fixture,
    artifacts: path.join(root, name, "artifacts"),
    phase: "preflight" as const,
    stdout: "",
    stderr: "",
    startedAtMillis,
    endedAtMillis,
  };
  return { before, after, history, live, beforePath, afterPath, observed };
};

const verifySample = (
  template: WorkspaceTemplate,
  sample: ReturnType<typeof makeSample>,
  phase: "preflight" | "timing" = "preflight",
) =>
  Effect.gen(function* () {
    const observed = { ...sample.observed, phase };
    const postimage = phase === "preflight" ? fs.readFileSync(sample.afterPath) : undefined;
    if (postimage !== undefined) fs.copyFileSync(sample.beforePath, sample.afterPath);
    const before = yield* captureContainerReceiptEvidence({ ...observed, stage: "before" });
    if (postimage !== undefined) fs.writeFileSync(sample.afterPath, postimage);
    const after = yield* captureContainerReceiptEvidence({ ...observed, stage: "after" });
    return yield* verifyContainerReceiptEvidence(template, { before, after })(observed);
  });

describe("preflight native receipt comparison", () => {
  it.effect(
    "retains genuine absence and projects only independently matched new live native IDs",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot;
        const template = makeTemplate(root);
        const sample = makeSample(root, "sample", template);
        fs.rmSync(sample.afterPath);
        const before = yield* captureContainerReceiptEvidence({
          ...sample.observed,
          stage: "before",
        });
        const missingAfter = yield* captureContainerReceiptEvidence({
          ...sample.observed,
          stage: "after",
        });
        const absent = yield* verifyContainerReceiptEvidence(template, {
          before,
          after: missingAfter,
        })(sample.observed);
        expect(absent.fileComparisons).toBeUndefined();
        expect(before?.present).toBe(false);
        expect(missingAfter?.present).toBe(false);
        const retained = path.join(sample.observed.artifacts, "retained");
        expect(
          fs.readFileSync(path.join(retained, "container-receipts-before/presence.json"), "utf8"),
        ).toBe('{"present":false}\n');
        expect(
          fs.existsSync(
            path.join(retained, "container-receipts-before/projection-containers.json"),
          ),
        ).toBe(false);
        const runtime = path.join(sample.observed.fixture.workspace, ".axm");
        const target = path.join(runtime, "new-live");
        fs.mkdirSync(target);
        const live = directoryProof(sample.observed.fixture.workspace, target, [runtime]);
        fs.writeFileSync(
          sample.afterPath,
          JSON.stringify({ version: 1, entries: [], createdDirectories: [live] }),
        );
        const after = yield* captureContainerReceiptEvidence({
          ...sample.observed,
          stage: "after",
        });
        const checked = yield* verifyContainerReceiptEvidence(template, { before, after })(
          sample.observed,
        );
        expect(checked.fileComparisons?.[0]?.sha256).toBeDefined();
        expect(fs.existsSync(path.join(retained, "container-receipts-comparison.json"))).toBe(true);
        expect(
          fs.readFileSync(
            path.join(retained, "container-receipt-native-observations.json"),
            "utf8",
          ),
        ).toContain('"matchesSample": true');
      }).pipe(Effect.scoped),
  );

  it.effect("keeps unchanged receipt bytes strict without claiming a fresh native audit", () =>
    Effect.gen(function* () {
      const root = yield* temporaryRoot;
      const template = makeTemplate(root);
      const sample = makeSample(root, "unchanged", template);
      fs.copyFileSync(sample.beforePath, sample.afterPath);
      const verified = yield* verifySample(template, sample);
      expect(verified.fileComparisons).toBeUndefined();
      const retained = path.join(sample.observed.artifacts, "retained");
      expect(fs.existsSync(path.join(retained, "container-receipt-native-observations.json"))).toBe(
        false,
      );
      expect(
        fs.readFileSync(path.join(retained, "container-receipts-after/projection-containers.json")),
      ).toEqual(fs.readFileSync(sample.beforePath));
    }).pipe(Effect.scoped),
  );

  it.effect(
    "carries only verified setup identities across unchanged receipts and later retirement",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot;
        const template = makeTemplate(root);
        for (const retirement of ["retained-proof", "removed-proof"]) {
          const inputDigests: Array<string | undefined> = [];
          const outputDigests: Array<string | undefined> = [];
          for (const subject of ["baseline", "candidate"]) {
            const sample = makeSample(root, retirement + "-" + subject, template);
            const setup = yield* verifySample(template, sample);
            expect(setup.verifiedIdentities?.length).toBe(2);
            inputDigests.push(setup.fileComparisons?.[0]?.sha256);
            const observed = {
              ...sample.observed,
              artifacts: path.join(sample.observed.artifacts, "operation"),
              // Setup history is deliberately outside the measured operation window.
              startedAtMillis: sample.observed.endedAtMillis + 1000,
              endedAtMillis: sample.observed.endedAtMillis + 2000,
            };
            const before = yield* captureContainerReceiptEvidence({
              ...observed,
              stage: "before",
            });
            fs.rmdirSync(sample.live.target);
            if (retirement === "removed-proof")
              fs.writeFileSync(sample.afterPath, JSON.stringify({ ...sample.after, entries: [] }));
            const raw = fs.readFileSync(sample.afterPath);
            const after = yield* captureContainerReceiptEvidence({ ...observed, stage: "after" });
            const verified = yield* verifyContainerReceiptEvidence(template, {
              before,
              after,
              preparedIdentities: setup.verifiedIdentities,
            })(observed);
            outputDigests.push(verified.fileComparisons?.[0]?.sha256);
            expect(fs.readFileSync(sample.afterPath)).toEqual(raw);
            const retained = path.join(observed.artifacts, "retained");
            const projection = fs.readFileSync(
              path.join(retained, "container-receipts-comparison.json"),
              "utf8",
            );
            expect(projection).toContain(
              "<receipt-preparation-historical-not-poststat-verified-inode>",
            );
            const projected = yield* Schema.decodeUnknownEffect(
              Schema.fromJsonString(
                Schema.Struct({
                  createdDirectories: Schema.Array(Schema.Struct({ entry: Schema.Unknown })),
                }),
              ),
            )(projection);
            expect(projected.createdDirectories[0]?.entry).toEqual(
              sample.before.createdDirectories[0]?.entry,
            );
            const observations = fs.readFileSync(
              path.join(retained, "container-receipt-native-observations.json"),
              "utf8",
            );
            expect(observations).toContain('"classification": "inherited-setup-verified"');
            expect(observations).toContain('"matchesSample": false');
            if (retirement === "retained-proof") {
              expect(projection).toContain("<receipt-preparation-live-verified-inode>");
              expect(observations).toContain('"preparationProof": "live"');
              expect(before?.sha256).toBe(after?.sha256);
            }
          }
          expect(inputDigests[0]).toBeDefined();
          expect(inputDigests[0]).toBe(inputDigests[1]);
          expect(outputDigests[0]).toBeDefined();
          expect(outputDigests[0]).toBe(outputDigests[1]);
        }
      }).pipe(Effect.scoped),
  );

  it.effect(
    "rejects setup carry for identities absent from the operation preimage or changed afterward",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot;
        const template = makeTemplate(root);
        for (const change of ["absent-preimage", "changed-identity"]) {
          const sample = makeSample(root, change, template);
          const setup = yield* verifySample(template, sample);
          const observed = {
            ...sample.observed,
            artifacts: path.join(sample.observed.artifacts, "operation"),
            startedAtMillis: sample.observed.endedAtMillis + 1000,
            endedAtMillis: sample.observed.endedAtMillis + 2000,
          };
          if (change === "absent-preimage") fs.copyFileSync(sample.beforePath, sample.afterPath);
          const before = yield* captureContainerReceiptEvidence({ ...observed, stage: "before" });
          const changed = {
            ...sample.after,
            entries: sample.after.entries.map((entry) => ({
              ...entry,
              identity:
                change === "changed-identity"
                  ? { ...entry.identity, entry: { ...entry.identity.entry, inode: "0" } }
                  : entry.identity,
            })),
          };
          fs.writeFileSync(sample.afterPath, JSON.stringify(changed));
          fs.rmdirSync(sample.live.target);
          const after = yield* captureContainerReceiptEvidence({ ...observed, stage: "after" });
          const result = yield* verifyContainerReceiptEvidence(template, {
            before,
            after,
            preparedIdentities: setup.verifiedIdentities,
          })(observed).pipe(Effect.result);
          expect(result._tag, change).toBe("Failure");
          expect(
            fs.existsSync(
              path.join(observed.artifacts, "retained/container-receipts-comparison.json"),
            ),
          ).toBe(false);
        }
      }).pipe(Effect.scoped),
  );

  it.effect(
    "compares fresh native allocations while retaining raw receipts and historical uncertainty",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot;
        const template = makeTemplate(root);
        const baseline = makeSample(root, "baseline", template);
        const candidate = makeSample(root, "candidate", template);
        expect(baseline.history.owner.identity.inode).not.toBe(
          candidate.history.owner.identity.inode,
        );
        const raw = fs.readFileSync(candidate.afterPath);
        const first = yield* verifySample(template, baseline);
        const second = yield* verifySample(template, candidate);
        expect(first.fileComparisons?.[0]?.sha256).toBeDefined();
        expect(first.fileComparisons?.[0]?.sha256).toBe(second.fileComparisons?.[0]?.sha256);
        expect(fs.readFileSync(candidate.afterPath)).toEqual(raw);
        const retained = path.join(candidate.observed.artifacts, "retained");
        expect(
          fs.readFileSync(
            path.join(retained, "container-receipts-after/projection-containers.json"),
          ),
        ).toEqual(raw);
        expect(
          fs.readFileSync(
            path.join(retained, "container-receipts-before/projection-containers.json"),
          ),
        ).toEqual(fs.readFileSync(candidate.beforePath));
        const projection = fs.readFileSync(
          path.join(retained, "container-receipts-comparison.json"),
          "utf8",
        );
        expect(projection).toContain("<receipt-live-verified-inode>");
        expect(projection).toContain("<receipt-historical-not-poststat-verified-inode>");
        expect(
          fs.readFileSync(
            path.join(retained, "container-receipt-native-observations.json"),
            "utf8",
          ),
        ).toContain("historical-runtime-cleanup-not-poststat-verifiable");
      }).pipe(Effect.scoped),
  );

  it.effect(
    "rejects forged live identities and unsupported historical absence before projecting",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot;
        const template = makeTemplate(root);
        const cases = [
          "live-owner",
          "other-directory",
          "old-birthtime",
          "not-directory",
          "foreign-device",
          "linked-alias",
          "entry-receipt",
          "new-live-entry",
          "new-live-parent",
          "new-live-birthtime",
          "new-live-mode",
          "new-live-device",
          "new-live-alias",
        ];
        for (const name of cases) {
          const sample = makeSample(root, name, template);
          let history = sample.history;
          if (name === "live-owner")
            history = {
              ...history,
              owner: { ...history.owner, identity: { ...history.owner.identity, inode: "0" } },
            };
          if (name === "other-directory") {
            const other = path.join(sample.observed.fixture.workspace, ".axm", "other");
            history = {
              ...history,
              target: other,
              physicalPath: other,
              aliases: [{ path: other, entryPath: other, referentPath: other }],
            };
          }
          if (name === "old-birthtime")
            history = {
              ...history,
              entry: { ...history.entry, birthtime: sample.observed.startedAtMillis - 1 },
            };
          if (name === "not-directory")
            history = { ...history, entry: { ...history.entry, mode: 0o100644 } };
          if (name === "foreign-device")
            history = {
              ...history,
              entry: { ...history.entry, device: history.entry.device + "9" },
            };
          if (name === "linked-alias")
            history = {
              ...history,
              aliases: history.aliases.map((alias) => ({ ...alias, linkTarget: "other" })),
            };
          const after =
            name === "entry-receipt"
              ? {
                  ...sample.before,
                  entries: [{ unit: "foreign", kind: "created-directory", identity: history }],
                }
              : {
                  ...sample.after,
                  createdDirectories: [...sample.before.createdDirectories, history],
                };
          let live = sample.live;
          if (name === "new-live-entry") live = { ...live, entry: { ...live.entry, inode: "0" } };
          if (name === "new-live-birthtime")
            live = { ...live, entry: { ...live.entry, birthtime: live.entry.birthtime - 1 } };
          if (name === "new-live-mode")
            live = { ...live, entry: { ...live.entry, mode: 0o100644 } };
          if (name === "new-live-device")
            live = { ...live, entry: { ...live.entry, device: live.entry.device + "9" } };
          if (name === "new-live-alias")
            live = {
              ...live,
              aliases: live.aliases.map((alias) => ({ ...alias, path: alias.path + "-missing" })),
            };
          if (name === "new-live-parent")
            live = {
              ...live,
              parents: live.parents.map((parent) => ({
                ...parent,
                identity: { ...parent.identity, inode: "0" },
              })),
            };
          const observedAfter = name.startsWith("new-live-")
            ? {
                ...after,
                entries: sample.after.entries.map((entry) => ({ ...entry, identity: live })),
              }
            : after;
          fs.writeFileSync(sample.afterPath, JSON.stringify(observedAfter));
          const result = yield* verifySample(template, sample).pipe(Effect.result);
          expect(result._tag, name).toBe("Failure");
          expect(
            fs.readFileSync(
              path.join(
                sample.observed.artifacts,
                "retained/container-receipts-after/projection-containers.json",
              ),
            ),
          ).toEqual(fs.readFileSync(sample.afterPath));
          expect(
            fs.existsSync(
              path.join(sample.observed.artifacts, "retained/container-receipts-comparison.json"),
            ),
          ).toBe(false);
        }
      }).pipe(Effect.scoped),
  );

  it.effect(
    "keeps directory modes, inherited identities, ownership, aliases and ordering significant",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot;
        const template = makeTemplate(root);
        const baseline = makeSample(root, "baseline", template);
        const original = yield* verifySample(template, baseline);
        for (const field of [
          "mode",
          "inherited-inode",
          "inherited-owner",
          "inherited-alias",
          "order",
          "live-mode",
          "live-path",
          "live-unit",
        ]) {
          const sample = makeSample(root, field, template);
          const inherited = sample.before.createdDirectories[0];
          if (inherited === undefined)
            return yield* Effect.die("Fixture requires an inherited proof.");
          const changed =
            field === "inherited-inode"
              ? { ...inherited, entry: { ...inherited.entry, inode: inherited.entry.inode + "9" } }
              : field === "inherited-owner"
                ? { ...inherited, ownerRoot: inherited.ownerRoot + "/other" }
                : field === "inherited-alias"
                  ? {
                      ...inherited,
                      aliases: inherited.aliases.map((alias) => ({
                        ...alias,
                        path: alias.path + "/other",
                      })),
                    }
                  : inherited;
          const history =
            field === "mode"
              ? {
                  ...sample.history,
                  entry: {
                    ...sample.history.entry,
                    mode: sample.history.entry.mode === 0o040700 ? 0o040755 : 0o040700,
                  },
                }
              : sample.history;
          fs.writeFileSync(
            sample.beforePath,
            JSON.stringify({ ...sample.before, createdDirectories: [changed] }),
          );
          let live = sample.live;
          if (field === "live-mode") {
            fs.chmodSync(live.target, (live.entry.mode & 0o777) === 0o700 ? 0o755 : 0o700);
            live = { ...live, entry: nativeIdentity(live.target) };
          }
          if (field === "live-path") {
            const next = live.target + "-other";
            fs.renameSync(live.target, next);
            live = directoryProof(
              sample.observed.fixture.workspace,
              next,
              live.parents.map((parent) => parent.path),
            );
          }
          fs.writeFileSync(
            sample.afterPath,
            JSON.stringify({
              ...sample.after,
              entries: sample.after.entries.map((entry) => ({
                ...entry,
                unit: field === "live-unit" ? "other-unit" : entry.unit,
                identity: live,
              })),
              createdDirectories: field === "order" ? [history, changed] : [changed, history],
            }),
          );
          const compared = yield* verifySample(template, sample);
          expect(compared.fileComparisons?.[0]?.sha256, field).toBeDefined();
          expect(compared.fileComparisons?.[0]?.sha256, field).not.toBe(
            original.fileComparisons?.[0]?.sha256,
          );
        }
      }).pipe(Effect.scoped),
  );

  it.effect(
    "performs no full receipt audit in timing and rejects malformed preflight receipts",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot;
        const template = makeTemplate(root);
        const sample = makeSample(root, "sample", template);
        fs.writeFileSync(sample.afterPath, "{broken");
        const timing = yield* verifySample(template, sample, "timing");
        expect(timing.fileComparisons).toBeUndefined();
        expect(fs.existsSync(sample.observed.artifacts)).toBe(false);
        const preflight = yield* verifySample(template, sample).pipe(Effect.result);
        expect(preflight._tag).toBe("Failure");
        expect(
          fs.readFileSync(
            path.join(
              sample.observed.artifacts,
              "retained/container-receipts-after/projection-containers.json",
            ),
            "utf8",
          ),
        ).toBe("{broken");
        fs.writeFileSync(sample.afterPath, JSON.stringify({ ...sample.after, unexpected: true }));
        const invalidSchema = yield* verifySample(template, sample).pipe(Effect.result);
        expect(invalidSchema._tag).toBe("Failure");
      }).pipe(Effect.scoped),
  );
});
