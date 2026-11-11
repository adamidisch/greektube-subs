import {NextResponse} from "next/server";
import {database} from "@/db/postgres";
import {verifyAdminSession} from "@/lib/admin-auth";

export async function GET(request:Request){
  if(!await verifyAdminSession(request))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const db=database();
    const [counts,rows]=await Promise.all([
      db.query(`SELECT COUNT(*)::int AS profiles,
        COUNT(*) FILTER(WHERE ps.owner_key IS NOT NULL)::int AS with_history,
        COUNT(*) FILTER(WHERE ps.updated_at::timestamptz>NOW()-INTERVAL '7 days')::int AS recently_saved
        FROM user_profiles p LEFT JOIN personal_states ps ON ps.owner_key=p.owner_key`),
      db.query(`SELECT p.public_id::text AS public_id,p.username,p.created_at,ps.updated_at AS last_saved,
        COALESCE(jsonb_array_length(COALESCE(ps.value::jsonb->'moments','[]'::jsonb)),0)::int AS moments,
        COALESCE(stats.watched,0)::int AS watched,COALESCE(stats.watch_seconds,0)::float AS watch_seconds
        FROM user_profiles p
        LEFT JOIN personal_states ps ON ps.owner_key=p.owner_key
        LEFT JOIN LATERAL (
          SELECT COUNT(*) FILTER(WHERE COALESCE((v->>'progress')::numeric,0)>0)::int AS watched,
            COALESCE(SUM(COALESCE((v->>'watchedSeconds')::numeric,0)),0)::float AS watch_seconds
          FROM jsonb_array_elements(COALESCE(ps.value::jsonb->'videos','[]'::jsonb)) AS v
        ) stats ON true
        ORDER BY COALESCE(ps.updated_at,p.created_at) DESC LIMIT 500`)
    ]) as unknown as [Array<Record<string,number>>,Array<Record<string,unknown>>];
    return NextResponse.json({counts:counts[0]||{profiles:0,with_history:0,recently_saved:0},users:rows},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    console.error("analytics users failed",error);
    return NextResponse.json({error:"users_failed"},{status:500});
  }
}
