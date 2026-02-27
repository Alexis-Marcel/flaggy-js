import { useContext, useCallback, useSyncExternalStore } from 'react';
import { FlaggyReactContext } from './context';
import type { FlagValue } from '../types';

export function useFlag<T extends FlagValue>(key: string, defaultValue: T): T {
  const ctx = useContext(FlaggyReactContext);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!ctx) return () => {};
      const unsubChange = ctx.client.on('change', onStoreChange);
      const unsubReady = ctx.client.on('ready', onStoreChange);
      return () => {
        unsubChange();
        unsubReady();
      };
    },
    [ctx],
  );

  const getSnapshot = useCallback(
    () => (ctx ? ctx.client.getFlag(key, defaultValue) : defaultValue),
    [ctx, key, defaultValue],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => defaultValue);
}
