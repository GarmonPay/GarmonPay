import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fintech: {
          bg: "#0a0e17",
          "bg-card": "#111827",
          accent: "#2563eb",
          money: "#10b981",
          highlight: "#f59e0b",
          muted: "#6b7280",
        },
      },
    },
  },
  plugins: [],
};
export default config;
