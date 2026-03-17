declare module "basic-ftp" {
  export type AccessOptions = {
    host: string;
    port?: number;
    user?: string;
    password?: string;
    secure?: boolean;
  };

  export class Client {
    ftp: { verbose: boolean };
    access(options: AccessOptions): Promise<void>;
    ensureDir(remoteDirPath: string): Promise<void>;
    uploadFrom(source: NodeJS.ReadableStream, remotePath: string): Promise<void>;
    close(): void;
  }
}
