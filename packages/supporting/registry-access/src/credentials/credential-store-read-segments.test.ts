/**
 * How often one locked credential operation reads the restricted credential
 * file, and what it logs while doing so.
 *
 * The keychain is replaced only at its declared loader seam, so these cases do
 * not establish OS keychain packaging. The restricted file is real.
 */

import * as nodeFs from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { makeRecordingFileSystem, type RecordedFileSystemMethod } from "@agentxm/test-support";
import * as Cause from "effect/Cause";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as References from "effect/References";
import * as Schema from "effect/Schema";
import type * as Tracer from "effect/Tracer";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  CredentialStore,
  CredentialStoreLive,
  KeyringEntryLoader,
  KeyringUnavailable,
  type CredentialStoreService,
} from "./credential-store.js";
import { CredentialFileSchema } from "./schema.js";
import { credentialFileFixture, credentialKeyOf } from "./test-helpers.js";
import { recordTrace } from "../test-support/test-helpers.js";

const registry = credentialKeyOf("https://registry.example.test");
const otherRegistry = credentialKeyOf("https://other.example.test");
const foreignRegistry = credentialKeyOf("https://foreign.example.test");
const handle = normalizeHandle("@alice");
const previousHandle = normalizeHandle("@carol");
const credentials = {
  access_token: "fixture-access",
  refresh_token: "fixture-refresh",
  expires_at: DateTime.makeUnsafe("2030-01-01T00:00:00Z"),
};

const account = (token: string, active: boolean) => ({
  access_token: `${token}-access`,
  refresh_token: `${token}-refresh`,
  expires_at: "2030-01-01T00:00:00.000Z",
  active,
});
const credentialText = (registries: Record<string, unknown>) =>
  JSON.stringify({ version: 1, registries }, null, 2);
const otherRegistries = { [otherRegistry]: { accounts: { "@bob": account("other", true) } } };
/** Another Registry plus a previous account of the Registry under test. */
const withRegistry = credentialText({
  ...otherRegistries,
  [registry]: { accounts: { "@carol": account("previous", true) } },
});
const withoutRegistry = credentialText(otherRegistries);
const keychainValue = JSON.stringify({
  version: 1,
  registries: { [registry]: { accounts: { "@carol": account("keychain", true) } } },
});

const decodeCredentialText = Schema.decodeUnknownSync(Schema.fromJsonString(CredentialFileSchema));
const decodeLooseCredentialText = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      version: Schema.Literal(1),
      registries: Schema.Record(Schema.String, Schema.Unknown),
    }),
  ),
);

type FileState = "absent" | "private" | "permissive";
const fileStates: ReadonlyArray<FileState> = ["absent", "private", "permissive"];
const fileModes = { private: 0o600, permissive: 0o644 } as const;

interface NativeBehavior {
  readonly getPassword: () => string | null;
  readonly setPassword: (value: string) => void;
  readonly deletePassword: () => void;
}
type EntryConstructor = new (
  service: string,
  account: string,
) => {
  readonly getPassword: () => string | null;
  readonly setPassword: (password: string) => void;
  readonly deletePassword: () => void;
};
type Loader = Effect.Effect<EntryConstructor, KeyringUnavailable>;

const nativeEntry = (behavior: NativeBehavior): EntryConstructor =>
  class Entry {
    constructor(
      readonly service: string,
      readonly account: string,
    ) {}
    getPassword() {
      return behavior.getPassword();
    }
    setPassword(value: string) {
      behavior.setPassword(value);
    }
    deletePassword() {
      behavior.deletePassword();
    }
  };

const keychainFails = () => {
  throw new Error("fixture-native-failure");
};
const moduleLoadFailed = () => new KeyringUnavailable({ reason: "module-load-failed" });

const notFound = (path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "FileSystem",
    method: "access",
    pathOrDescriptor: path,
  });

/** Methods that change a path: writes, renames, removals, and mode or ownership changes. */
const mutatingMethods: ReadonlySet<RecordedFileSystemMethod> = new Set<RecordedFileSystemMethod>([
  "chmod",
  "chown",
  "copy",
  "copyFile",
  "link",
  "makeTempFile",
  "makeTempFileScoped",
  "remove",
  "rename",
  "symlink",
  "truncate",
  "utimes",
  "writeFile",
  "file.truncate",
  "file.write",
  "file.writeAll",
]);

interface LogEntry {
  readonly level: string;
  readonly message: unknown;
}

/**
 * A real credential home under the recording filesystem. The restricted tier
 * comes from an SSH session; the keychain tier from a host that reports no
 * container markers and no SSH or CI variables.
 */
const storeFixture = (options: {
  readonly tier: "restricted-file" | "keychain";
  readonly state: FileState;
  readonly content?: string;
  readonly loader?: Loader;
}) =>
  Effect.gen(function* () {
    const fixture = yield* credentialFileFixture;
    if (options.state !== "absent") {
      yield* fixture.fs.writeFileString(fixture.file, options.content ?? withRegistry);
      yield* fixture.fs.chmod(fixture.file, fileModes[options.state]);
    }
    const base =
      options.tier === "keychain"
        ? FileSystem.make({
            ...fixture.fs,
            access: (path, accessOptions) =>
              path === "/.dockerenv" || path === "/.containerenv"
                ? Effect.fail(notFound(path))
                : fixture.fs.access(path, accessOptions),
          })
        : fixture.fs;
    const { fileSystem, recording } = makeRecordingFileSystem(base);
    const environment: Record<string, string> =
      options.tier === "keychain"
        ? { AXM_USER_HOME: fixture.home }
        : { AXM_USER_HOME: fixture.home, SSH_TTY: "/dev/ttys000" };
    const logs: Array<LogEntry> = [];
    const logger = Logger.make(({ logLevel, message }) => {
      logs.push({ level: logLevel, message });
    });
    const layer = Layer.mergeAll(
      Layer.fresh(CredentialStoreLive).pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(FileSystem.FileSystem, fileSystem),
            NodePath.layer,
            ConfigProvider.layer(ConfigProvider.fromEnvRecord(environment)),
            Layer.succeed(KeyringEntryLoader, options.loader ?? Effect.fail(moduleLoadFailed())),
          ),
        ),
      ),
      Logger.layer([logger], { mergeWithExisting: false }),
      Layer.succeed(References.MinimumLogLevel, "All"),
    );
    const run = <A, E>(operation: (store: CredentialStoreService) => Effect.Effect<A, E>) =>
      Effect.gen(function* () {
        recording.reset();
        logs.length = 0;
        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            return yield* operation(yield* CredentialStore);
          }).pipe(Effect.provide(layer)),
        );
        /** Changes to credentials.json or to an atomic-write temp file beside it. */
        const namesFile = (path: string | undefined) =>
          path !== undefined && (path === fixture.file || path.startsWith(`${fixture.file}.tmp.`));
        return {
          exit,
          fileMutations: recording
            .calls()
            .filter(
              (call) =>
                mutatingMethods.has(call.method) &&
                (namesFile(call.path) || namesFile(call.toPath)),
            )
            .map((call) => call.method),
          contentReads: recording.contentReads(fixture.file),
          stats: recording.counts(fixture.file).stat ?? 0,
          logs: [...logs],
        };
      });
    return { ...fixture, run };
  });

const save = (store: CredentialStoreService) => store.save(registry, handle, credentials);
const clear = (store: CredentialStoreService) => store.clear(registry);
const loadThenSave = (store: CredentialStoreService) =>
  store.load(registry).pipe(Effect.andThen(save(store)));

/** Rewrite credentials.json synchronously, as another process would inside a native call. */
const addForeignRegistry = (file: string) => {
  const current = nodeFs.existsSync(file)
    ? decodeLooseCredentialText(nodeFs.readFileSync(file, "utf8"))
    : { version: 1, registries: {} };
  nodeFs.writeFileSync(
    file,
    credentialText({
      ...current.registries,
      [foreignRegistry]: { accounts: { "@dana": account("foreign", true) } },
    }),
    { mode: 0o600 },
  );
};

const failureDetail = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit)
    ? Option.map(Cause.findErrorOption(exit.cause), (error) =>
        typeof error === "object" && error !== null && "detail" in error ? error.detail : error,
      )
    : Option.none();

const permissiveWarning: LogEntry = {
  level: "Warn",
  message: ["Credential file has overly permissive permissions."],
};
const fallbackReadNote = (reason: KeyringUnavailable["reason"]): LogEntry => ({
  level: "Debug",
  message: [`OS keychain unavailable (${reason}); reading the restricted credential file.`],
});
const fallbackWrite = (
  level: "Warn" | "Debug",
  reason: KeyringUnavailable["reason"],
): LogEntry => ({
  level,
  message: [`OS keychain unavailable (${reason}); using restricted credential file.`],
});
/** The root-ownership warning depends on the host user, not on credential reads. */
const withoutRootWarning = (logs: ReadonlyArray<LogEntry>) =>
  logs.filter(
    (entry) =>
      !(
        Array.isArray(entry.message) &&
        entry.message[0] === "Running as root. Credentials will be owned by root."
      ),
  );

interface SegmentCase {
  readonly name: string;
  readonly tier: "restricted-file" | "keychain";
  readonly content?: string;
  readonly native?: NativeBehavior;
  readonly loaderFails?: boolean;
  readonly operation: (store: CredentialStoreService) => Effect.Effect<unknown, unknown>;
  /** Content reads of credentials.json; each read of a present file also inspects its mode. */
  readonly reads: number;
  /** The complete log sequence, debug notes included, for each file state the case covers. */
  readonly logs: Partial<Record<FileState, ReadonlyArray<LogEntry>>>;
  /** File states in which the operation has nothing to change in credentials.json. */
  readonly unchangedStates?: ReadonlyArray<FileState>;
}

const found = () => keychainValue;
const missing = () => null;
const succeeds = () => undefined;

const segmentCases: ReadonlyArray<SegmentCase> = [
  {
    name: "restricted save",
    tier: "restricted-file",
    operation: save,
    reads: 1,
    logs: { absent: [], private: [], permissive: [permissiveWarning, permissiveWarning] },
  },
  {
    name: "restricted clear of a stored Registry",
    tier: "restricted-file",
    operation: clear,
    reads: 1,
    unchangedStates: ["absent"],
    logs: { absent: [], private: [], permissive: [permissiveWarning, permissiveWarning] },
  },
  {
    name: "restricted clear of a Registry that is not stored",
    tier: "restricted-file",
    content: withoutRegistry,
    operation: clear,
    reads: 1,
    unchangedStates: ["private", "permissive"],
    logs: { private: [], permissive: [permissiveWarning, permissiveWarning] },
  },
  {
    name: "restricted load then save",
    tier: "restricted-file",
    operation: loadThenSave,
    reads: 2,
    logs: {
      absent: [],
      private: [],
      permissive: [permissiveWarning, permissiveWarning, permissiveWarning],
    },
  },
  {
    name: "keychain save of a found entry",
    tier: "keychain",
    native: { getPassword: found, setPassword: succeeds, deletePassword: succeeds },
    operation: save,
    reads: 2,
    logs: { absent: [], private: [], permissive: [permissiveWarning, permissiveWarning] },
  },
  {
    name: "keychain save of a missing entry",
    tier: "keychain",
    native: { getPassword: missing, setPassword: succeeds, deletePassword: succeeds },
    operation: save,
    reads: 3,
    logs: {
      absent: [],
      private: [],
      permissive: [permissiveWarning, permissiveWarning, permissiveWarning],
    },
  },
  {
    name: "keychain save of a found entry whose write fails",
    tier: "keychain",
    native: { getPassword: found, setPassword: keychainFails, deletePassword: succeeds },
    operation: save,
    reads: 2,
    logs: {
      absent: [fallbackWrite("Warn", "keychain-access-failed")],
      private: [fallbackWrite("Debug", "keychain-access-failed")],
      permissive: [
        permissiveWarning,
        permissiveWarning,
        fallbackWrite("Debug", "keychain-access-failed"),
        permissiveWarning,
      ],
    },
  },
  {
    name: "keychain save of a missing entry whose write fails",
    tier: "keychain",
    native: { getPassword: missing, setPassword: keychainFails, deletePassword: succeeds },
    operation: save,
    reads: 3,
    logs: {
      absent: [fallbackWrite("Warn", "keychain-access-failed")],
      private: [fallbackWrite("Debug", "keychain-access-failed")],
      permissive: [
        permissiveWarning,
        permissiveWarning,
        permissiveWarning,
        fallbackWrite("Debug", "keychain-access-failed"),
        permissiveWarning,
      ],
    },
  },
  {
    name: "keychain save whose read and write fail",
    tier: "keychain",
    native: { getPassword: keychainFails, setPassword: keychainFails, deletePassword: succeeds },
    operation: save,
    reads: 3,
    logs: {
      absent: [
        fallbackReadNote("keychain-access-failed"),
        fallbackWrite("Warn", "keychain-access-failed"),
      ],
      private: [
        fallbackReadNote("keychain-access-failed"),
        fallbackWrite("Debug", "keychain-access-failed"),
      ],
      permissive: [
        permissiveWarning,
        fallbackReadNote("keychain-access-failed"),
        permissiveWarning,
        permissiveWarning,
        fallbackWrite("Debug", "keychain-access-failed"),
        permissiveWarning,
      ],
    },
  },
  {
    name: "keychain save whose module fails to load",
    tier: "keychain",
    loaderFails: true,
    operation: save,
    reads: 3,
    logs: {
      absent: [fallbackReadNote("module-load-failed"), fallbackWrite("Warn", "module-load-failed")],
      private: [
        fallbackReadNote("module-load-failed"),
        fallbackWrite("Debug", "module-load-failed"),
      ],
      permissive: [
        permissiveWarning,
        fallbackReadNote("module-load-failed"),
        permissiveWarning,
        permissiveWarning,
        fallbackWrite("Debug", "module-load-failed"),
        permissiveWarning,
      ],
    },
  },
  {
    name: "keychain clear",
    tier: "keychain",
    native: { getPassword: found, setPassword: succeeds, deletePassword: succeeds },
    operation: clear,
    reads: 2,
    logs: { absent: [], private: [], permissive: [permissiveWarning, permissiveWarning] },
  },
];

const readCredentialText = (file: string) => nodeFs.readFileSync(file, "utf8");

describe("credential operation read segments", () => {
  for (const segment of segmentCases) {
    for (const state of fileStates) {
      const logs = segment.logs[state];
      if (logs === undefined) continue;
      it.live(`${segment.name}, credential file ${state}`, () =>
        Effect.gen(function* () {
          const fixture = yield* storeFixture({
            tier: segment.tier,
            state,
            ...(segment.content === undefined ? {} : { content: segment.content }),
            ...(segment.loaderFails === true
              ? { loader: Effect.fail(moduleLoadFailed()) }
              : segment.native === undefined
                ? {}
                : { loader: Effect.succeed(nativeEntry(segment.native)) }),
          });
          const observed = yield* fixture.run(segment.operation);
          expect(Exit.isSuccess(observed.exit)).toBe(true);
          expect(withoutRootWarning(observed.logs)).toEqual(logs);
          expect(observed.contentReads).toBe(segment.reads);
          expect(observed.stats).toBe(state === "absent" ? 0 : segment.reads);
          if (segment.unchangedStates?.includes(state) === true) {
            expect(observed.fileMutations).toEqual([]);
            if (state === "absent") {
              expect(nodeFs.existsSync(fixture.file)).toBe(false);
            } else {
              expect(readCredentialText(fixture.file)).toBe(segment.content ?? withRegistry);
            }
          }
        }).pipe(Effect.provide(NodeServices.layer)),
      );
    }
  }

  it.live("records one restricted-file read interval for a restricted save", () =>
    Effect.gen(function* () {
      const fixture = yield* storeFixture({ tier: "restricted-file", state: "private" });
      const trace = recordTrace();
      const observed = yield* fixture
        .run(save)
        .pipe(Effect.withTracer(trace.tracer), Effect.withTracerEnabled(true));
      const reads = trace.spans.filter(
        (span: Tracer.NativeSpan) =>
          span.name === "axm.auth.credential-backend" &&
          span.attributes.get("axm.credential.backend") === "restricted-file" &&
          span.attributes.get("axm.credential.operation") === "read",
      );
      expect(reads).toHaveLength(1);
      expect(observed.contentReads).toBe(reads.length);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("keeps every other Registry's decoded value through a restricted save", () =>
    Effect.gen(function* () {
      const fixture = yield* storeFixture({ tier: "restricted-file", state: "permissive" });
      const before = decodeCredentialText(withRegistry);
      const observed = yield* fixture.run(save);
      expect(Exit.isSuccess(observed.exit)).toBe(true);
      const after = decodeCredentialText(readCredentialText(fixture.file));
      expect(after.registries[otherRegistry]).toEqual(before.registries[otherRegistry]);
      expect(after.registries[registry]?.accounts).toEqual({
        [previousHandle]: {
          ...before.registries[registry]?.accounts[previousHandle],
          active: false,
        },
        [handle]: { ...credentials, active: true },
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("accepts an absent file and refuses an empty one on a restricted save", () =>
    Effect.gen(function* () {
      const absent = yield* storeFixture({ tier: "restricted-file", state: "absent" });
      const saved = yield* absent.run(save);
      expect(Exit.isSuccess(saved.exit)).toBe(true);
      expect(Object.keys(decodeCredentialText(readCredentialText(absent.file)).registries)).toEqual(
        [registry],
      );

      const empty = yield* storeFixture({
        tier: "restricted-file",
        state: "private",
        content: "",
      });
      const refused = yield* empty.run(save);
      expect(failureDetail(refused.exit)).toEqual(Option.some("Failed to parse credential file"));
      expect(readCredentialText(empty.file)).toBe("");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  describe("reads after a native keychain call see the file as it is then", () => {
    it.live("keeps a Registry written while the keychain write failed", () =>
      Effect.gen(function* () {
        let file = "";
        const fixture = yield* storeFixture({
          tier: "keychain",
          state: "private",
          loader: Effect.succeed(
            nativeEntry({
              getPassword: found,
              setPassword: () => {
                addForeignRegistry(file);
                keychainFails();
              },
              deletePassword: succeeds,
            }),
          ),
        });
        file = fixture.file;
        const observed = yield* fixture.run(save);
        expect(Exit.isSuccess(observed.exit)).toBe(true);
        expect(
          Object.keys(decodeCredentialText(readCredentialText(file)).registries).sort(),
        ).toEqual([foreignRegistry, otherRegistry, registry].sort());
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.live("refuses a file corrupted while the keychain write failed and leaves it", () =>
      Effect.gen(function* () {
        let file = "";
        const fixture = yield* storeFixture({
          tier: "keychain",
          state: "private",
          loader: Effect.succeed(
            nativeEntry({
              getPassword: found,
              setPassword: () => {
                nodeFs.writeFileSync(file, "{ corrupt");
                keychainFails();
              },
              deletePassword: succeeds,
            }),
          ),
        });
        file = fixture.file;
        const observed = yield* fixture.run(save);
        expect(failureDetail(observed.exit)).toEqual(
          Option.some("Failed to parse credential file"),
        );
        expect(readCredentialText(file)).toBe("{ corrupt");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.live("warns about permissions loosened during the keychain read", () =>
      Effect.gen(function* () {
        let file = "";
        const fixture = yield* storeFixture({
          tier: "keychain",
          state: "private",
          loader: Effect.succeed(
            nativeEntry({
              getPassword: () => {
                nodeFs.chmodSync(file, 0o644);
                return null;
              },
              setPassword: succeeds,
              deletePassword: succeeds,
            }),
          ),
        });
        file = fixture.file;
        const observed = yield* fixture.run(save);
        expect(Exit.isSuccess(observed.exit)).toBe(true);
        expect(withoutRootWarning(observed.logs)).toEqual([permissiveWarning, permissiveWarning]);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.live("keeps a Registry written while the keychain entry was deleted", () =>
      Effect.gen(function* () {
        let file = "";
        const fixture = yield* storeFixture({
          tier: "keychain",
          state: "private",
          loader: Effect.succeed(
            nativeEntry({
              getPassword: found,
              setPassword: succeeds,
              deletePassword: () => addForeignRegistry(file),
            }),
          ),
        });
        file = fixture.file;
        const observed = yield* fixture.run(clear);
        expect(Exit.isSuccess(observed.exit)).toBe(true);
        expect(
          Object.keys(decodeCredentialText(readCredentialText(file)).registries).sort(),
        ).toEqual([foreignRegistry, otherRegistry].sort());
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.live("writes nothing when interrupted during the keychain module load", () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        let loads = 0;
        let keychainWrites = 0;
        const Entry = nativeEntry({
          getPassword: found,
          setPassword: () => {
            keychainWrites += 1;
          },
          deletePassword: succeeds,
        });
        const fixture = yield* storeFixture({
          tier: "keychain",
          state: "private",
          loader: Effect.suspend(() => {
            loads += 1;
            return loads === 1
              ? Effect.succeed(Entry)
              : Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never));
          }),
        });
        const fiber = yield* Effect.forkChild(fixture.run(save));
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);
        expect(keychainWrites).toBe(0);
        expect(readCredentialText(fixture.file)).toBe(withRegistry);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    // The file exists after the foreign write, so the fallback note is a debug fact.
    const writeSideLoadLogs: Record<FileState, ReadonlyArray<LogEntry>> = {
      absent: [
        fallbackReadNote("module-load-failed"),
        fallbackWrite("Debug", "module-load-failed"),
      ],
      private: [
        fallbackReadNote("module-load-failed"),
        fallbackWrite("Debug", "module-load-failed"),
      ],
      permissive: [
        permissiveWarning,
        fallbackReadNote("module-load-failed"),
        permissiveWarning,
        permissiveWarning,
        fallbackWrite("Debug", "module-load-failed"),
        permissiveWarning,
      ],
    };
    for (const state of fileStates) {
      it.live(
        `keeps a Registry written during a failed write-side module load, credential file ${state}`,
        () =>
          Effect.gen(function* () {
            let file = "";
            let loads = 0;
            const fixture = yield* storeFixture({
              tier: "keychain",
              state,
              loader: Effect.suspend(() => {
                loads += 1;
                if (loads > 1) addForeignRegistry(file);
                return Effect.fail(moduleLoadFailed());
              }),
            });
            file = fixture.file;
            const observed = yield* fixture.run(save);
            expect(Exit.isSuccess(observed.exit)).toBe(true);
            expect(loads).toBe(2);
            expect(withoutRootWarning(observed.logs)).toEqual(writeSideLoadLogs[state]);
            expect(observed.contentReads).toBe(3);
            expect(
              Object.keys(decodeCredentialText(readCredentialText(file)).registries).sort(),
            ).toEqual(
              (state === "absent"
                ? [foreignRegistry, registry]
                : [foreignRegistry, otherRegistry, registry]
              ).sort(),
            );
          }).pipe(Effect.provide(NodeServices.layer)),
      );
    }
  });
});
