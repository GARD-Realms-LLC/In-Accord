declare module "pg" {
  export type Notification = {
    channel: string;
    payload?: string;
  };

  export class PoolClient {
    query(text: string, values?: unknown[]): Promise<unknown>;
    on(event: "notification", listener: (message: Notification) => void): this;
    on(event: "error" | "end", listener: (error?: unknown) => void): this;
    release(): void;
  }

  export class Pool {
    constructor(config?: {
      connectionString?: string;
      max?: number;
      [key: string]: unknown;
    });
    connect(): Promise<PoolClient>;
    query(text: string, values?: unknown[]): Promise<unknown>;
  }
}
