import Link from "next/link";
import AuthScreen from "./AuthScreen";
import "../../auth-screen.css";

export const dynamic="force-dynamic";
const allowed=new Set(["sign-in","sign-up","verify-email"]);
export default async function AuthPage({params}:{params:Promise<{path:string}>}){
  const {path}=await params;
  if(!allowed.has(path))return <main className="gt-auth-page"><div className="gt-auth-card"><p>Αυτή η διαδρομή δεν είναι διαθέσιμη.</p><Link href="/auth/sign-in">Σύνδεση</Link></div></main>;
  return <AuthScreen mode={path as "sign-in"|"sign-up"|"verify-email"}/>;
}
