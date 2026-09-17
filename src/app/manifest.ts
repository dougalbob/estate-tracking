import type { MetadataRoute } from "next";
import { themes, defaultTheme } from "@/themes";

const palette = themes[defaultTheme];

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Estate Organiser",
    short_name: "Estate",
    description: "A shared space for taking care of what comes next.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: palette.colors.background,
    theme_color: palette.colors.primary,
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
