import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type { ContainerIdentity } from "@agentxm/workspace-kernel/locations";
import {
  verifyForkReceipts,
  type WorkspaceTemplate,
} from "../benchmarks/observability-fixtures.js";

const temporaryRoot = Effect.acquireRelease(
  Effect.try(() => fs.mkdtempSync(path.join(os.tmpdir(), "axm-fork-receipt-oracle-"))),
  (root, exit) =>
    Exit.isFailure(exit)
      ? Effect.logError("Fork fixture native evidence retained at " + root)
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
  const endedAtMillis = Date.now();
  expect(history.entry.birthtime).toBeGreaterThanOrEqual(startedAtMillis);
  expect(history.entry.birthtime).toBeLessThanOrEqual(endedAtMillis);
  const inherited = directoryProof(template.workspace, path.join(template.workspace, ".axm"), []);
  const before = { version: 1, entries: [], createdDirectories: [inherited] };
  const after = { ...before, createdDirectories: [inherited, history] };
  const beforePath = path.join(root, name, "fork-receipts-before/projection-containers.json");
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
  return { before, after, history, beforePath, afterPath, observed };
};

describe("fork native receipt comparison", () => {
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
        const first = yield* verifyForkReceipts(template)(baseline.observed);
        const second = yield* verifyForkReceipts(template)(candidate.observed);
        expect(first.fileComparisons?.[0]?.sha256).toBeDefined();
        expect(first.fileComparisons?.[0]?.sha256).toBe(second.fileComparisons?.[0]?.sha256);
        expect(fs.readFileSync(candidate.afterPath)).toEqual(raw);
        const retained = path.join(candidate.observed.artifacts, "retained");
        expect(
          fs.readFileSync(path.join(retained, "fork-receipts-after/projection-containers.json")),
        ).toEqual(raw);
        expect(
          fs.readFileSync(path.join(retained, "fork-receipts-before/projection-containers.json")),
        ).toEqual(fs.readFileSync(candidate.beforePath));
        const projection = fs.readFileSync(
          path.join(retained, "fork-receipts-comparison.json"),
          "utf8",
        );
        expect(projection).toContain("<fork-live-verified-inode>");
        expect(projection).toContain("<fork-historical-not-poststat-verified-inode>");
        expect(
          fs.readFileSync(path.join(retained, "fork-receipt-native-observations.json"), "utf8"),
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
          fs.writeFileSync(sample.afterPath, JSON.stringify(after));
          const result = yield* verifyForkReceipts(template)(sample.observed).pipe(Effect.result);
          expect(result._tag, name).toBe("Failure");
          expect(
            fs.readFileSync(
              path.join(
                sample.observed.artifacts,
                "retained/fork-receipts-after/projection-containers.json",
              ),
            ),
          ).toEqual(fs.readFileSync(sample.afterPath));
          expect(
            fs.existsSync(
              path.join(sample.observed.artifacts, "retained/fork-receipts-comparison.json"),
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
        const original = yield* verifyForkReceipts(template)(baseline.observed);
        for (const field of [
          "mode",
          "inherited-inode",
          "inherited-owner",
          "inherited-alias",
          "order",
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
          fs.writeFileSync(
            sample.afterPath,
            JSON.stringify({
              ...sample.after,
              createdDirectories: field === "order" ? [history, changed] : [changed, history],
            }),
          );
          const compared = yield* verifyForkReceipts(template)(sample.observed);
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
        const timing = yield* verifyForkReceipts(template)({ ...sample.observed, phase: "timing" });
        expect(timing.fileComparisons).toBeUndefined();
        expect(fs.existsSync(sample.observed.artifacts)).toBe(false);
        const preflight = yield* verifyForkReceipts(template)(sample.observed).pipe(Effect.result);
        expect(preflight._tag).toBe("Failure");
        expect(
          fs.readFileSync(
            path.join(
              sample.observed.artifacts,
              "retained/fork-receipts-after/projection-containers.json",
            ),
            "utf8",
          ),
        ).toBe("{broken");
        fs.writeFileSync(sample.afterPath, JSON.stringify({ ...sample.after, unexpected: true }));
        const invalidSchema = yield* verifyForkReceipts(template)(sample.observed).pipe(
          Effect.result,
        );
        expect(invalidSchema._tag).toBe("Failure");
      }).pipe(Effect.scoped),
  );
});
