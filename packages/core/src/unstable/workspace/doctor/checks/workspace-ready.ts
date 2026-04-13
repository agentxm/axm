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
  readonly axmDirWritable: boolean;
  readonly settingsPath: string;
  readonly settingsReadable: boolean;
  readonly settingsReadResult: JsonFileReadResult<unknown>;
}

const MAX_SCHEMA_ISSUES = 3;

const INIT_WORKSPACE_ACTION: Action = {
  label: "Initialize workspace",
  description: "Create .axm/ and settings.json",
  command: "axm init",
};

const EDIT_SETTINGS_ACTION: Action = {
  label: "Edit settings.json",
  description: "Fix settings.json and rerun doctor",
};

const FIX_PERMISSIONS_ACTION: Action = {
  label: "Fix filesystem permissions",
  description: "Grant axm access to this workspace",
};

const CHECK_FILESYSTEM_ACCESS_ACTION: Action = {
  label: "Check filesystem access",
  description: "Resolve the settings.json read failure and rerun doctor",
};

const canAccess = (
  filePath: string,
  options?: { readonly readable?: boolean; readonly writable?: boolean },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.match(fs.access(filePath, options), {
      onFailure: () => false,
      onSuccess: () => true,
    });
  });

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
        axmDirWritable: false,
        settingsPath,
        settingsReadable: false,
        settingsReadResult: { _tag: "missing" } as const,
      } satisfies WorkspaceReadyContext;
    }

    const axmDirWritable = yield* canAccess(workspace.path, { writable: true });
    const settingsReadable = yield* canAccess(settingsPath, { readable: true });
    const settingsReadResult = yield* readAndValidateJsonFile(settingsPath, SettingsSchema, {
      maxSchemaIssues: MAX_SCHEMA_ISSUES,
    });
    return {
      axmDir: workspace.path,
      axmDirExists,
      axmDirWritable,
      settingsPath,
      settingsReadable,
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

const notWritableDiagnostic: WorkspaceReadyDiagnostic = {
  id: "workspace-ready.not-writable",
  run: (ctx) => {
    if (!ctx.axmDirExists) {
      return Effect.succeed([]);
    }

    if (!ctx.axmDirWritable) {
      return Effect.succeed([
        {
          id: "workspace-ready.not-writable",
          severity: "error",
          message: ".axm directory is not writable",
          subject: { kind: "workspace", ref: ctx.axmDir },
          action: FIX_PERMISSIONS_ACTION,
        } satisfies Finding,
      ]);
    }

    if (ctx.settingsReadResult._tag === "missing" || ctx.settingsReadable) {
      return Effect.succeed([]);
    }

    return Effect.succeed([
      {
        id: "workspace-ready.not-writable",
        severity: "error",
        message: `${SETTINGS_FILENAME} cannot be accessed with the current file permissions`,
        subject: { kind: "file", ref: ctx.settingsPath },
        action: FIX_PERMISSIONS_ACTION,
      } satisfies Finding,
    ]);
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
      action: EDIT_SETTINGS_ACTION,
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
      action: EDIT_SETTINGS_ACTION,
    };
    return Effect.succeed([finding]);
  },
};

const settingsReadFailureDiagnostic: WorkspaceReadyDiagnostic = {
  id: "workspace-ready.settings-read-failure",
  run: (ctx) => {
    const result = ctx.settingsReadResult;
    if (result._tag !== "read-failure" || !ctx.settingsReadable) {
      return Effect.succeed([]);
    }
    const finding: Finding = {
      id: "workspace-ready.settings-read-failure",
      severity: "error",
      message: `${SETTINGS_FILENAME} could not be read`,
      subject: { kind: "file", ref: ctx.settingsPath },
      details: result.error,
      action: CHECK_FILESYSTEM_ACCESS_ACTION,
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
      notWritableDiagnostic,
      settingsMissingDiagnostic,
      settingsReadFailureDiagnostic,
      settingsUnparseableDiagnostic,
      settingsSchemaInvalidDiagnostic,
    ],
  });
