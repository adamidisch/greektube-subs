export type AppRouteKind = "home" | "video" | "settings" | "editor";

export type AppRoute = {
  kind: AppRouteKind;
  videoId: string;
};

export type NavigationMarker = {
  kind: AppRouteKind;
  videoId: string;
  inApp: boolean;
  direct: boolean;
};

export const NAVIGATION_STATE_KEY = "__gtsNavigation";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function parseAppRoute(input: string | URL, base = "https://greektubesubs.com/"): AppRoute {
  const url = input instanceof URL ? input : new URL(input, base);
  const candidate = String(url.searchParams.get("video") || "").trim();
  const videoId = VIDEO_ID_PATTERN.test(candidate) ? candidate : "";
  const view = url.searchParams.get("view");

  if (view === "settings") return { kind: "settings", videoId };
  if (view === "editor") return { kind: "editor", videoId };
  if (videoId) return { kind: "video", videoId };
  return { kind: "home", videoId: "" };
}

export function appRouteKey(route: AppRoute): string {
  return `${route.kind}:${route.videoId}`;
}

export function sameVideoContext(left: AppRoute, right: AppRoute): boolean {
  return Boolean(left.videoId && right.videoId && left.videoId === right.videoId);
}

export function shouldPromoteVideoReplaceToPush(current: AppRoute, next: AppRoute): boolean {
  if (next.kind !== "video") return false;
  if (current.kind === "home") return true;
  return current.kind === "video" && current.videoId !== next.videoId;
}

export function shouldBackOnVideoClose(
  current: AppRoute,
  next: AppRoute,
  marker: NavigationMarker | null,
): boolean {
  return current.kind === "video"
    && next.kind === "home"
    && Boolean(marker?.inApp)
    && marker?.direct !== true;
}

export function readNavigationMarker(state: unknown): NavigationMarker | null {
  if (!state || typeof state !== "object") return null;
  const marker = (state as Record<string, unknown>)[NAVIGATION_STATE_KEY];
  if (!marker || typeof marker !== "object") return null;
  const value = marker as Record<string, unknown>;
  const kind = value.kind;
  if (kind !== "home" && kind !== "video" && kind !== "settings" && kind !== "editor") return null;
  return {
    kind,
    videoId: typeof value.videoId === "string" ? value.videoId : "",
    inApp: value.inApp === true,
    direct: value.direct === true,
  };
}

export function withNavigationMarker(state: unknown, marker: NavigationMarker): Record<string, unknown> {
  const base = state && typeof state === "object" && !Array.isArray(state)
    ? state as Record<string, unknown>
    : {};
  return { ...base, [NAVIGATION_STATE_KEY]: marker };
}

export function routeWithoutView(input: string | URL, base = "https://greektubesubs.com/"): URL {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input, base);
  url.searchParams.delete("view");
  return url;
}
