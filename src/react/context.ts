import { createContext } from 'react';
import type { FlaggyClient } from '../client';

export interface FlaggyContextValue {
  client: FlaggyClient;
  ready: boolean;
  error: Error | null;
}

export const FlaggyReactContext = createContext<FlaggyContextValue | null>(null);
