import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { WorkspaceReadViews } from "@agentxm/workspace-kernel/workspace-state";
import { withInspectionReadView } from "../read-view.js";

interface ReadDiagnostic {
  readonly code: "inspection-read-changed";
  readonly source: "inspection";
  readonly path: string;
  readonly message: string;
}
class InspectionContentReads extends Context.Service<
  InspectionContentReads,
  {
    readonly diagnostics: ReadonlyArray<ReadDiagnostic>;
  }
>()("@agentxm/workspace-features/inspection/InspectionContentReads") {}

export const inspectionReadDiagnostics = Effect.map(
  Effect.serviceOption(InspectionContentReads),
  (view) => (Option.isSome(view) ? [...view.value.diagnostics] : []),
);

const fingerprint = (info: FileSystem.File.Info) =>
  JSON.stringify([
    info.type,
    String(info.dev),
    Option.getOrUndefined(Option.map(info.ino, String)),
    String(info.size),
    info.mode,
    Option.getOrUndefined(Option.map(info.mtime, (date) => date.getTime())),
    Option.getOrUndefined(Option.map(info.birthtime, (date) => date.getTime())),
  ]);

/** One invocation shares physical content bytes; changed identities invalidate captured input. */
export const withLocalInspectionReadView = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = new Map<string, string>();
    const cells = new Map<
      string,
      { readonly identity: string; readonly read: ReturnType<FileSystem.FileSystem["readFile"]> }
    >();
    const diagnostics: Array<ReadDiagnostic> = [];
    const changed = (file: string) => {
      if (!diagnostics.some((diagnostic) => diagnostic.path === file))
        diagnostics.push({
          code: "inspection-read-changed",
          source: "inspection",
          path: file,
          message:
            "Content or an alias changed during this inspection; the answer contains bounded observations and is not a transactional snapshot.",
        });
    };
    const readFile: FileSystem.FileSystem["readFile"] = (file) =>
      Effect.gen(function* () {
        const physical = yield* fs.realPath(file);
        const priorPath = paths.get(file);
        if (priorPath !== undefined && priorPath !== physical) changed(file);
        paths.set(file, physical);
        const before = fingerprint(yield* fs.stat(physical));
        const prior = cells.get(physical);
        if (prior !== undefined && prior.identity === before) return yield* prior.read;
        if (prior !== undefined) changed(file);
        const captured = yield* Effect.cached(
          Effect.gen(function* () {
            const bytes = yield* fs.readFile(physical);
            if (fingerprint(yield* fs.stat(physical)) !== before) changed(file);
            return bytes;
          }),
        );
        const concurrent = cells.get(physical);
        if (concurrent !== undefined && concurrent.identity === before)
          return yield* concurrent.read;
        cells.set(physical, { identity: before, read: captured });
        return yield* captured;
      });
    const captured = FileSystem.make({ ...fs, readFile });
    const factory = yield* Effect.serviceOption(WorkspaceReadViews);
    const query = withInspectionReadView(effect);
    const capturing = Option.isNone(factory)
      ? query
      : query.pipe(
          Effect.provideService(WorkspaceReadViews, {
            capture: (options) => factory.value.capture({ ...options, fileSystem: captured }),
          }),
        );
    return yield* capturing.pipe(
      Effect.provideService(FileSystem.FileSystem, captured),
      Effect.provideService(InspectionContentReads, { diagnostics }),
    );
  });
