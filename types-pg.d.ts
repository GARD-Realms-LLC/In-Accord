declare module "pg" {
  export class Pool {
    constructor(config?: {
      connectionString?: string;
      max?: number;
      [key: string]: unknown;
    });
  }
}
