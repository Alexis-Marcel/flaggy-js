import { describe, it, expect, vi, afterEach } from 'vitest';
import { SSEManager } from '../src/sse';
import type { SSEEvent } from '../src/types';

function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('SSEManager', () => {
  let originalFetch: typeof globalThis.fetch;

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it('parses SSE events from stream', async () => {
    originalFetch = globalThis.fetch;

    const events: SSEEvent[] = [];

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: createMockStream([
        'event: flag_updated\ndata: {"key":"my_flag","type":"boolean","enabled":true}\n\n',
        'event: flag_created\ndata: {"key":"new_flag","type":"string"}\n\n',
      ]),
    })) as unknown as typeof fetch;

    const manager = new SSEManager({
      url: 'https://flaggy.example.com/api/v1/stream',
      apiKey: 'flg_test',
      onEvent: (event) => events.push(event),
      onError: () => {},
      retryDelay: 100,
      maxRetryDelay: 200,
    });

    manager.connect();

    // Wait for stream to be consumed
    await new Promise((r) => setTimeout(r, 50));

    expect(events).toHaveLength(2);
    // SSE "event:" field overrides data's "type" field
    expect(events[0]).toEqual({ type: 'flag_updated', key: 'my_flag', enabled: true });
    expect(events[1]).toEqual({ type: 'flag_created', key: 'new_flag' });

    manager.destroy();
  });

  it('sends authorization header', async () => {
    originalFetch = globalThis.fetch;

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      body: createMockStream([]),
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    const manager = new SSEManager({
      url: 'https://flaggy.example.com/api/v1/stream',
      apiKey: 'flg_secret',
      onEvent: () => {},
      onError: () => {},
    });

    manager.connect();
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://flaggy.example.com/api/v1/stream',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer flg_secret',
        }),
      }),
    );

    manager.destroy();
  });

  it('calls onError on connection failure', async () => {
    originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
    })) as unknown as typeof fetch;

    const errorFn = vi.fn();
    const manager = new SSEManager({
      url: 'https://flaggy.example.com/api/v1/stream',
      apiKey: 'flg_bad',
      onEvent: () => {},
      onError: errorFn,
      retryDelay: 50,
      maxRetryDelay: 100,
    });

    manager.connect();
    await new Promise((r) => setTimeout(r, 30));

    expect(errorFn).toHaveBeenCalled();
    expect(errorFn.mock.calls[0][0]).toBeInstanceOf(Error);

    manager.destroy();
  });

  it('does not reconnect after destroy', async () => {
    originalFetch = globalThis.fetch;

    let connectCount = 0;
    globalThis.fetch = vi.fn(async () => {
      connectCount++;
      return { ok: true, body: createMockStream([]) };
    }) as unknown as typeof fetch;

    const manager = new SSEManager({
      url: 'https://flaggy.example.com/api/v1/stream',
      apiKey: 'flg_test',
      onEvent: () => {},
      onError: () => {},
      retryDelay: 10,
      maxRetryDelay: 20,
    });

    manager.connect();
    await new Promise((r) => setTimeout(r, 20));

    manager.destroy();
    const countAfterDestroy = connectCount;

    await new Promise((r) => setTimeout(r, 100));

    // Should not have reconnected after destroy
    expect(connectCount).toBe(countAfterDestroy);
  });

  it('handles chunked SSE data across multiple reads', async () => {
    originalFetch = globalThis.fetch;

    const events: SSEEvent[] = [];

    // Split an event across two chunks
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: createMockStream([
        'event: flag_toggled\nda',
        'ta: {"key":"split_flag","enabled":false}\n\n',
      ]),
    })) as unknown as typeof fetch;

    const manager = new SSEManager({
      url: 'https://flaggy.example.com/api/v1/stream',
      apiKey: 'flg_test',
      onEvent: (event) => events.push(event),
      onError: () => {},
    });

    manager.connect();
    await new Promise((r) => setTimeout(r, 50));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'flag_toggled', key: 'split_flag', enabled: false });

    manager.destroy();
  });
});
