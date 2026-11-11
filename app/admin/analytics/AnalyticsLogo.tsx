// GreekTube Analytics mark: rising bars inside a gradient tile. Pure SVG + CSS animation (no dependencies).
export default function AnalyticsLogo({size=36,animated=false}:{size?:number;animated?:boolean}){
  return <svg className={"adl-mark"+(animated?" animated":"")} width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="GreekTube Analytics">
    <defs>
      <linearGradient id="adl-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8f7cff"/><stop offset="1" stopColor="#4b3fd0"/></linearGradient>
      <linearGradient id="adl-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".34"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
    </defs>
    <rect width="48" height="48" rx="13" fill="url(#adl-bg)"/>
    <rect width="48" height="26" rx="13" fill="url(#adl-gloss)"/>
    <rect className="adl-b1" x="10" y="25" width="7" height="13" rx="3.5" fill="#fff" fillOpacity=".62"/>
    <rect className="adl-b2" x="20.5" y="17" width="7" height="21" rx="3.5" fill="#fff" fillOpacity=".82"/>
    <rect className="adl-b3" x="31" y="9" width="7" height="29" rx="3.5" fill="#fff"/>
    <path d="M12 21 24 13l9 -4" stroke="#fff" strokeOpacity=".0" fill="none"/>
  </svg>;
}
