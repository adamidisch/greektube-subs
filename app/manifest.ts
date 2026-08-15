import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GreekTube Subs",
    short_name: "GreekTube Subs",
    description: "YouTube με αυτόματα μεταφρασμένους ελληνικούς υπότιτλους.",
    start_url: "/",
    display: "standalone",
    background_color: "#080A0F",
    theme_color: "#5146B8",
    icons: [
      {
        src: "/brand-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
