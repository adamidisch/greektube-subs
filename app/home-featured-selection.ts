/* Shared home-feature selection rules. Pure logic for predictable first render. */
export type HomeFeaturedVideo = {
  id: string;
  addedAt: string;
  lastWatched?: string;
  libraryVisible?: boolean;
};

function timestamp(value: string | undefined): number {
  if (!value || !value.trim()) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function latestViewedAt(video: HomeFeaturedVideo): number {
  return timestamp(video.lastWatched);
}

export function pickHomeFeaturedVideo<T extends HomeFeaturedVideo>(videos: readonly T[]): T | null {
  const visible = videos.filter(video => video.libraryVisible !== false);
  if (!visible.length) return null;
  const recent = visible.filter(video => Number.isFinite(latestViewedAt(video)));
  const candidates = recent.length ? recent : visible;
  return [...candidates].sort((a,b) =>
    (recent.length
      ? latestViewedAt(b) - latestViewedAt(a)
      : timestamp(b.addedAt) - timestamp(a.addedAt))
    || timestamp(b.addedAt) - timestamp(a.addedAt)
    || a.id.localeCompare(b.id)
  )[0] ?? null;
}

/* For a returning viewer, never replace a more recent local watch with an older server snapshot. */
export function preferredWatchState<T extends HomeFeaturedVideo & {
  lastPosition?: number;
  progress?: number;
}>(local: T | undefined, server: T): T {
  if (!local || latestViewedAt(local) <= latestViewedAt(server)) return server;
  return {
    ...server,
    lastWatched: local.lastWatched,
    lastPosition: local.lastPosition,
    progress: local.progress,
  };
}
