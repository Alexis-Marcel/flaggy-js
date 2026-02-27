import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlaggyClient } from '../client';
import { FlaggyReactContext } from './context';
import type { FlaggyContext } from '../types';

export interface FlaggyProviderProps {
  serverUrl: string;
  apiKey: string;
  flags: string[];
  context?: FlaggyContext;
  enableStreaming?: boolean;
  /** Called when an error occurs (init failure, SSE error, etc.) */
  onError?: (error: Error) => void;
  children: ReactNode;
}

export function FlaggyProvider({
  serverUrl,
  apiKey,
  flags,
  context,
  enableStreaming,
  onError,
  children,
}: FlaggyProviderProps) {
  const clientRef = useRef<FlaggyClient | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Create and initialize client when serverUrl or apiKey change
  useEffect(() => {
    const client = new FlaggyClient({
      serverUrl,
      apiKey,
      flags,
      context,
      enableStreaming,
    });
    clientRef.current = client;
    setReady(false);
    setError(null);

    const unsubReady = client.on('ready', () => setReady(true));
    const unsubError = client.on('error', (err) => {
      // Only set error state during init; SSE errors are transient
      if (!client.ready) setError(err);
      onError?.(err);
    });

    client.initialize();

    return () => {
      unsubReady();
      unsubError();
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

  if (!clientRef.current) return null;

  return (
    <FlaggyReactContext.Provider value={{ client: clientRef.current, ready, error }}>
      {children}
    </FlaggyReactContext.Provider>
  );
}
