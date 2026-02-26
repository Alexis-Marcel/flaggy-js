import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlaggyClient } from '../src/client';

function mockFetch(responses: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const body = responses[path];
    if (!body) {
      return { ok: false, status: 404, statusText: 'Not Found' } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response;
  });
}

describe('FlaggyClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('initializes and fetches flags via batch evaluate', async () => {
    globalThis.fetch = mockFetch({
      '/api/v1/evaluate/batch': {
        results: [
          { flag_key: 'dark_mode', value: true, match: true, reason: 'rule_match' },
          { flag_key: 'banner_text', value: 'Hello', match: true, reason: 'default' },
        ],
      },
    });

    const client = new FlaggyClient({
      serverUrl: 'https://flaggy.example.com',
      apiKey: 'flg_test',
      enableStreaming: false,
    });

    const readyFn = vi.fn();
    client.on('ready', readyFn);

    await client.initialize();

    expect(readyFn).toHaveBeenCalledOnce();
    expect(client.ready).toBe(true);
    expect(client.error).toBeNull();
    expect(client.getFlag('dark_mode', false)).toBe(true);
    expect(client.getFlag('banner_text', '')).toBe('Hello');

    client.destroy();
  });

  it('returns default value for unknown flag', async () => {
    globalThis.fetch = mockFetch({
      '/api/v1/evaluate/batch': { results: [] },
    });

    const client = new FlaggyClient({
      serverUrl: 'https://flaggy.example.com',
      apiKey: 'flg_test',
      enableStreaming: false,
    });

    await client.initialize();

    expect(client.getFlag('unknown', 42)).toBe(42);
    expect(client.getFlag('unknown', false)).toBe(false);

    client.destroy();
  });

  it('returns default value when not ready', () => {
    const client = new FlaggyClient({
      serverUrl: 'https://flaggy.example.com',
      apiKey: 'flg_test',
      enableStreaming: false,
    });

    expect(client.ready).toBe(false);
    expect(client.getFlag('any_flag', 'default')).toBe('default');

    client.destroy();
  });

  it('handles initialization error gracefully', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })) as unknown as typeof fetch;

    const client = new FlaggyClient({
      serverUrl: 'https://flaggy.example.com',
      apiKey: 'flg_test',
      enableStreaming: false,
    });

    const errorFn = vi.fn();
    client.on('error', errorFn);

    await client.initialize();

    expect(client.ready).toBe(false);
    expect(client.error).toBeInstanceOf(Error);
    expect(errorFn).toHaveBeenCalledOnce();
    expect(client.getFlag('any', true)).toBe(true);

    client.destroy();
  });

  it('sends context in batch evaluate request', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    const client = new FlaggyClient({
      serverUrl: 'https://flaggy.example.com',
      apiKey: 'flg_test',
      context: { user: { plan: 'pro' } },
      enableStreaming: false,
    });

    await client.initialize();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://flaggy.example.com/api/v1/evaluate/batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ context: { user: { plan: 'pro' } } }),
      }),
    );

    client.destroy();
  });

  it('sends authorization header', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    const client = new FlaggyClient({
      serverUrl: 'https://flaggy.example.com',
      apiKey: 'flg_abc123',
      enableStreaming: false,
    });

    await client.initialize();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer flg_abc123',
        }),
      }),
    );

    client.destroy();
  });

  it('setContext re-fetches flags and emits changes', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      const results =
        callCount === 1
          ? [{ flag_key: 'feature', value: false, match: true, reason: 'default' }]
          : [{ flag_key: 'feature', value: true, match: true, reason: 'rule_match' }];
      return {
        ok: true,
        status: 200,
        json: async () => ({ results }),
      };
    }) as unknown as typeof fetch;

    const client = new FlaggyClient({
      serverUrl: 'https://flaggy.example.com',
      apiKey: 'flg_test',
      enableStreaming: false,
    });

    await client.initialize();
    expect(client.getFlag('feature', false)).toBe(false);

    const changeFn = vi.fn();
    client.on('change', changeFn);

    await client.setContext({ user: { plan: 'pro' } });

    expect(client.getFlag('feature', false)).toBe(true);
    expect(changeFn).toHaveBeenCalledWith('feature', true);

    client.destroy();
  });

  it('unsubscribe works', async () => {
    globalThis.fetch = mockFetch({
      '/api/v1/evaluate/batch': { results: [] },
    });

    const client = new FlaggyClient({
      serverUrl: 'https://flaggy.example.com',
      apiKey: 'flg_test',
      enableStreaming: false,
    });

    const readyFn = vi.fn();
    const unsub = client.on('ready', readyFn);
    unsub();

    await client.initialize();

    expect(readyFn).not.toHaveBeenCalled();

    client.destroy();
  });

  it('strips trailing slash from serverUrl', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    const client = new FlaggyClient({
      serverUrl: 'https://flaggy.example.com/',
      apiKey: 'flg_test',
      enableStreaming: false,
    });

    await client.initialize();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://flaggy.example.com/api/v1/evaluate/batch',
      expect.any(Object),
    );

    client.destroy();
  });
});
