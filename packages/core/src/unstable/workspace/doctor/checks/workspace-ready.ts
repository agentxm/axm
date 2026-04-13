import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { readAndValidateJsonFile, type JsonFileReadResult } from "../../../schema/index.js";
import { SETTINGS_FILENAME, SettingsSchema } from "../../../settings/index.js";
import type { WorkspaceLocation } from "../../paths.js";
import { defineCheck, type DiagnosticDef } from "../check-def.js";
import { CHECK_IDS, type Action, type Finding } from "../types.js";

interface WorkspaceReadyContext {
  readonly axmDir: string;
  readonly axmDirExists: boolean;
  readonly settingsPath: string;
  readonly settingsReadResult: JsonFileReadResult<unknown>;
}

const MAX_SCHEMA_ISSUES = 3;

const INIT_WORKSPACE_ACTION: Action = {
  label: "Initialize workspace",
  description: "Create .axm/ and settings.json",
  command: "axm init",
};

const prepareContext = (workspace: WorkspaceLocation) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const axmDirExists = yield* Effect.match(fs.exists(workspace.path), {
      onFailure: () => false,
      onSuccess: (value) => value,
    });

    const settingsPath = path.join(workspace.path, SETTINGS_FILENAME);

    if (!axmDirExists) {
      return {
        axmDir: workspace.path,
        axmDirExists,
        settingsPath,
        settingsReadResult: { _tag: "missing" } as const,
      } satisfies WorkspaceReadyContext;
    }

    const settingsReadResult = yield* readAndValidateJsonFile(settingsPath, SettingsSchema, {
      maxSchemaIssues: MAX_SCHEMA_ISSUES,
    });
    return {
      axmDir: workspace.path,
      axmDirExists,
      settingsPath,
      settingsReadResult,
    } satisfies WorkspaceReadyContext;
  });

type WorkspaceReadyDiagnostic = DiagnosticDef<
  WorkspaceReadyContext,
  FileSystem.FileSystem | Path.Path
>;

const directoryMissingDiagnostic: WorkspaceReadyDiagnostic = {
  id: "workspace-ready.directory-missing",
  run: (ctx) => {
    if (ctx.axmDirExists) {
      return Effect.succeed([]);
    }
    const finding: Finding = {
      id: "workspace-ready.directory-missing",
      severity: "error",
      message: ".axm directory not found",
      subject: { kind: "workspace", ref: ctx.axmDir },
      action: INIT_WORKSPACE_ACTION,
    };
    return Effect.succeed([finding]);
  },
};

const settingsMissingDiagnostic: WorkspaceReadyDiagnostic = {
  id: "workspace-ready.settings-missing",
  run: (ctx) => {
    if (!ctx.axmDirExists || ctx.settingsReadResult._tag !== "missing") {
      return Effect.succeed([]);
    }
    const finding: Finding = {
      id: "workspace-ready.settings-missing",
      severity: "error",
      message: `${SETTINGS_FILENAME} not found at ${ctx.settingsPath}`,
      subject: { kind: "file", ref: ctx.settingsPath },
      action: INIT_WORKSPACE_ACTION,
    };
    return Effect.succeed([finding]);
  },
};

const settingsUnparseableDiagnostic: WorkspaceReadyDiagnostic = {
  id: "workspace-ready.settings-unparseable",
  run: (ctx) => {
    const result = ctx.settingsReadResult;
    if (result._tag !== "unparseable") {
      return Effect.succeed([]);
    }
    const detailLines: Array<string> = [result.error];
    if (result.location !== undefined) {
      detailLines.push(result.location);
    }
    const finding: Finding = {
      id: "workspace-ready.settings-unparseable",
      severity: "error",
      message: `${SETTINGS_FILENAME} is not valid JSON`,
      subject: { kind: "file", ref: ctx.settingsPath },
      details: detailLines.join("\n"),
      action: INIT_WORKSPACE_ACTION,
    };
    return Effect.succeed([finding]);
  },
};

const settingsSchemaInvalidDiagnostic: WorkspaceReadyDiagnostic = {
  id: "workspace-ready.settings-schema-invalid",
  run: (ctx) => {
    const result = ctx.settingsReadResult;
    if (result._tag !== "schema-invalid") {
      return Effect.succeed([]);
    }
    const finding: Finding = {
      id: "workspace-ready.settings-schema-invalid",
      severity: "error",
      message: `${SETTINGS_FILENAME} does not match the expected schema`,
      subject: { kind: "file", ref: ctx.settingsPath },
      details: result.issues.join("\n"),
      action: INIT_WORKSPACE_ACTION,
    };
    return Effect.succeed([finding]);
  },
};

const settingsReadFailureDiagnostic: WorkspaceReadyDiagnostic = {
  id: "workspace-ready.settings-read-failure",
  run: (ctx) => {
    const result = ctx.settingsReadResult;
    if (result._tag !== "read-failure") {
      return Effect.succeed([]);
    }
    const finding: Finding = {
      id: "workspace-ready.settings-read-failure",
      severity: "error",
      message: `${SETTINGS_FILENAME} could not be read`,
      subject: { kind: "file", ref: ctx.settingsPath },
      details: result.error,
      action: INIT_WORKSPACE_ACTION,
    };
    return Effect.succeed([finding]);
  },
};

export const makeWorkspaceReadyCheck = (workspace: WorkspaceLocation) =>
  defineCheck({
    id: CHECK_IDS.workspaceReady,
    title: "Workspace is ready",
    description:
      "Verifies .axm exists and settings.json is readable, parseable JSON, and matches the schema.",
    dependsOn: [],
    prepareContext: prepareContext(workspace),
    diagnostics: [
      directoryMissingDiagnostic,
      settingsMissingDiagnostic,
      settingsReadFailureDiagnostic,
      settingsUnparseableDiagnostic,
      settingsSchemaInvalidDiagnostic,
    ],
  });
