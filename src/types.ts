/** Possible types a flag value can take */
export type FlagValue = boolean | string | number | Record<string, unknown>;

/** Evaluation context sent to the server */
export type FlaggyContext = Record<string, unknown>;

/** A single evaluated flag result from the server */
export interface EvaluatedFlag {
  flag_key: string;
  value: FlagValue;
  match: boolean;
  reason: string;
}

/** Response from POST /api/v1/evaluate */
export interface EvaluateResponse {
  flag_key: string;
  value: FlagValue;
  match: boolean;
  reason: string;
}

/** Response from POST /api/v1/evaluate/batch */
export interface BatchEvaluateResponse {
  results: EvaluatedFlag[];
}

/** SSE event data for flag changes */
export interface FlagChangeEvent {
  type: 'flag_updated' | 'flag_deleted' | 'flag_created';
  key: string;
}

/** Configuration for FlaggyClient */
export interface FlaggyClientOptions {
  serverUrl: string;
  apiKey: string;
  context?: FlaggyContext;
  /** Whether to open an SSE connection for live updates. Default: true */
  enableStreaming?: boolean;
  /** Initial retry delay for SSE reconnection in ms. Default: 1000 */
  sseRetryDelay?: number;
  /** Max retry delay for SSE reconnection in ms. Default: 30000 */
  sseMaxRetryDelay?: number;
}

/** Listener for flag value changes */
export type FlagChangeListener = (key: string, value: FlagValue) => void;

/** Listener for readiness state */
export type ReadyListener = () => void;

/** Listener for errors */
export type ErrorListener = (error: Error) => void;
