import { Effect } from "effect";

declare const jobs: ReadonlyArray<string>;
declare const processJob: (job: string, signal: AbortSignal) => Promise<void>;
declare const refreshLease: () => Promise<void>;

export const runJobs = Effect.tryPromise(async () => {
  const controller = new AbortController();
  void refreshLease();
  await Promise.all(jobs.map((job) => processJob(job, controller.signal)));
});
