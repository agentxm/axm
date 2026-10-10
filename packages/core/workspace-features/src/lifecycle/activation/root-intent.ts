import * as Effect from "effect/Effect";
import { formatFqn, parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { installRefused } from "@agentxm/workspace-kernel/operations";

/** Root activation names one unversioned extension identity. */
export const resolveRootActivationIntent = Effect.fn("SetActivation.resolveRootIntent")(function* (
  input: string,
) {
  const parsed = parseExtensionFqnParts(input.trim());
  if (parsed === undefined)
    return yield* installRefused({
      category: "usage",
      detail:
        "Root enable and disable require an unversioned extension FQN (@owner/<plural-type>/<name>)",
      suggestions: [
        {
          description:
            "Use an unversioned FQN from axm list, or the matching typed enable/disable command with a local name.",
        },
      ],
    });
  return { ...parsed, fqn: formatFqn(parsed) };
});
