import fs from 'fs';
import path from 'path';

export interface Logger {
  log: (msg: unknown) => void;
}

export function logPath(dataDir: string) {
  return path.join(dataDir, 'loom.log');
}

export function initializeLog(dataDir: string) {
  return fs.writeFileSync(logPath(dataDir), '', 'utf-8');
}

export function log(dataDir: string, msg: unknown) {
  const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
  const logMessage = `[${new Date().toISOString()}] ${str}\n`;
  fs.appendFileSync(logPath(dataDir), logMessage);
}
