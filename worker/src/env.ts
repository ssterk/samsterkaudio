export type ProcessMessage = {
  trackVersionId: string;
};

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  PROCESS_QUEUE: Queue<ProcessMessage>;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}
