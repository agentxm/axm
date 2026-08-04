import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";

/**
 * `axm rules enable|disable` used to toggle instruction-file management. Those
 * verbs now activate a rule extension, so a bare invocation is a usage error
 * that names where the old spelling moved rather than silently doing something
 * different.
 */
export const requireRuleName = Effect.fn("Rules.requireRuleName")(function* (
  name: Option.Option<string>,
  verb: "enable" | "disable",
) {
  if (Option.isSome(name)) return name.value;
  return yield* makeAppError({
    code: "usage",
    detail: `axm rules ${verb} now takes the name of a rule to ${verb}`,
    suggestions: [
      {
        description: `${verb === "enable" ? "Enable" : "Disable"} instruction-file management`,
        cmd: `axm rules instructions ${verb}`,
      },
      { description: "Inspect installed rules", cmd: "axm rules list" },
    ],
  });
});
