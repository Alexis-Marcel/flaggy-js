import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { FlaggyProvider, useFlag, useFlaggy } from '../src/react/index';

function mockBatchResponse(flags: Record<string, unknown>) {
  const results = Object.entries(flags).map(([key, value]) => ({
    flag_key: key,
    value,
    match: true,
    reason: 'default',
  }));
  return { results };
}

describe('React bindings', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  describe('FlaggyProvider + useFlag', () => {
    it('renders with flag values after initialization', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => mockBatchResponse({ dark_mode: true, banner: 'Hello' }),
      })) as unknown as typeof fetch;

      function TestComponent() {
        const darkMode = useFlag('dark_mode', false);
        const banner = useFlag('banner', 'default');
        return (
          <div>
            <span data-testid="dark">{String(darkMode)}</span>
            <span data-testid="banner">{banner}</span>
          </div>
        );
      }

      await act(async () => {
        render(
          <FlaggyProvider
            serverUrl="https://flaggy.example.com"
            apiKey="flg_test"
            enableStreaming={false}
          >
            <TestComponent />
          </FlaggyProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('dark').textContent).toBe('true');
        expect(screen.getByTestId('banner').textContent).toBe('Hello');
      });
    });

    it('returns default values for unknown flags', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => mockBatchResponse({}),
      })) as unknown as typeof fetch;

      function TestComponent() {
        const value = useFlag('nonexistent', 42);
        return <span data-testid="val">{value}</span>;
      }

      await act(async () => {
        render(
          <FlaggyProvider
            serverUrl="https://flaggy.example.com"
            apiKey="flg_test"
            enableStreaming={false}
          >
            <TestComponent />
          </FlaggyProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('val').textContent).toBe('42');
      });
    });

    it('returns default values when API fails', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Error',
      })) as unknown as typeof fetch;

      function TestComponent() {
        const value = useFlag('feature', 'fallback');
        return <span data-testid="val">{value}</span>;
      }

      await act(async () => {
        render(
          <FlaggyProvider
            serverUrl="https://flaggy.example.com"
            apiKey="flg_test"
            enableStreaming={false}
          >
            <TestComponent />
          </FlaggyProvider>,
        );
      });

      // Should show fallback since API failed
      expect(screen.getByTestId('val').textContent).toBe('fallback');
    });
  });

  describe('onError callback', () => {
    it('calls onError when API fails', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Error',
      })) as unknown as typeof fetch;

      const onError = vi.fn();

      function TestComponent() {
        return <span data-testid="child">ok</span>;
      }

      await act(async () => {
        render(
          <FlaggyProvider
            serverUrl="https://flaggy.example.com"
            apiKey="flg_test"
            enableStreaming={false}
            onError={onError}
          >
            <TestComponent />
          </FlaggyProvider>,
        );
      });

      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });

  describe('useFlaggy', () => {
    it('provides ready and error state', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => mockBatchResponse({}),
      })) as unknown as typeof fetch;

      function TestComponent() {
        const { ready, error } = useFlaggy();
        return (
          <div>
            <span data-testid="ready">{String(ready)}</span>
            <span data-testid="error">{error ? error.message : 'none'}</span>
          </div>
        );
      }

      await act(async () => {
        render(
          <FlaggyProvider
            serverUrl="https://flaggy.example.com"
            apiKey="flg_test"
            enableStreaming={false}
          >
            <TestComponent />
          </FlaggyProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('ready').textContent).toBe('true');
        expect(screen.getByTestId('error').textContent).toBe('none');
      });
    });

    it('throws when used outside provider', () => {
      function TestComponent() {
        useFlaggy();
        return null;
      }

      expect(() => render(<TestComponent />)).toThrow(
        '[flaggy] useFlaggy() must be used within a <FlaggyProvider>.',
      );
    });
  });
});
