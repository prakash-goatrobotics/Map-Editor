import Worker from "./PGMWorker?worker";

export default class PGMWorkerManager {
  private static instance: PGMWorkerManager;
  private worker = new Worker();

  private queue: Array<{
    message: any;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private processing: boolean = false;

  private constructor() {
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", (err) => {
      console.error("[PGMWorkerManager] Worker error:", err);
    });
  }

  public static getInstance(): PGMWorkerManager {
    if (!PGMWorkerManager.instance) {
      PGMWorkerManager.instance = new PGMWorkerManager();
    }
    return PGMWorkerManager.instance;
  }

  private handleMessage = (event: MessageEvent) => {
    if (this.queue.length === 0) {
      return;
    }
    const { resolve } = this.queue.shift()!;
    resolve(event.data);
    this.processing = false;
    this.processNext();
  };

  public process(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ message, resolve, reject });
      if (!this.processing) {
        this.processNext();
      }
    });
  }

  private processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    if (this.processing) {
      return;
    }
    const { message } = this.queue[0];
    this.processing = true;
    try {
      this.worker.postMessage(message);
    } catch (err) {
      console.error(err);
      const { reject } = this.queue.shift()!;
      reject(err);
      this.processing = false;
      this.processNext();
    }
  }
}