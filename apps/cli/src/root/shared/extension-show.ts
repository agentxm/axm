import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { handleLocalInspection, makeLocalShowCommand } from "../show/command.js";

export const handleExtensionShow = (args: {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly agents?: ReadonlyArray<string>;
}) =>
  handleLocalInspection({
    selection: { kind: "identities", identities: [args.name] },
    types: [args.type],
    ...(args.agents === undefined ? {} : { agents: args.agents }),
  });

export const makeExtensionShowCommand = makeLocalShowCommand;
