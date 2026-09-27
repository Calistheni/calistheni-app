"use client";

import { QueryClient } from "@tanstack/react-query";

let nativeQueryClient: QueryClient | undefined;

export function getNativeQueryClient() {
  if (!nativeQueryClient) {
    nativeQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          gcTime: Number.POSITIVE_INFINITY,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return nativeQueryClient;
}
