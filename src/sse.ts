import type { SSEEvent } from './types';

export interface SSEManagerOptions {
  url: string;
  apiKey: string;
  onEvent: (event: SSEEvent) => void;
  onError: (error: Error) => void;
  retryDelay?: number;
  maxRetryDelay?: number;
}

export class SSEManager {
  private abortController: AbortController | null = null;
  private retryCount = 0;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  private readonly url: string;
  private readonly apiKey: string;
  private readonly onEvent: (event: SSEEvent) => void;
  private readonly onError: (error: Error) => void;
  private readonly retryDelay: number;
  private readonly maxRetryDelay: number;

  constructor(options: SSEManagerOptions) {
    this.url = options.url;
    this.apiKey = options.apiKey;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
    this.retryDelay = options.retryDelay ?? 1000;
    this.maxRetryDelay = options.maxRetryDelay ?? 30_000;
  }

  connect(): void {
    if (this.destroyed) return;

    this.abortController = new AbortController();

    fetch(this.url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'text/event-stream',
      },
      signal: this.abortController.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }
        if (!response.body) {
          throw new Error('SSE response has no body');
        }

        this.retryCount = 0;
        this.readStream(response.body);
      })
      .catch((err: unknown) => {
        if (this.destroyed) return;
        if (this.isAbortError(err)) return;

        this.onError(err instanceof Error ? err : new Error(String(err)));
        this.reconnect();
      });
  }

  destroy(): void {
    this.destroyed = true;
    this.abortController?.abort();
    this.abortController = null;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5).trim();
          } else if (line === '') {
            // Empty line = end of event
            if (currentData) {
              this.handleEvent(currentEvent, currentData);
            }
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (err: unknown) {
      if (this.destroyed) return;
      if (this.isAbortError(err)) return;

      this.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      reader.releaseLock();
    }

    // Stream ended — reconnect if not destroyed
    if (!this.destroyed) {
      this.reconnect();
    }
  }

  private handleEvent(eventType: string, data: string): void {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      // SSE "event:" field is the authoritative event type
      if (eventType) {
        parsed.type = eventType;
      }
      this.onEvent(parsed as SSEEvent);
    } catch {
      // Malformed event data, skip
    }
  }

  private reconnect(): void {
    if (this.destroyed) return;

    const delay = this.getBackoffDelay();
    this.retryCount++;
    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      this.connect();
    }, delay);
  }

  /** Safari/WebKit throws TypeError instead of AbortError when a fetch is aborted */
  private isAbortError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    if (err.name === 'AbortError') return true;
    if (err.name === 'TypeError' && /load failed|cancelled/i.test(err.message)) return true;
    return false;
  }

  private getBackoffDelay(): number {
    const delay = this.retryDelay * Math.pow(2, this.retryCount);
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, this.maxRetryDelay);
  }
}
