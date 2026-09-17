export const themes = {
  calm: {
    label: "Calm",
    className: "theme-calm",
    colors: {
      background: "#f7f8f5",
      surface: "#ffffff",
      sidebar: "#f0f3ee",
      foreground: "#263b35",
      muted: "#62736b",
      border: "#dce4dc",
      primary: "#2c6655",
      primaryForeground: "#ffffff",
      accent: "#e4eee6",
      focus: "#376fbe",
      notice: "#edf1e8",
      radius: "14px",
    },
  },
} as const;
export const defaultTheme: keyof typeof themes = "calm";
