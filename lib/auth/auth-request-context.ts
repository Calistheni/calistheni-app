import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

type AuthRequestContext = {
  callbackProvider: string | null;
};

const storage = new AsyncLocalStorage<AuthRequestContext>();

export function runInAuthRequestContext<T>(request: Request, operation: () => T): T {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/auth\/callback\/([^/]+)$/);
  return storage.run(
    { callbackProvider: match ? decodeURIComponent(match[1]!) : null },
    operation
  );
}

export function currentAuthCallbackProvider() {
  return storage.getStore()?.callbackProvider ?? null;
}
