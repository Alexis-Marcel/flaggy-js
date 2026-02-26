import { useContext } from 'react';
import { FlaggyReactContext } from './context';

export function useFlaggy() {
  const ctx = useContext(FlaggyReactContext);

  if (!ctx) {
    throw new Error('[flaggy] useFlaggy() must be used within a <FlaggyProvider>.');
  }

  return {
    client: ctx.client,
    ready: ctx.ready,
    error: ctx.error,
  };
}
