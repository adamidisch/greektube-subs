import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import Link from "next/link";
import {database} from "@/db/postgres";
import {ADMIN_SESSION_COOKIE,adminPassword,adminSessionToken,safeEqual} from "@/lib/admin-auth";
import "./users.css";

type ProfileRow={public_id:string;username:string;created_at:string;last_saved:string|null;total_videos:number;watched:number;completed:number;moments:number;watch_seconds:number};
async function authorize(){
  const secret=adminPassword();
  if(!secret)redirect("/admin/analytics");
  const cookie=(await cookies()).get(ADMIN_SESSION_COOKIE)?.value||"";
  if(!safeEqual(cookie,await adminSessionToken(secret)))redirect("/admin/analytics");
}
const fmt=(value:string|null)=>value?new Date(value).toLocaleString("el-GR",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const duration=(v:number)=>v>=3600?`${Math.floor(v/3600)}h ${Math.floor(v%3600/60)}m`:`${Math.floor(v/60)} min`;
export default async function UsersPage({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}){
  await authorize();
  const params=await searchParams;
  const q=String(params.q||"").trim().slice(0,48);
  const page=Math.min(100,Math.max(1,Math.floor(Number(params.page)||1)));
  const size=50;
  const db=database();
  const [counts,rows]=await Promise.all([
    db.query(`SELECT COUNT(*)::int AS profiles,
       COUNT(*) FILTER(WHERE ps.owner_key IS NOT NULL)::int AS with_history,
       COUNT(*) FILTER(WHERE ps.updated_at::timestamptz>NOW()-INTERVAL '7 days')::int AS recently_saved
       FROM user_profiles p LEFT JOIN personal_states ps ON ps.owner_key=p.owner_key`) as Promise<Array<{profiles:number;with_history:number;recently_saved:number}>>,
    db.query(`SELECT p.public_id::text AS public_id,p.username,p.created_at,
      ps.updated_at AS last_saved,
      COALESCE(jsonb_array_length(COALESCE(ps.value::jsonb->'videos','[]'::jsonb)),0)::int AS total_videos,
      COALESCE(jsonb_array_length(COALESCE(ps.value::jsonb->'moments','[]'::jsonb)),0)::int AS moments,
      COALESCE(stats.watched,0)::int AS watched,
      COALESCE(stats.completed,0)::int AS completed,
      COALESCE(stats.watch_seconds,0)::float AS watch_seconds
      FROM user_profiles p
      LEFT JOIN personal_states ps ON ps.owner_key=p.owner_key
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER(WHERE COALESCE((v->>'progress')::numeric,0)>0)::int AS watched,
          COUNT(*) FILTER(WHERE COALESCE((v->>'progress')::numeric,0)>=90)::int AS completed,
          COALESCE(SUM(COALESCE((v->>'watchedSeconds')::numeric,0)),0)::float AS watch_seconds
        FROM jsonb_array_elements(COALESCE(ps.value::jsonb->'videos','[]'::jsonb)) AS v
      ) stats ON true
      WHERE ($1='' OR p.username ILIKE '%'||$1||'%')
      ORDER BY COALESCE(ps.updated_at,p.created_at) DESC
      LIMIT $2 OFFSET $3`,[q,size+1,(page-1)*size]) as Promise<ProfileRow[]>
  ]);
  const metrics=counts[0]||{profiles:0,with_history:0,recently_saved:0};
  const hasNext=rows.length>size;
  const visible=rows.slice(0,size);
  const pageUrl=(n:number)=>"/admin/analytics/users?"+new URLSearchParams({...q?{q}:{},page:String(n)}).toString();
  return <main className="gt-users-page"><div className="gt-users-shell">
    <header className="gt-users-top"><Link href="/admin/analytics" className="gt-users-back">‹ Analytics</Link><div className="gt-users-brand">GreekTube <b>Subs</b><span>ADMIN</span></div></header>
    <div className="gt-users-title"><div><div className="gt-users-eyebrow">AUDIENCE INTELLIGENCE</div><h1>Users</h1><p>Προφίλ και ιστορικό προβολής από τη βάση GreekTube.</p></div><span className="gt-users-data-label"><i/> LIVE DATA</span></div>
    <div className="gt-users-metrics"><article><span>Προφίλ συσκευής / χρηστών</span><strong>{metrics.profiles.toLocaleString("el-GR")}</strong><small>Δεν σημαίνει επαληθευμένο login</small></article><article><span>Με αποθηκευμένο ιστορικό</span><strong>{metrics.with_history.toLocaleString("el-GR")}</strong><small>Πρόοδος ή προσωπική κατάσταση</small></article><article><span>Ενημερώθηκαν τις τελευταίες 7 ημέρες</span><strong>{metrics.recently_saved.toLocaleString("el-GR")}</strong><small>Αποθήκευση, όχι απαραίτητα login</small></article></div>
    <section className="gt-users-panel"><div className="gt-users-toolbar"><div><h2>Κατάλογος προφίλ</h2><p>Username · δημιουργία · τελευταία αποθήκευση · δραστηριότητα</p></div><form action="/admin/analytics/users" method="get"><input name="q" type="search" placeholder="Αναζήτηση username…" defaultValue={q} aria-label="Αναζήτηση ονόματος"/><button type="submit">Αναζήτηση</button></form></div>
    <div className="gt-users-list">{visible.length?visible.map(row=><Link className="gt-user-card" href={`/admin/analytics/users/${row.public_id}`} key={row.public_id}>
      <span className="gt-user-avatar">{row.username.slice(0,1).toUpperCase()}</span>
      <span className="gt-user-details"><strong>{row.username}</strong><small>Δημιουργία: {fmt(row.created_at)}</small></span>
      <span className="gt-user-last"><small>Τελευταία αποθήκευση</small><strong>{fmt(row.last_saved)}</strong></span>
      <span className="gt-user-counts"><b>{row.watched}</b><small>βίντεο</small></span>
      <span className="gt-user-counts"><b>{duration(Number(row.watch_seconds))}</b><small>χρόνος</small></span>
      <span className="gt-user-counts"><b>{row.moments}</b><small>στιγμές</small></span><span className="gt-user-chevron">›</span>
    </Link>):<div className="gt-users-empty">Δεν βρέθηκαν προφίλ για αυτή την αναζήτηση.</div>}</div>
    <footer className="gt-users-pagination"><span>Σελίδα {page} · έως {size} προφίλ ανά σελίδα</span><div>{page>1&&<Link href={pageUrl(page-1)}>‹ Προηγούμενα</Link>}{hasNext&&<Link href={pageUrl(page+1)}>Επόμενα ›</Link>}</div></footer></section>
    <p className="gt-users-footnote">Οι ημερομηνίες «τελευταίας αποθήκευσης» δεν αποδεικνύουν login. Τα παλιά analytics clicks δεν μπορούν να αντιστοιχιστούν με ασφάλεια σε συγκεκριμένα usernames.</p>
  </div></main>;
}
