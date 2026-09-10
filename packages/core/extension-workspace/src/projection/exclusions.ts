/**
 * Contributors a projection unit could not render, and the report an operator
 * reads because of it.
 *
 * A desired contributor whose package cannot be inspected cannot supply a row
 * in the unit it belongs to, so the truthful rendering omits it. Omission is
 * never silent: every site that renders or observes the unit reports the
 * exclusion, and keeps reporting it until the package is fixed or removed.
 *
 * @experimental This API is unstable and may change without notice.
 */

/** Why a desired contributor could not be rendered. */
export type ProjectionExclusionReason = "package-missing" | "package-invalid";

/** One desired contributor left out of its ownership unit. */
export interface ProjectionContributorExclusion {
  /** Extension name as the operator declared it. */
  readonly contributor: string;
  readonly reason: ProjectionExclusionReason;
  /**
   * The inspector's diagnostic sentence for an invalid package. Terminal
   * reports carry this sentence; the underlying error chain stays in
   * structured output.
   */
  readonly detail?: string;
}

const fileLabel = (targetFile: string): string => {
  const segments = targetFile.split(/[\\/]/);
  return segments[segments.length - 1] ?? targetFile;
};

const asSentenceBody = (detail: string): string => detail.trim().replace(/\.+$/, "");

/**
 * The operator-facing report: consequence, bundle, reason, remedy. It never
 * names the projection machinery and never carries the raw error chain.
 */
export const formatProjectionExclusion = (args: {
  readonly exclusion: ProjectionContributorExclusion;
  readonly targetFile: string;
}): string => {
  const { contributor, reason, detail } = args.exclusion;
  const file = fileLabel(args.targetFile);
  if (reason === "package-missing") {
    return `${contributor} was left out of ${file} because its package is missing. Remove it with \`axm knowledge uninstall ${contributor}\`, or restore its files and run \`axm sync\`.`;
  }
  const because =
    detail === undefined
      ? "because its package is invalid"
      : `because its package is invalid: ${asSentenceBody(detail)}`;
  return `${contributor} was left out of ${file} ${because}. Fix the file and run \`axm sync\`.`;
};

/** Format every exclusion recorded against one target file, in input order. */
export const formatProjectionExclusions = (args: {
  readonly exclusions: ReadonlyArray<ProjectionContributorExclusion>;
  readonly targetFile: string;
}): ReadonlyArray<string> =>
  args.exclusions.map((exclusion) =>
    formatProjectionExclusion({ exclusion, targetFile: args.targetFile }),
  );
