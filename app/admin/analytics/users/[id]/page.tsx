import {cookies} from "next/headers";
import {redirect,notFound} from "next/navigation";
import Link from "next/link";
import {database} from "@/db/postgres";
import {ADMIN_SESSION_COOKIE,adminPassword,adminSessionToken,safeEqual} from "@/lib/admin-auth";
import "../users.css";

type Video={id:string;title?:string;originalTitle?:string;lastWatched?:string;lastPosition?:number;watchedSeconds?:number;progress?:number;views?:number;channel?:string;favorite?:boolean};
type State={videos?:Video[];moments?:unknown[]};
type Data={public_id:string;username:string;created_at:string;updated_at:string;last_saved:string|null;value:string|null;owner_key:string};
const when=(s:string|null|undefined)=>s?new Date(s).toLocaleString("el-GR",{dateStyle:"medium",timeStyle:"short"}):"—";
export default async function UserDetailPage({params}:{params:Promise<{id:string}>}){
  const password=adminPassword();
  const session=(await cookies()).get(ADMIN_SESSION_COOKIE)?.value||"";
  if(!password||!safeEqual(session,await adminSessionToken(password)))redirect("/admin/analytics");
  const {id}=await params;
  if(!/^\d{1,15}$/.test(id))notFound();
  const rows=await database().query(
    `SELECT p.public_id::text AS public_id,p.username,p.created_at,p.updated_at,ps.updated_at AS last_saved,ps.value,p.owner_key
     FROM user_profiles p LEFT JOIN personal_states ps ON ps.owner_key=p.owner_key
     WHERE p.public_id=$1::bigint LIMIT 1`,[id]) as unknown as Data[];
  const row=rows[0];if(!row)notFound();
  let state:State={};try{state=JSON.parse(row.value||"{}") as State}catch{}
  const videos=Array.isArray(state.videos)?state.videos.filter(v=>Number(v.progress||0)>0||Number(v.lastPosition||0)>0):[];
  videos.sort((a,b)=>(b.lastWatched||"").localeCompare(a.lastWatched||""));
  const moments=Array.isArray(state.moments)?state.moments.length:0;
  const completed=videos.filter(v=>Number(v.progress||0)>=90).length;
  const watchSeconds=videos.reduce((n,v)=>n+Math.max(0,Number(v.watchedSeconds||0)),0);
  return <main className="gt-users-page"><div className="gt-users-shell">
    <header className="gt-users-top"><Link className="gt-users-back" href="/admin/analytics/users">‹ Users</Link><div className="gt-users-brand">GreekTube <b>Subs</b><span>ADMIN</span></div></header>
    <div className="gt-user-detail-top"><div><div className="gt-users-eyebrow">PROFILE DETAILS</div><h1>{row.username}</h1><p>Προφίλ #{row.public_id} · {row.owner_key.startsWith("anon:")?"Προφίλ συσκευής":"Εξωτερικά ταυτοποιημένος χρήστης"}</p></div><Link className="gt-users-back" href="/admin/analytics/users">Κατάλογος χρηστών ›</Link></div>
    <div className="gt-users-metrics"><article><span>Βίντεο που είδε</span><strong>{videos.length}</strong><small>{completed} ολοκληρωμένα</small></article><article><span>Καταγεγραμμένος χρόνος</span><strong>{Math.floor(watchSeconds/60)}<span style={{fontSize:14,marginLeft:4}}>min</span></strong><small>Όπου έχουν αποθηκευτεί δευτερόλεπτα</small></article><article><span>Αποθηκευμένες στιγμές</span><strong>{moments}</strong><small>Στο προσωπικό ιστορικό</small></article></div>
    <div className="gt-user-detail-body"><section className="gt-user-detail-panel"><h2>Ιστορικό βίντεο</h2>{videos.length?videos.map(v=><Link key={v.id} href={`/?video=${encodeURIComponent(v.id)}`} className="gt-user-video"><img alt="" src={`https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg`}/><div><strong>{v.title||v.originalTitle||v.id}</strong><span>{Math.round(Number(v.progress||0))}% · Θέση {Math.floor(Number(v.lastPosition||0)/60)}:{String(Math.floor(Number(v.lastPosition||0)%60)).padStart(2,"0")} · {when(v.lastWatched)}</span></div></Link>):<p>Δεν υπάρχουν αποθηκευμένα βίντεο για το συγκεκριμένο προφίλ.</p>}</section>
    <section className="gt-user-detail-panel"><h2>Πληροφορίες προφίλ</h2><div className="gt-user-detail-facts"><div><span>Username</span><strong>{row.username}</strong></div><div><span>Δημιουργία</span><strong>{when(row.created_at)}</strong></div><div><span>Τελευταία αποθήκευση</span><strong>{when(row.last_saved)}</strong></div><div><span>Ενημέρωση username</span><strong>{when(row.updated_at)}</strong></div><div><span>Επαληθευμένη επανασύνδεση</span><strong>Δεν καταγράφεται ακόμη</strong></div></div><p className="gt-user-detail-note">Η υπάρχουσα βάση καταγράφει πρόοδο προβολής. Δεν υπάρχει ακόμη αξιόπιστη σύνδεση των παλιών clicks και sessions με την ταυτότητα αυτού του προφίλ. Δεν αποδίδουμε δραστηριότητα άλλων επισκεπτών στον χρήστη.</p></section></div>
  </div></main>;
}
