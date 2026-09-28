// qz-tray ships no types (plain UMD JS) — this declares only the small
// surface this app actually calls, not the library's full API.
declare module "qz-tray" {
  interface QzConfig {
    getPrinter(): string;
  }

  const qz: {
    websocket: {
      isActive(): boolean;
      connect(options?: { retries?: number; delay?: number }): Promise<void>;
    };
    printers: {
      find(query?: string): Promise<string | string[]>;
    };
    configs: {
      create(printer: string, options?: Record<string, unknown>): QzConfig;
    };
    print(config: QzConfig, data: string[]): Promise<void>;
  };

  export default qz;
}
