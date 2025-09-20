import fs from 'fs';
import path from 'path';

export interface Logger {
  log: (msg: unknown) => void;
}

export interface LogTail {
  [Symbol.asyncIterator](): AsyncIterator<string>;
  close(): void;
}

export function logPath(dataDir: string) {
  return path.join(dataDir, 'loom.log');
}

export function initializeLog(dataDir: string) {
  return fs.writeFileSync(logPath(dataDir), '', 'utf-8');
}

export function log(dataDir: string, msg: unknown) {
  const str =
    typeof msg === 'string'
      ? msg
      : msg instanceof Error
        ? msg.stack
        : JSON.stringify(msg);
  const logMessage = `[${new Date().toISOString()}] ${str}\n`;
  fs.appendFileSync(logPath(dataDir), logMessage);
}

class FileLogTail implements LogTail, AsyncIterator<string> {
  private fileHandle?: fs.promises.FileHandle;
  private watcher?: fs.FSWatcher;
  private queue: string[] = [];
  private pending: Array<(value: IteratorResult<string>) => void> = [];
  private closed = false;
  private leftover = '';
  private position = 0;
  private ready: Promise<void>;
  private reading: Promise<void> | null = null;
  private readonly filePath: string;
  private readonly fromEndBytes?: number;

  constructor(filePath: string, fromEndBytes?: number) {
    this.filePath = filePath;
    this.fromEndBytes = fromEndBytes;
    this.ready = this.initialize();
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return this;
  }

  async next(): Promise<IteratorResult<string>> {
    await this.ready;

    if (this.queue.length > 0) {
      const value = this.queue.shift()!;
      return { value, done: false };
    }

    if (this.closed) {
      return { value: undefined, done: true };
    }

    return await new Promise<IteratorResult<string>>(resolve => {
      this.pending.push(resolve);
    });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.watcher?.close();
    void this.fileHandle?.close();
    this.fileHandle = undefined;
    while (this.pending.length > 0) {
      const resolve = this.pending.shift()!;
      resolve({ value: undefined, done: true });
    }
  }

  private async initialize() {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    this.fileHandle = await fs.promises.open(this.filePath, 'a+');
    const stats = await this.fileHandle.stat();
    const offset = this.fromEndBytes
      ? Math.max(0, stats.size - Math.max(0, this.fromEndBytes))
      : 0;
    this.position = offset;
    await this.readNewData();
    this.watcher = fs.watch(this.filePath, eventType => {
      if (eventType === 'change') {
        this.triggerRead();
      }
    });
  }

  private triggerRead() {
    if (this.closed) {
      return;
    }
    if (!this.reading) {
      this.reading = this.readNewData().finally(() => {
        this.reading = null;
      });
    }
  }

  private async readNewData() {
    if (!this.fileHandle) {
      return;
    }
    const buffer = Buffer.alloc(4096);
    while (!this.closed) {
      const { bytesRead } = await this.fileHandle.read(
        buffer,
        0,
        buffer.length,
        this.position
      );
      if (bytesRead === 0) {
        break;
      }
      const chunk = buffer.toString('utf-8', 0, bytesRead);
      this.position += bytesRead;
      this.consumeChunk(chunk);
    }
  }

  private consumeChunk(chunk: string) {
    const data = this.leftover + chunk;
    const parts = data.split('\n');
    this.leftover = parts.pop() ?? '';
    for (const line of parts) {
      this.enqueueLine(line + '\n');
    }
  }

  private enqueueLine(line: string) {
    if (this.pending.length > 0) {
      const resolve = this.pending.shift()!;
      resolve({ value: line, done: false });
    } else {
      this.queue.push(line);
    }
  }
}

export function tailEngineLog(
  dataDir: string,
  options?: { fromEndBytes?: number }
): LogTail {
  const file = logPath(dataDir);
  return new FileLogTail(file, options?.fromEndBytes);
}
