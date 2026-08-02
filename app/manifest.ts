import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Co-VideoPro",
    short_name: "Co-VideoPro",
    description:
      "All-in-one video production workspace for planning, review, approval, editing, and delivery.",
    start_url: "/login",
    display: "standalone",
    // Canon Deep Blue (--cvp-ink) — matches the icon plate in app/icon.svg.
    background_color: "#0a1d3d",
    theme_color: "#0a1d3d",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
