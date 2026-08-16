import React from "react";
import { ImageResponse } from "next/og";

export const runtime = "edge";

const h = React.createElement;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawVideo = (url.searchParams.get("video") || "").trim();
  const videoId = /^[A-Za-z0-9_-]{11}$/.test(rawVideo) ? rawVideo : "";
  const rawTitle = (url.searchParams.get("title") || "").trim();
  const title = rawTitle.slice(0, 130) || "YouTube με ελληνικούς υπότιτλους";
  const thumbnail = videoId
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : null;
  const gtslogo = new URL("/gtslogo.svg", url.origin).toString();

  return new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#080A0F",
          color: "white",
          fontFamily: "Arial, sans-serif",
        },
      },
      thumbnail
        ? h("img", {
            src: thumbnail,
            width: 1200,
            height: 630,
            style: {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            },
          })
        : null,
      h("div", {
        style: {
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(5,7,12,.12) 10%, rgba(5,7,12,.28) 44%, rgba(5,7,12,.93) 100%)",
        },
      }),
      h(
        "div",
        {
          style: {
            position: "absolute",
            left: 54,
            top: 48,
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "12px 18px 12px 12px",
            borderRadius: 18,
            background: "rgba(8,10,15,.84)",
            border: "1px solid rgba(175,160,255,.25)",
          },
        },
        h("img", {
          src: gtslogo,
          width: 66,
          height: 53,
          style: { objectFit: "contain" },
        }),
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "baseline",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            },
          },
          "GreekTube ",
          h(
            "span",
            { style: { color: "#B0A2FF", marginLeft: 7 } },
            "Subs",
          ),
        ),
      ),
      h(
        "div",
        {
          style: {
            position: "absolute",
            left: 58,
            right: 58,
            bottom: 54,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          },
        },
        h(
          "div",
          {
            style: {
              maxWidth: 980,
              fontSize: title.length > 78 ? 42 : 50,
              lineHeight: 1.08,
              fontWeight: 760,
              letterSpacing: "-0.03em",
              textShadow: "0 2px 16px rgba(0,0,0,.6)",
            },
          },
          title,
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 24,
              color: "#DDDFF0",
            },
          },
          h("span", { style: { color: "#B0A2FF", fontWeight: 700 } }, "Ελληνικοί υπότιτλοι"),
          h("span", { style: { color: "#8B91A5" } }, "·"),
          h("span", null, "greektubesubs.com"),
        ),
      ),
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    },
  );
}
