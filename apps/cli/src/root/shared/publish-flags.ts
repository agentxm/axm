import { Flag } from "effect/unstable/cli";

import { onExistingPolicies } from "@agentxm/extension-publish";

export const backfillFlag = Flag.Boolean("backfill").pipe(
  Flag.withDescription("Publish an unpublished version lower than the highest published version"),
  Flag.withDefault(false),
);

export const onExistingFlag = Flag.Literals("on-existing", onExistingPolicies).pipe(
  Flag.withDescription(
    "Override existing-version policy (verify rebuilds the authored archive and requires its SHA-512 digest to match)",
  ),
  Flag.optional,
);
