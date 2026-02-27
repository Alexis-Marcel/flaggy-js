# @getflaggy/sdk

JavaScript/React SDK for the [Flaggy](https://github.com/Alexis-Marcel/flaggy) feature flag server.

- Zero runtime dependencies
- Server-side evaluation with local cache
- Real-time updates via SSE
- React bindings with `useFlag` hook
- TypeScript, dual ESM/CJS

## Install

```bash
npm install @getflaggy/sdk
```

## React

### Setup

Wrap your app with `FlaggyProvider`:

```tsx
import { FlaggyProvider } from '@getflaggy/sdk/react';

function App() {
  return (
    <FlaggyProvider
      serverUrl="https://flaggy.example.com"
      apiKey="your-api-key"
      flags={['show-banner', 'dark-mode']}
      context={{ userId: '123', plan: 'pro' }}
      onError={(err) => console.error(err)}
    >
      <MyApp />
    </FlaggyProvider>
  );
}
```

### Read a flag

```tsx
import { useFlag } from '@getflaggy/sdk/react';

function MyComponent() {
  const showBanner = useFlag('show-banner', false);

  if (!showBanner) return null;
  return <div>New feature!</div>;
}
```

`useFlag(key, defaultValue)` returns the server-evaluated value, or `defaultValue` if the flag doesn't exist or the provider isn't ready yet.

### Access client state

```tsx
import { useFlaggy } from '@getflaggy/sdk/react';

function Status() {
  const { ready, error } = useFlaggy();

  if (error) return <div>Error: {error.message}</div>;
  if (!ready) return <div>Loading...</div>;
  return <div>Flags loaded</div>;
}
```

### Provider props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `serverUrl` | `string` | — | Flaggy server URL |
| `apiKey` | `string` | — | API key |
| `flags` | `string[]` | — | List of flag keys to evaluate |
| `context` | `Record<string, unknown>` | `{}` | Evaluation context (user info, etc.) |
| `enableStreaming` | `boolean` | `true` | Enable SSE for real-time flag updates |
| `onError` | `(error: Error) => void` | — | Error callback (Sentry, Datadog, etc.) |

When `context` changes (deep comparison), flags are automatically re-evaluated.

## Vanilla JavaScript

```ts
import { FlaggyClient } from '@getflaggy/sdk';

const client = new FlaggyClient({
  serverUrl: 'https://flaggy.example.com',
  apiKey: 'your-api-key',
  flags: ['show-banner', 'dark-mode'],
  context: { userId: '123' },
});

client.on('ready', () => {
  console.log(client.getFlag('show-banner', false));
});

client.on('change', (key, value) => {
  console.log(`Flag ${key} changed to`, value);
});

client.on('error', (err) => {
  console.error(err);
});

await client.initialize();

// Update context (re-evaluates all flags)
await client.setContext({ userId: '456', plan: 'enterprise' });

// Cleanup
client.destroy();
```

## How it works

1. On init, the SDK calls `POST /api/v1/evaluate/batch` with the declared flag keys
2. Results are cached locally — `getFlag()` reads from cache (synchronous)
3. An SSE connection to `/api/v1/stream` listens for flag changes in real-time
4. On change events, the affected flag is re-evaluated via `POST /api/v1/evaluate`
5. SSE reconnects automatically with exponential backoff + jitter

## License

MIT
