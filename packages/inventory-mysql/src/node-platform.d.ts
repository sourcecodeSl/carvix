declare const process: { env: Record<string, string | undefined> };
declare function setTimeout(callback: () => void, milliseconds: number): number;
declare function clearTimeout(timeout: number): void;

declare module 'node:dns/promises' {
  export function lookup(
    hostname: string,
    options: { all: true; verbatim: true },
  ): Promise<Array<{ address: string; family: number }>>;
}

declare module 'node:net' {
  export function isIP(address: string): 0 | 4 | 6;
  export function connect(options: { host: string; port: number; family: 4 | 6 }): {
    setNoDelay(noDelay?: boolean): void;
    on(event: 'connect', listener: () => void): void;
    setKeepAlive(enable?: boolean): void;
  };
}
