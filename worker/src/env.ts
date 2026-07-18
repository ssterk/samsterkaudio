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
  DROPBOX_APP_KEY: string;
  DROPBOX_APP_SECRET: string;
  DROPBOX_TOKEN_ENCRYPTION_KEY: string;
}
