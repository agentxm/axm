export interface DisplayPathService {
  readonly normalize: (path: string) => string;
}

export const formatDisplayPath = (path: DisplayPathService, value: string): string =>
  path.normalize(value);
