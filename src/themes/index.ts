export const themes = {
  calm: { label: "Calm", className: "theme-calm" },
} as const;
export const defaultTheme: keyof typeof themes = "calm";
