export interface DisplayPathService {
  readonly join: (...paths: string[]) => string;
  readonly normalize: (path: string) => string;
}

export const joinDisplayPath = (
  path: DisplayPathService,
  first: string,
  ...rest: string[]
): string => path.normalize(path.join(first, ...rest));

export const formatDisplayPath = (path: DisplayPathService, value: string): string =>
  path.normalize(value);
