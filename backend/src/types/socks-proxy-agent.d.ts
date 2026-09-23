// socks-proxy-agent публикует типы только через package.json "exports" (без
// "types"/"main" на верхнем уровне) — classic moduleResolution ("node"),
// используемый в этом проекте, такое не резолвит. Настоящий require()
// в скомпилированном JS резолвится Node'ом штатно (он "exports" понимает) —
// это чисто typescript-заглушка для компиляции.
declare module 'socks-proxy-agent' {
  import { Agent } from 'http';

  export class SocksProxyAgent extends Agent {
    constructor(uri: string, opts?: unknown);
  }
}
