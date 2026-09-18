import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { Screen, fieldsDoc, headlineDoc, type ViewField } from "../../screen/index.js";
import { PackShowResultSchema, ShowPack, type PackShowResult } from "@agentxm/workspace/inspection";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { packInspectionRefusedToAppError } from "../inspection-errors.js";

type ShowRow = Omit<PackShowResult, "desiredDependencies"> & { readonly desiredCount: number };

const showFields: ReadonlyArray<ViewField<ShowRow>> = [
  { label: "Scope", value: (row) => row.scope },
  { label: "Pack", value: (row) => row.pack },
  { label: "Source authority", value: (row) => row.sourceAuthority },
  { label: "Canonical path", value: (row) => row.canonicalPath },
  { label: "Manifest version", value: (row) => row.manifestVersion },
  { label: "Resolution", value: (row) => row.acceptedResolution },
  { label: "Canonical", value: (row) => row.canonicalStatus },
  { label: "Desired members", value: (row) => String(row.desiredCount) },
  {
    label: "Problems",
    value: (row) => (row.problems.length === 0 ? "none" : row.problems.join("; ")),
  },
];

export const handlePacksShow = Effect.fn("PacksShow.handle")(function* (target: string) {
  const screen = yield* Screen;
  const result = yield* Effect.catchTag(
    ShowPack.query({ target }),
    "PackInspectionRefused",
    (failure) => Effect.fail(packInspectionRefusedToAppError(failure)),
  );
  if (yield* screen.document(result, PackShowResultSchema)) return;
  yield* screen.result([
    ...headlineDoc("neutral", `Pack ${result.pack}`),
    ...fieldsDoc(
      {
        scope: result.scope,
        pack: result.pack,
        sourceAuthority: result.sourceAuthority,
        canonicalPath: result.canonicalPath,
        manifestVersion: result.manifestVersion,
        acceptedResolution: result.acceptedResolution,
        canonicalStatus: result.canonicalStatus,
        desiredCount: result.desiredDependencies.length,
        problems: result.problems,
      },
      showFields,
    ),
  ]);
});

const showConfig = {
  target: Argument.String("extension").pipe(
    Argument.withDescription("Configured pack name or fully qualified identity"),
  ),
  scope: scopeFlag.pipe(Flag.withDescription("Inspect project (default) or user-level pack state")),
} as const;

export const showCommand = Command.make("show", showConfig, ({ target, scope }) =>
  handlePacksShow(target).pipe(withWorkspace(scope), withRuntime("packs show")),
).pipe(
  withArgvTracking(showConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Inspect desired, accepted, and canonical pack state"),
  Command.withExamples([
    {
      command: "axm packs show my-pack",
      description: "Inspect a configured pack by name",
    },
    {
      command: "axm packs show @acme/packs/my-pack --json",
      description: "Emit structured pack state",
    },
  ]),
);
