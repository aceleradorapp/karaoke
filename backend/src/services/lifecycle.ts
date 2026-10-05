export const RESTART_EXIT_CODE = 75;
export const SUPERVISED_ENV = 'CARAOKE_SUPERVISED';

type RestartHandler = () => Promise<void> | void;

let restartHandler: RestartHandler | null = null;

export function isSupervised(): boolean {
  return process.env[SUPERVISED_ENV] === '1';
}

export function setRestartHandler(handler: RestartHandler | null): void {
  restartHandler = handler;
}

export async function requestRestart(): Promise<void> {
  await restartHandler?.();
}
