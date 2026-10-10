import { Flag } from "effect/cli";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { withParameterDescription } from "../cli-parameters.js";

/** Owner identity has one grammar; the command supplies its selection or grant role. */
export const ownerHandleFlag = Flag.String("owner").pipe(
  Flag.withMetavar("@handle"),
  Flag.mapTryCatch(
    normalizeHandle,
    () => "Expected an owner handle such as @acme; omit --owner for every owner",
  ),
);

export const creationOwnerFlag = ownerHandleFlag.pipe(
  withParameterDescription(
    "Owner to create under, such as @acme; else the workspace owner, which this sets if unset",
  ),
  Flag.optional,
);
