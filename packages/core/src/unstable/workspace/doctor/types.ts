import * as Schema from "effect/Schema";

import { WORKSPACE_SCOPES } from "../scope.js";

export const FindingSeveritySchema = Schema.Literals(["info", "warn", "error"] as const);
export type FindingSeverity = typeof FindingSeveritySchema.Type;

export const CheckStatusSchema = Schema.Literals(["pass", "warn", "fail", "skip"] as const);
export type CheckStatus = typeof CheckStatusSchema.Type;

export const FindingSubjectSchema = Schema.Struct({
  kind: Schema.Literals(["extension", "agent", "file", "workspace"] as const),
  ref: Schema.String,
});
export type FindingSubject = typeof FindingSubjectSchema.Type;

export const ActionSchema = Schema.Struct({
  label: Schema.String,
  description: Schema.String,
  command: Schema.optional(Schema.String),
  docs: Schema.optional(Schema.String),
});
export type Action = typeof ActionSchema.Type;

export const FindingSchema = Schema.Struct({
  id: Schema.String,
  severity: FindingSeveritySchema,
  message: Schema.String,
  subject: Schema.optional(FindingSubjectSchema),
  details: Schema.optional(Schema.String),
  action: Schema.optional(ActionSchema),
});
export type Finding = typeof FindingSchema.Type;

export const CheckSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  dependsOn: Schema.Array(Schema.String),
  status: CheckStatusSchema,
  skipReason: Schema.optional(Schema.String),
  findings: Schema.Array(FindingSchema),
});
export type Check = typeof CheckSchema.Type;

export const ReportSummarySchema = Schema.Struct({
  checks: Schema.Struct({
    passed: Schema.Number,
    warned: Schema.Number,
    failed: Schema.Number,
    skipped: Schema.Number,
    info: Schema.Number,
  }),
  findings: Schema.Struct({
    errors: Schema.Number,
    warnings: Schema.Number,
    info: Schema.Number,
  }),
});
export type ReportSummary = typeof ReportSummarySchema.Type;

export const WorkspaceDoctorReportSchema = Schema.Struct({
  scope: Schema.Literals(WORKSPACE_SCOPES),
  workspacePath: Schema.String,
  healthy: Schema.Boolean,
  summary: ReportSummarySchema,
  checks: Schema.Array(CheckSchema),
});
export type WorkspaceDoctorReport = typeof WorkspaceDoctorReportSchema.Type;

export const CHECK_IDS = {
  workspaceReady: "workspace-ready",
  agentsConfigured: "agents-configured",
  extensionsInstalled: "extensions-installed",
  extensionsCurrent: "extensions-current",
} as const satisfies Record<
  "workspaceReady" | "agentsConfigured" | "extensionsInstalled" | "extensionsCurrent",
  string
>;

export type CheckId = (typeof CHECK_IDS)[keyof typeof CHECK_IDS];
