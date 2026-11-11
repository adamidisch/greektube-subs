"use client";

import Link from "next/link";
import type {FormEvent} from "react";
import {useState} from "react";
import AnalyticsLogo from "./AnalyticsLogo";

type Props={checking:boolean;busy:boolean;error:string;password:string;onPassword:(value:string)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void};

export default function AnalyticsLogin({checking,busy,error,password,onPassword,onSubmit}:Props){
  const [visible,setVisible]=useState(false);
  return <main className="adl-page">
    <div className="adl-orb a" aria-hidden="true"/><div className="adl-orb b" aria-hidden="true"/><div className="adl-grid" aria-hidden="true"/>
    <section className={"adl-card"+(error?" shake":"")} key={error||"ok"}>
      <Link className="adl-back" href="/">← GreekTube Subs</Link>
      <div className="adl-logo"><AnalyticsLogo size={64} animated/></div>
      <small>PRIVATE ANALYTICS</small>
      <h1>{checking?"Έλεγχος πρόσβασης":"Analytics"}</h1>
      <p>{checking?"Ένα δευτερόλεπτο…":"Χρησιμοποίησε τον ίδιο admin κωδικό του GreekTube."}</p>
      {checking?<div className="adl-loader" aria-hidden="true"><i/><i/><i/></div>:<form onSubmit={onSubmit}>
        <label htmlFor="analytics-password">Admin password</label>
        <div className="adl-field">
          <input id="analytics-password" type={visible?"text":"password"} value={password} onChange={event=>onPassword(event.target.value)} autoComplete="current-password" autoFocus placeholder="••••••••"/>
          <button type="button" onClick={()=>setVisible(value=>!value)} aria-label={visible?"Hide password":"Show password"}>{visible?"Hide":"Show"}</button>
        </div>
        {error&&<div className="adl-error" role="alert">{error}</div>}
        <button className="adl-submit" type="submit" disabled={busy||!password}>{busy?<><i className="adl-spin" aria-hidden="true"/>Σύνδεση…</>:"Είσοδος στα analytics"}</button>
      </form>}
    </section>
  </main>;
}
