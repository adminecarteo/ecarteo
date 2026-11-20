export class ProductionCheckError extends Error {
  code: string;
  constructor(code: string);
}
export interface MonitorConfiguration {
  origin: string;
  healthToken: string;
  cleanupToken: string;
  apply: boolean;
}
export function monitorConfiguration(env: Record<string, string | undefined>): MonitorConfiguration;
export function runProductionMonitor(
  config: MonitorConfiguration,
  options?: {
    fetch?: typeof fetch;
    log?: (message: string) => void;
    pause?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    signal?: AbortSignal;
  },
): Promise<{
  status: 'ready';
  publicPages: number;
  eligible: number;
  removed: number;
  apply: boolean;
}>;
