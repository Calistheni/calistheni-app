import "server-only";

import { NextResponse } from "next/server";
import { isAllowedAuthenticatedApiRequest, isAllowedNativeOrigin, NATIVE_APP_ORIGIN } from "@/lib/native-api-cors-core";

export { NATIVE_APP_ORIGIN } from "@/lib/native-api-cors-core";

function allowedOrigin(request: Request) {
  return isAllowedNativeOrigin(request.headers.get("origin"));
}

function isAllowedAuthenticatedRequest(request: Request) {
  return isAllowedAuthenticatedApiRequest({
    requestUrl: request.url,
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
  });
}

export function withNativeCors(request: Request, response: NextResponse) {
  response.headers.append("Vary", "Origin");
  if (allowedOrigin(request)) {
    response.headers.set("Access-Control-Allow-Origin", NATIVE_APP_ORIGIN);
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Max-Age", "600");
  }
  return response;
}

export function nativeCorsJson(
  request: Request,
  body: unknown,
  init?: ResponseInit
) {
  return withNativeCors(request, NextResponse.json(body, init));
}

export function nativeCorsPreflight(request: Request) {
  if (!allowedOrigin(request)) {
    return withNativeCors(
      request,
      NextResponse.json({ error: "Origin not allowed", code: "NATIVE_ORIGIN_INVALID" }, { status: 403 })
    );
  }
  return withNativeCors(request, new NextResponse(null, { status: 204 }));
}

export function rejectDisallowedNativeOrigin(request: Request) {
  return isAllowedAuthenticatedRequest(request)
    ? null
    : nativeCorsJson(
        request,
        { error: "Origin not allowed", code: "NATIVE_ORIGIN_INVALID" },
        { status: 403 }
      );
}
