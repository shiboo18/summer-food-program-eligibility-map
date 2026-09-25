export interface RuntimeInfo {
  readonly electron: string;
  readonly chromium: string;
  readonly node: string;
  readonly platform: string;
}

export function formatRuntimeSummary(runtime: RuntimeInfo): string {
  return `Electron ${runtime.electron} · Chromium ${runtime.chromium} · Node.js ${runtime.node}`;
}
