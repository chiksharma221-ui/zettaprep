import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      colors: {
        ink: { 950: "#07080c", 900: "#0c0e14", 850: "#11141c", 800: "#171b25", 700: "#232836", 600: "#343b4d", 400: "#7a8297", 300: "#a3aabb", 200: "#cfd3dd", 100: "#eceef3" },
        signal: { DEFAULT: "#c6f432", dim: "#9cc21f" },
        probe: { DEFAULT: "#ff6b3d", dim: "#c94f28" },
        think: { DEFAULT: "#8b7cff" },
        speak: { DEFAULT: "#38d6c4" },
      },
      keyframes: {
        "pulse-ring": { "0%": { transform: "scale(0.9)", opacity: "0.7" }, "100%": { transform: "scale(1.6)", opacity: "0" } },
        scan: { "0%": { backgroundPosition: "0 0" }, "100%": { backgroundPosition: "0 100%" } },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.6s cubic-bezier(0.2,0.6,0.4,1) infinite",
      },
    },
  },
  plugins: [],
};
export default config;
