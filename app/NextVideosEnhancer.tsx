"use client";

export default function NextVideosEnhancer(){
  return <style>{`
    .viewer .next-videos{
      display:block!important;
      margin-top:30px!important;
      padding-top:3px!important;
    }
    .viewer .next-videos[hidden]{display:none!important}
    .viewer .next-videos .section-title{
      display:flex!important;
      align-items:center!important;
      justify-content:flex-start!important;
      gap:9px!important;
      margin-bottom:12px!important;
    }
    .viewer .next-videos .section-title h2{
      margin:0!important;
      color:var(--text)!important;
      font-size:15px!important;
      font-weight:680!important;
      letter-spacing:-.025em!important;
    }
    .viewer .next-videos .section-title small{
      min-width:20px!important;
      height:20px!important;
      display:grid!important;
      place-items:center!important;
      padding:0 6px!important;
      border-radius:999px!important;
      background:rgba(255,255,255,.055)!important;
      color:var(--soft)!important;
      font-size:9px!important;
      font-weight:650!important;
    }
    .viewer .next-video-row{
      display:grid!important;
      gap:8px!important;
    }
    .viewer .next-video-row>button{
      width:100%!important;
      min-width:0!important;
      display:grid!important;
      grid-template-columns:116px minmax(0,1fr)!important;
      gap:13px!important;
      align-items:center!important;
      padding:9px!important;
      border:1px solid var(--line)!important;
      border-radius:13px!important;
      background:var(--raised)!important;
      color:var(--text)!important;
      text-align:left!important;
      cursor:pointer!important;
      transition:border-color .15s ease,background .15s ease,transform .15s ease!important;
    }
    .viewer .next-video-row>button[hidden]{display:none!important}
    .viewer .next-video-row>button:hover{
      transform:translateY(-1px)!important;
      border-color:rgba(143,127,240,.28)!important;
      background:rgba(143,127,240,.045)!important;
    }
    .viewer .next-video-row>button img{
      width:116px!important;
      aspect-ratio:16/9!important;
      display:block!important;
      object-fit:cover!important;
      border-radius:9px!important;
      background:#080a0e!important;
    }
    .viewer .next-video-row>button>span{min-width:0!important}
    .viewer .next-video-row>button strong{
      display:-webkit-box!important;
      overflow:hidden!important;
      -webkit-box-orient:vertical!important;
      -webkit-line-clamp:2!important;
      color:var(--text)!important;
      font-size:12px!important;
      font-weight:590!important;
      line-height:1.34!important;
      letter-spacing:-.015em!important;
    }
    .viewer .next-video-row>button small{
      display:block!important;
      margin-top:5px!important;
      overflow:hidden!important;
      color:var(--soft)!important;
      font-size:9.5px!important;
      line-height:1.2!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
    }
    @media(min-width:900px){
      .viewer .next-video-row{
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:9px!important;
      }
      .viewer .next-video-row>button{
        grid-template-columns:1fr!important;
        align-content:start!important;
        gap:8px!important;
        padding:8px!important;
      }
      .viewer .next-video-row>button img{width:100%!important;border-radius:8px!important}
      .viewer .next-video-row>button strong{font-size:11.5px!important;line-height:1.38!important}
      .viewer .next-video-row>button small{font-size:9.5px!important}
    }
    @media(max-width:700px){
      .viewer .next-videos{margin-top:26px!important}
      .viewer .next-videos .section-title{margin-bottom:10px!important}
      .viewer .next-videos .section-title h2{font-size:15px!important}
      .viewer .next-video-row>button{
        grid-template-columns:112px minmax(0,1fr)!important;
        gap:11px!important;
        padding:8px!important;
        border-radius:12px!important;
      }
      .viewer .next-video-row>button img{width:112px!important}
      .viewer .next-video-row>button strong{font-size:12.5px!important}
      .viewer .next-video-row>button small{font-size:10.5px!important}
    }
  `}</style>;
}
