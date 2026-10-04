import {database} from "@/db/postgres";

const SHARED_LIBRARY_KEY="greektube-shared-library-v1";
type Row=Record<string,unknown>;

export type AnalyticsSummary={sessions?:number;page_views?:number;video_opens?:number;watch_seconds?:number;unique_videos?:number;latest_event?:string|null;recent_events?:number};
export type AnalyticsTopVideo={video_id:string;views:number;sessions:number;watch_seconds:number;last_seen:string};
export type AnalyticsTopPage={name:string;views:number;sessions:number;first_seen?:string;last_seen?:string};
export type AnalyticsCountRow={name:string;sessions:number;confirmed_sessions?:number};
export type AnalyticsCityRow={name:string;country:string;sessions:number};
export type AnalyticsEventRow={name:string;count:number};
export type AnalyticsVisitor={session_id:string;first_seen:string;last_seen:string;country:string;city:string;device:string;browser:string;source:string;events:number;page_views:number;video_opens:number;watch_seconds:number;videos:string[];paths:string[];country_confirmed?:boolean};
export type AnalyticsVisitorVideoStat={session_id:string;video_id:string;views:number;watch_seconds:number;last_seen:string};
export type AnalyticsRecentEvent={created_at:string;session_id:string;event_name:string;path:string;video_id:string;referrer_host:string;country:string;city:string;device:string;browser:string;properties:Record<string,unknown>};
export type AnalyticsVideoMeta={title:string;originalTitle:string;speakerName:string};
export type AnalyticsReport={
  days:number;summary:AnalyticsSummary;topVideos:AnalyticsTopVideo[];topPages:AnalyticsTopPage[];sources:AnalyticsCountRow[];countries:AnalyticsCountRow[];cities:AnalyticsCityRow[];
  devices:AnalyticsCountRow[];browsers:AnalyticsCountRow[];events:AnalyticsEventRow[];visitors:AnalyticsVisitor[];visitorVideoStats:AnalyticsVisitorVideoStat[];
  recent:AnalyticsRecentEvent[];videoTitles:Record<string,string>;videoMeta:Record<string,AnalyticsVideoMeta>;
};

export function normalizeAnalyticsDays(value:unknown){
  const days=Number(value||7);
  return [1,7,30,90].includes(days)?days:7;
}

async function ensureTable(){
  const db=database();
  await db.query(`CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), client_ts TIMESTAMPTZ NULL,
    session_id TEXT NOT NULL,event_name TEXT NOT NULL,path TEXT NOT NULL DEFAULT '/',video_id TEXT NOT NULL DEFAULT '',
    referrer_host TEXT NOT NULL DEFAULT 'direct',country TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',device TEXT NOT NULL DEFAULT '',browser TEXT NOT NULL DEFAULT '',properties JSONB NOT NULL DEFAULT '{}'::jsonb)`);
}

function libraryMeta(raw:unknown){
  const titles:Record<string,string>={};
  const videoMeta:Record<string,AnalyticsVideoMeta>={};
  try{
    const parsed=JSON.parse(String(raw||"")) as {videos?:Array<{id?:unknown;title?:unknown;originalTitle?:unknown;speakerName?:unknown}>};
    for(const video of parsed.videos||[]){
      const id=String(video.id||"");
      if(!id)continue;
      const title=String(video.title||video.originalTitle||id).trim();
      const originalTitle=String(video.originalTitle||"").trim();
      const speakerName=String(video.speakerName||"").trim();
      titles[id]=title;
      videoMeta[id]={title,originalTitle,speakerName};
    }
  }catch{}
  return {titles,videoMeta};
}

export async function loadAnalyticsReport(daysInput:unknown):Promise<AnalyticsReport>{
  await ensureTable();
  const days=normalizeAnalyticsDays(daysInput);
  const db=database();
  const results=await Promise.all([
    db.query(`SELECT COUNT(DISTINCT session_id)::int AS sessions,
      COUNT(*) FILTER (WHERE event_name='page_view')::int AS page_views,
      COUNT(*) FILTER (WHERE event_name='video_open')::int AS video_opens,
      COUNT(DISTINCT NULLIF(video_id,''))::int AS unique_videos,
      COALESCE(SUM((properties->>'seconds')::numeric) FILTER (WHERE event_name='video_watch'),0)::float AS watch_seconds,
      MAX(created_at) AS latest_event,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '15 minutes')::int AS recent_events
      FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval`,[days]),

    db.query(`SELECT video_id,
      COUNT(*) FILTER (WHERE event_name='video_open')::int AS views,
      COUNT(DISTINCT session_id)::int AS sessions,
      COALESCE(SUM((properties->>'seconds')::numeric) FILTER (WHERE event_name='video_watch'),0)::float AS watch_seconds,
      MAX(created_at) AS last_seen
      FROM analytics_events
      WHERE created_at >= NOW() - ($1 || ' days')::interval AND video_id<>''
      GROUP BY video_id
      ORDER BY views DESC,watch_seconds DESC
      LIMIT 100`,[days]),

    db.query(`SELECT canonical_path AS name,
      COUNT(*)::int AS views,
      COUNT(DISTINCT session_id)::int AS sessions,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen
      FROM (
        SELECT CASE
          WHEN NULLIF(video_id,'') IS NOT NULL THEN '/?video=' || video_id
          ELSE split_part(path,'?',1)
        END AS canonical_path,session_id,created_at
        FROM analytics_events
        WHERE created_at >= NOW() - ($1 || ' days')::interval AND event_name='page_view'
      ) page_events
      GROUP BY canonical_path ORDER BY views DESC,sessions DESC LIMIT 100`,[days]),

    db.query(`SELECT referrer_host AS name,COUNT(DISTINCT session_id)::int AS sessions
      FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval AND event_name='page_view'
      GROUP BY referrer_host ORDER BY sessions DESC LIMIT 20`,[days]),

    db.query(`SELECT COALESCE(NULLIF(country,''),'Unknown') AS name,
      COUNT(DISTINCT session_id)::int AS sessions,
      COUNT(DISTINCT session_id) FILTER (WHERE properties->>'geoCountrySource'='vercel-edge')::int AS confirmed_sessions
      FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY country ORDER BY sessions DESC LIMIT 20`,[days]),

    db.query(`SELECT COALESCE(NULLIF(city,''),'Unknown') AS name,COALESCE(NULLIF(country,''),'') AS country,
      COUNT(DISTINCT session_id)::int AS sessions
      FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY city,country ORDER BY sessions DESC LIMIT 20`,[days]),

    db.query(`SELECT COALESCE(NULLIF(device,''),'Other') AS name,COUNT(DISTINCT session_id)::int AS sessions
      FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY device ORDER BY sessions DESC LIMIT 20`,[days]),

    db.query(`SELECT COALESCE(NULLIF(browser,''),'Other') AS name,COUNT(DISTINCT session_id)::int AS sessions
      FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY browser ORDER BY sessions DESC LIMIT 20`,[days]),

    db.query(`SELECT event_name AS name,COUNT(*)::int AS count
      FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY event_name ORDER BY count DESC LIMIT 30`,[days]),

    db.query(`SELECT session_id,MIN(created_at) AS first_seen,MAX(created_at) AS last_seen,
      COALESCE(MAX(NULLIF(country,'')),'') AS country,COALESCE(MAX(NULLIF(city,'')),'') AS city,
      COALESCE(MAX(NULLIF(device,'')),'') AS device,COALESCE(MAX(NULLIF(browser,'')),'') AS browser,
      COALESCE((array_agg(referrer_host ORDER BY created_at))[1],'direct') AS source,
      COUNT(*)::int AS events,
      COUNT(*) FILTER (WHERE event_name='page_view')::int AS page_views,
      COUNT(*) FILTER (WHERE event_name='video_open')::int AS video_opens,
      COALESCE(SUM((properties->>'seconds')::numeric) FILTER (WHERE event_name='video_watch'),0)::float AS watch_seconds,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(video_id,'')),NULL) AS videos,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(path,'')),NULL) AS paths,
      BOOL_OR(properties->>'geoCountrySource'='vercel-edge') AS country_confirmed
      FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY session_id ORDER BY last_seen DESC LIMIT 250`,[days]),

    db.query(`SELECT session_id,video_id,
      COUNT(*) FILTER (WHERE event_name='video_open')::int AS views,
      COALESCE(SUM((properties->>'seconds')::numeric) FILTER (WHERE event_name='video_watch'),0)::float AS watch_seconds,
      MAX(created_at) AS last_seen
      FROM analytics_events
      WHERE created_at >= NOW() - ($1 || ' days')::interval AND video_id<>''
      GROUP BY session_id,video_id ORDER BY last_seen DESC LIMIT 1000`,[days]),

    db.query(`SELECT created_at,session_id,event_name,path,video_id,referrer_host,country,city,device,browser,properties
      FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval
      ORDER BY created_at DESC LIMIT 500`,[days]),

    db.query(`SELECT value FROM app_state WHERE key=$1 LIMIT 1`,[SHARED_LIBRARY_KEY]),
  ]);

  const [summaryRows,topVideos,topPages,sources,countries,cities,devices,browsers,events,visitors,visitorVideoStats,recent,libraryRows]=results.map(result=>result as Row[]);
  const {titles:videoTitles,videoMeta}=libraryMeta(libraryRows[0]?.value);
  return {
    days,
    summary:(summaryRows[0]||{}) as AnalyticsSummary,
    topVideos:topVideos as AnalyticsTopVideo[],
    topPages:topPages as AnalyticsTopPage[],
    sources:sources as AnalyticsCountRow[],
    countries:countries as AnalyticsCountRow[],
    cities:cities as AnalyticsCityRow[],
    devices:devices as AnalyticsCountRow[],
    browsers:browsers as AnalyticsCountRow[],
    events:events as AnalyticsEventRow[],
    visitors:visitors as AnalyticsVisitor[],
    visitorVideoStats:visitorVideoStats as AnalyticsVisitorVideoStat[],
    recent:recent as AnalyticsRecentEvent[],
    videoTitles,videoMeta,
  };
}
