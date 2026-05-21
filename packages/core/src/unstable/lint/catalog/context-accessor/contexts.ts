import type { ContextAccessor, ContextRuleContext } from "../../context.js";

export interface InstalledContextInfo {
  readonly contextJson: unknown;
  readonly displayRoot: string;
  readonly files: ContextAccessor;
}

export const buildContextRuleContexts = (input: {
  readonly installedContext: ReadonlyArray<InstalledContextInfo>;
}): ReadonlyArray<ContextRuleContext> =>
  input.installedContext.map(
    (info): ContextRuleContext => ({
      subject: {
        contextJson: info.contextJson,
      },
      files: info.files,
      displayRoot: info.displayRoot,
    }),
  );
