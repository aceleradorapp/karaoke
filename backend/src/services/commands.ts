import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export interface CommandOptions {
  timeoutMs: number;
}

export async function runCommand(file: string, args: string[], options: CommandOptions): Promise<string> {
  const { stdout } = await execFileAsync(file, args, {
    timeout: options.timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  return stdout;
}
