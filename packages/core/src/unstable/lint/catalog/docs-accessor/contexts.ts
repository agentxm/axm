import type { DocsAccessor, DocsRuleContext } from "../../context.js";

export interface InstalledDocsInfo {
  readonly docsJson: unknown;
  readonly displayRoot: string;
  readonly files: DocsAccessor;
}

export const buildDocsRuleContexts = (input: {
  readonly installedDocs: ReadonlyArray<InstalledDocsInfo>;
}): ReadonlyArray<DocsRuleContext> =>
  input.installedDocs.map(
    (info): DocsRuleContext => ({
      subject: {
        docsJson: info.docsJson,
      },
      files: info.files,
      displayRoot: info.displayRoot,
    }),
  );
