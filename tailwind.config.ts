import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#131313",
        surface: "#131313",
        "surface-dim": "#131313",
        "surface-container-lowest": "#0e0e0e",
        "surface-container-low": "#1c1b1b",
        "surface-container": "#201f1f",
        "surface-container-high": "#2a2a2a",
        "surface-container-highest": "#353534",
        "on-background": "#e5e2e1",
        "on-surface": "#e5e2e1",
        "on-surface-variant": "#d0c5af",
        outline: "#99907c",
        "outline-variant": "#4d4635",
        primary: "#f2ca50",
        "primary-container": "#d4af37",
        "on-primary": "#3c2f00",
        secondary: "#dcc399",
        "secondary-container": "#574726",
        "on-secondary-container": "#cdb58c",
        error: "#ffb4ab",
        "error-container": "#93000a"
      },
      fontFamily: {
        serif: ["var(--font-noto-serif)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "Inter", "sans-serif"]
      },
      maxWidth: {
        container: "1280px"
      }
    }
  },
  plugins: []
};

export default config;
