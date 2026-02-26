import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
import { FlaggyClient } from '../client';
import { FlaggyReactContext } from './context';
import type { FlaggyContext } from '../types';

export interface FlaggyProviderProps {
  serverUrl: string;
  apiKey: string;
  context?: FlaggyContext;
  enableStreaming?: boolean;
  /** Called when an error occurs (init failure, SSE error, etc.) */
  onError?: (error: Error) => void;
  children: ReactNode;
}

export function FlaggyProvider({
  serverUrl,
  apiKey,
  context,
  enableStreaming,
  onError,
  children,
}: FlaggyProviderProps) {
  const clientRef = useRef<FlaggyClient | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [, setVersion] = useState(0);

  // Create and initialize client when serverUrl or apiKey change
  useEffect(() => {
    const client = new FlaggyClient({
      serverUrl,
      apiKey,
      context,
      enableStreaming,
    });
    clientRef.current = client;
    setReady(false);
    setError(null);

    const unsubReady = client.on('ready', () => setReady(true));
    const unsubError = client.on('error', (err) => {
      setError(err);
      onError?.(err);
    });
    const unsubChange = client.on('change', () => {
      setVersion((v) => v + 1);
    });

    client.initialize();

    return () => {
      unsubReady();
      unsubError();
      unsubChange();
      client.destroy();
      clientRef.current = null;
    };
  }, [serverUrl, apiKey]);

  // Update context when it changes (deep comparison via JSON.stringify)
  const contextKey = context ? JSON.stringify(context) : '';
  useEffect(() => {
    if (clientRef.current && context && clientRef.current.ready) {
      clientRef.current.setContext(context);
    }
  }, [contextKey]);

  const value = useMemo(
    () =>
      clientRef.current
        ? { client: clientRef.current, ready, error }
        : null,
    [ready, error],
  );

  if (!value) return null;

  return (
    <FlaggyReactContext.Provider value={value}>
      {children}
    </FlaggyReactContext.Provider>
  );
}
