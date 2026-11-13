import * as Effect from "effect/Effect";

/** The invocation already owns this exclusively opened receipt handle. */
export interface LocalTraceReceiptHandle {
  readonly write: (
    bytes: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ) => Promise<{ readonly bytesWritten: number }>;
  readonly truncate: (length: number) => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * Filesystem promises cannot be cancelled by interrupting their Effect waiter.
 * Keep ownership until the actual I/O settles, including after a deadline. An
 * abandoned snapshot retires this writer; cleanup follows its outstanding I/O.
 */
export const makeLocalTraceReceiptWriter = (handle: LocalTraceReceiptHandle) => {
  let available = true;
  let pendingWrite: Promise<void> | undefined;
  let pendingClose: Promise<void> | undefined;

  // This native promise owns each scheduled write/truncate until it settles.
  // Retirement stops further I/O; it cannot cancel an already scheduled call.
  const persist = async (data: string) => {
    const bytes = new TextEncoder().encode(data);
    let offset = 0;
    while (available && offset < bytes.length) {
      const remaining = bytes.length - offset;
      const { bytesWritten } = await handle.write(bytes, offset, remaining, offset);
      if (!Number.isInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > remaining) {
        available = false;
        return;
      }
      offset += bytesWritten;
    }
    if (available) await handle.truncate(bytes.length);
  };

  return {
    write: (data: string): Effect.Effect<void> =>
      Effect.suspend(() => {
        if (!available || pendingWrite !== undefined) return Effect.void;
        let settled = false;
        const pending = persist(data).then(
          () => {
            settled = true;
            pendingWrite = undefined;
          },
          () => {
            settled = true;
            available = false;
            pendingWrite = undefined;
          },
        );
        pendingWrite = pending;
        return Effect.promise(() => pending).pipe(
          Effect.timeoutOption("100 millis"),
          Effect.asVoid,
          Effect.ensuring(
            Effect.sync(() => {
              if (!settled) available = false;
            }),
          ),
        );
      }),
    close: Effect.suspend(() => {
      available = false;
      const pending =
        pendingClose ??
        (pendingWrite ?? Promise.resolve())
          .then(() => handle.close())
          .then(
            () => undefined,
            () => undefined,
          );
      pendingClose = pending;
      return Effect.promise(() => pending).pipe(
        Effect.interruptible,
        Effect.timeoutOption("25 millis"),
        Effect.asVoid,
      );
    }),
  };
};
