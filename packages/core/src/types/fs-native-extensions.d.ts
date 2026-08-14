declare module "fs-native-extensions" {
  /** Attempt an exclusive advisory OS lock without blocking. */
  export function tryLock(fileDescriptor: number): boolean;

  /** Release a lock held by this descriptor. */
  export function unlock(fileDescriptor: number): void;
}
