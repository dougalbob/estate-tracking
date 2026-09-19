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
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [
          {
            name: "file",
            accept: [
              "application/pdf",
              ".pdf",
              "image/jpeg",
              ".jpg",
              ".jpeg",
              "image/png",
              ".png",
              "image/webp",
              ".webp",
              "image/tiff",
              ".tiff",
              "image/heic",
              ".heic",
              "image/heif",
              ".heif",
              "text/plain",
              ".txt",
            ],
          },
        ],
      },
    },
  };
}
