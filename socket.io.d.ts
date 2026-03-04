declare module "socket.io" {
  export class Server {
    constructor(...args: any[]);
    on(...args: any[]): any;
    emit(...args: any[]): any;
    to(...args: any[]): any;
  }
}
