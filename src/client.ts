import { SSEManager } from './sse';
import type {
  FlagValue,
  FlaggyContext,
  FlaggyClientOptions,
  BatchEvaluateResponse,
  SSEEvent,
  FlagChangeListener,
  ReadyListener,
  ErrorListener,
} from './types';

type EventMap = {
  change: FlagChangeListener;
  ready: ReadyListener;
  error: ErrorListener;
};

export class FlaggyClient {
  private readonly serverUrl: string;
  private readonly apiKey: string;
  private readonly flags: string[];
  private readonly enableStreaming: boolean;
  private readonly sseRetryDelay: number;
  private readonly sseMaxRetryDelay: number;

  private context: FlaggyContext;
  private cache = new Map<string, FlagValue>();
  private _ready = false;
  private _error: Error | null = null;
  private sseManager: SSEManager | null = null;
  private contextAbortController: AbortController | null = null;

  private listeners: {
    change: Set<FlagChangeListener>;
    ready: Set<ReadyListener>;
    error: Set<ErrorListener>;
  } = {
    change: new Set(),
    ready: new Set(),
    error: new Set(),
  };

  constructor(options: FlaggyClientOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.flags = options.flags;
    this.context = options.context ?? {};
    this.enableStreaming = options.enableStreaming ?? true;
    this.sseRetryDelay = options.sseRetryDelay ?? 1000;
    this.sseMaxRetryDelay = options.sseMaxRetryDelay ?? 30_000;
  }

  get ready(): boolean {
    return this._ready;
  }

  get error(): Error | null {
    return this._error;
  }

  async initialize(): Promise<void> {
    try {
      const response = await this.fetchApi<BatchEvaluateResponse>(
        '/api/v1/evaluate/batch',
        { flags: this.flags, context: this.context },
      );
      this.applyBatchResult(response);
      this._ready = true;
      this.emit('ready');
    } catch (err: unknown) {
      this._error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', this._error);
    }

    if (this.enableStreaming) {
      this.startSSE();
    }
  }

  getFlag<T extends FlagValue>(key: string, defaultValue: T): T {
    if (!this._ready || !this.cache.has(key)) {
      return defaultValue;
    }
    return this.cache.get(key) as T;
  }

  async setContext(context: FlaggyContext): Promise<void> {
    this.context = context;
    this.contextAbortController?.abort();
    const controller = new AbortController();
    this.contextAbortController = controller;

    try {
      const response = await this.fetchApi<BatchEvaluateResponse>(
        '/api/v1/evaluate/batch',
        { flags: this.flags, context },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.applyBatchResult(response);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      this._error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', this._error);
    }
  }

  on<E extends keyof EventMap>(event: E, listener: EventMap[E]): () => void {
    (this.listeners[event] as Set<EventMap[E]>).add(listener);
    return () => {
      (this.listeners[event] as Set<EventMap[E]>).delete(listener);
    };
  }

  destroy(): void {
    this.sseManager?.destroy();
    this.sseManager = null;
    this.contextAbortController?.abort();
    this.contextAbortController = null;
    this.listeners.change.clear();
    this.listeners.ready.clear();
    this.listeners.error.clear();
  }

  private startSSE(): void {
    this.sseManager = new SSEManager({
      url: `${this.serverUrl}/api/v1/stream`,
      apiKey: this.apiKey,
      onEvent: (event) => this.handleSSEEvent(event),
      onError: (err) => this.emit('error', err),
      retryDelay: this.sseRetryDelay,
      maxRetryDelay: this.sseMaxRetryDelay,
    });
    this.sseManager.connect();
  }

  private async handleSSEEvent(event: SSEEvent): Promise<void> {
    // Ignore connection confirmation
    if (event.type === 'connected') return;

    // Any flag/rule/segment change — re-evaluate all flags via batch
    try {
      const response = await this.fetchApi<BatchEvaluateResponse>(
        '/api/v1/evaluate/batch',
        { flags: this.flags, context: this.context },
      );
      this.applyBatchResult(response);
    } catch {
      // Failed to re-evaluate, keep previous cached values
    }
  }

  private applyBatchResult(response: BatchEvaluateResponse): void {
    const newCache = new Map<string, FlagValue>();
    for (const flag of response.results) {
      newCache.set(flag.flag_key, flag.value);
    }

    // Emit changes for any values that differ
    for (const [key, newValue] of newCache) {
      const oldValue = this.cache.get(key);
      if (oldValue !== newValue) {
        this.emit('change', key, newValue);
      }
    }

    // Emit changes for keys that were removed
    for (const key of this.cache.keys()) {
      if (!newCache.has(key)) {
        this.emit('change', key, undefined as unknown as FlagValue);
      }
    }

    this.cache = newCache;
  }

  private emit(event: 'change', key: string, value: FlagValue): void;
  private emit(event: 'ready'): void;
  private emit(event: 'error', error: Error): void;
  private emit(event: keyof EventMap, ...args: unknown[]): void {
    if (event === 'change') {
      for (const listener of this.listeners.change) {
        listener(args[0] as string, args[1] as FlagValue);
      }
    } else if (event === 'ready') {
      for (const listener of this.listeners.ready) {
        listener();
      }
    } else if (event === 'error') {
      for (const listener of this.listeners.error) {
        listener(args[0] as Error);
      }
    }
  }

  private async fetchApi<T>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`${this.serverUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw new Error(`Flaggy API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }
}
