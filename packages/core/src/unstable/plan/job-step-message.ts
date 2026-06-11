/**
 * Job-step message helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

export const appendWarningsToMessage = (
  message: string,
  warnings: ReadonlyArray<string>,
): string => (warnings.length === 0 ? message : `${message}; ${warnings.join("; ")}`);
