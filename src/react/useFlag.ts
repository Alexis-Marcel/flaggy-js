import { useContext } from 'react';
import { FlaggyReactContext } from './context';
import type { FlagValue } from '../types';

export function useFlag<T extends FlagValue>(key: string, defaultValue: T): T {
  const ctx = useContext(FlaggyReactContext);

  if (!ctx) {
    return defaultValue;
  }

  return ctx.client.getFlag(key, defaultValue);
}
