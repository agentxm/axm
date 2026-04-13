import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Verbosity } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { effectCliExit } from "@axm.sh/core/unstable/cli-runtime";
import type { SourceHostConfig } from "@axm.sh/core/unstable/settings";
import {
  diagnoseWorkspaceDoctor,
  WorkspaceDoctorReportSchema,
  type WorkspaceScope,
} from "@axm.sh/core/unstable/workspace";

import { renderHumanReport } from "./render.js";

const DoctorDocumentFields = {
  data: WorkspaceDoctorReportSchema,
} satisfies Schema.Struct.Fields;

export const handleDoctor = Effect.fn("Doctor.handle")(function* (args: {
  readonly scope: WorkspaceScope;
  readonly builtInSources: ReadonlyArray<SourceHostConfig>;
}) {
  const renderer = yield* CliRenderer;
  const verbosity = yield* Verbosity;
  const report = yield* diagnoseWorkspaceDoctor({
    scope: args.scope,
    builtInSources: args.builtInSources,
  });

  const handledByMachine = yield* renderer.document(
    "doctor",
    { data: report },
    DoctorDocumentFields,
  );

  if (!handledByMachine) {
    const lines = renderHumanReport(report, verbosity.level);
    yield* Effect.forEach(lines, (line) => renderer.info(line), { discard: true });
  }

  if (!report.healthy) {
    return yield* Effect.die(effectCliExit(1));
  }
});
