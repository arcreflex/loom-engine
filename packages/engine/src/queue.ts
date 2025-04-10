interface Task<T = any> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

/**
 * A simple queue that processes asynchronous tasks (returning Promises)
 * one after another, ensuring serial execution.
 */
export class SerialQueue {
  private queue: Task[] = [];
  private isProcessing = false;

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift()!;

    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }

  get length(): number {
    return this.queue.length;
  }

  get processing(): boolean {
    return this.isProcessing;
  }
}
