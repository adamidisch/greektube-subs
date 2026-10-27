"use client";

export default function PlayerUIAuditEnhancer(){
  return <style>{`
    .viewer .mobile-video-byline button[aria-label="Επεξεργασία βίντεο"],
    .viewer .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"],
    .viewer .mobile-video-byline button[aria-label="Αγαπημένο"],
    .viewer .mobile-watch-summary button[aria-label="Αγαπημένο"]{
      font-size:0!important;
    }

    .viewer .mobile-video-byline button[aria-label="Επεξεργασία βίντεο"]::before,
    .viewer .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"]::before,
    .viewer .mobile-video-byline button[aria-label="Αγαπημένο"]::before,
    .viewer .mobile-watch-summary button[aria-label="Αγαπημένο"]::before{
      content:"";
      display:block;
      width:17px;
      height:17px;
      background:currentColor;
      -webkit-mask-position:center;
      mask-position:center;
      -webkit-mask-repeat:no-repeat;
      mask-repeat:no-repeat;
      -webkit-mask-size:contain;
      mask-size:contain;
    }

    .viewer .mobile-video-byline button[aria-label="Επεξεργασία βίντεο"]::before,
    .viewer .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"]::before{
      width:15px;height:15px;
      -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }

    .viewer .mobile-video-byline button[aria-label="Αγαπημένο"]::before,
    .viewer .mobile-watch-summary button[aria-label="Αγαπημένο"]::before{
      width:15px;height:15px;
      -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
  `}</style>;
}
