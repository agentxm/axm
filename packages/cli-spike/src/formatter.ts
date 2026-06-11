import * as Schema from "effect/Schema";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";
import { CliOutput } from "effect/unstable/cli";
import {
  JsonHelpDocSchema,
  JsonVersionDocSchema,
  isSubcommandDoc,
  toJsonHelpDoc,
  type JsonHelpDoc,
  type JsonVersionDoc,
} from "@agentxm/client-core/unstable/cli-runtime";

export { JsonHelpDocSchema, JsonVersionDocSchema, type JsonHelpDoc, type JsonVersionDoc };

const getVisibleGlobalFlags = (doc: HelpDoc): HelpDoc["globalFlags"] => {
  if (!isSubcommandDoc(doc)) {
    return doc.globalFlags;
  }

  const globalFlags = doc.globalFlags?.filter((flag) => flag.name === "json");
  return globalFlags !== undefined && globalFlags.length > 0 ? globalFlags : undefined;
};

const getAdjustedHelpDoc = (doc: HelpDoc): HelpDoc => {
  if (!isSubcommandDoc(doc)) {
    return doc;
  }

  const visibleGlobalFlags = getVisibleGlobalFlags(doc);
  const { globalFlags: _globalFlags, ...rest } = doc;
  return visibleGlobalFlags === undefined ? rest : { ...rest, globalFlags: visibleGlobalFlags };
};

export const makeSpikeFormatter = (options?: {
  readonly json?: boolean | undefined;
}): CliOutput.Formatter => {
  const base = CliOutput.defaultFormatter();
  const json = options?.json === true;

  return {
    ...base,

    formatHelpDoc: (doc: HelpDoc): string =>
      json
        ? JSON.stringify(
            Schema.encodeSync(JsonHelpDocSchema)(toJsonHelpDoc(getAdjustedHelpDoc(doc))),
            null,
            2,
          )
        : base.formatHelpDoc(getAdjustedHelpDoc(doc)),

    formatVersion: (name: string, version: string): string =>
      json
        ? JSON.stringify(
            Schema.encodeSync(JsonVersionDocSchema)({
              type: "version",
              name,
              version,
            }),
            null,
            2,
          )
        : version,

    formatErrors: (errors) => base.formatErrors(errors),
  };
};
