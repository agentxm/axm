import * as Effect from "effect/Effect";
import { Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";

export const keepSourceFlag = Flag.boolean("keep-source").pipe(
  Flag.withDescription("Unmanage the extension but preserve its workspace source package"),
);

export const deleteSourceFlag = Flag.boolean("delete-source").pipe(
  Flag.withDescription("Delete the authoritative workspace source package after confirmation"),
);

export const resolveSourceDisposition = (keepSource: boolean, deleteSource: boolean) => {
  if (keepSource && deleteSource) {
    return Effect.fail(
      makeAppError({
        code: "usage",
        detail: "--keep-source and --delete-source are mutually exclusive",
      }),
    );
  }
  return Effect.succeed<"keep" | "delete" | undefined>(
    keepSource ? "keep" : deleteSource ? "delete" : undefined,
  );
};
