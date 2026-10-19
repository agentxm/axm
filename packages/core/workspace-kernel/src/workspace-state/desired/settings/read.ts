/** The strict `axm.json` read: raw bytes, then JSON parse and schema decode. */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import { formatSchemaIssuesToLines } from "@agentxm/extension-model/unstable/schema-issues";
import type { RawSourceBytes } from "../source-bytes.js";
import { SettingsDecodeError, SettingsIoError, SettingsParseError } from "./errors.js";
import { SettingsSchema } from "./schema.js";

/** The settings bytes at `settingsPath`, or none when the file is absent. */
export const readSettingsBytes = Effect.fn("workspace.read-model.state.settings.raw")(
  function* (deps: { readonly fs: FileSystem.FileSystem; readonly settingsPath: string }) {
    const { fs, settingsPath } = deps;
    const exists = yield* fs
      .exists(settingsPath)
      .pipe(Effect.mapError((cause) => new SettingsIoError({ path: settingsPath, cause })));
    if (!exists) return Option.none<RawSourceBytes>();
    const bytes = yield* fs
      .readFileString(settingsPath)
      .pipe(Effect.mapError((cause) => new SettingsIoError({ path: settingsPath, cause })));
    return Option.some<RawSourceBytes>({ path: settingsPath, bytes });
  },
);

/** Decode settings bytes with the same strict schema policy for every caller. */
export const decodeSettingsBytes = Effect.fn("workspace.read-model.state.settings.decode")(
  function* (path: string, bytes: string) {
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(bytes),
      catch: (): SettingsParseError =>
        new SettingsParseError({
          path,
          raw: "[Settings input withheld]",
          cause: new Error("Settings JSON syntax is invalid; input values are withheld"),
        }),
    });
    return yield* Schema.decodeUnknownEffect(SettingsSchema)(parsed, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError(
        (error) =>
          new SettingsDecodeError({
            path,
            issues:
              typeof parsed === "object" && parsed !== null && "mcpServers" in parsed
                ? SchemaIssue.makeFormatterStandardSchemaV1()(error.issue)
                    .issues.slice(0, 5)
                    .map(
                      (item) =>
                        `${(item.path ?? []).map((part) => (typeof part === "object" && part !== null && "key" in part ? String(part.key) : String(part))).join(".")}: invalid settings value (MCP input values withheld)`,
                    )
                : formatSchemaIssuesToLines(error.issue),
            raw:
              typeof parsed === "object" && parsed !== null && "mcpServers" in parsed
                ? "[MCP settings input withheld]"
                : parsed,
          }),
      ),
    );
  },
);
