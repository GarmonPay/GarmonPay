import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
      },
      fontWeight: {
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
      },
      screens: {
        xs: "320px",
        sm: "375px",
        md: "414px",
        tablet: "768px",
        lg: "1024px",
      },
      colors: {
        fintech: {
          bg: "#0b0712",
          "bg-card": "#151020",
          accent: "#ac7cff",
          success: "#67dbaa",
          danger: "#ff8e9c",
          "text-primary": "#f6f3ff",
          "text-secondary": "#cdc2e0",
          muted: "#aaa1bd",
          money: "#67dbaa",
          highlight: "#e8c477",
        },
      },
      boxShadow: {
        soft: "0 2px 15px -3px rgba(0, 0, 0, 0.25), 0 4px 20px -2px rgba(0, 0, 0, 0.2)",
        "soft-lg": "0 10px 40px -10px rgba(0, 0, 0, 0.35), 0 4px 20px -2px rgba(0, 0, 0, 0.2)",
        card: "0 4px 24px -4px rgba(0, 0, 0, 0.4)",
        "card-hover": "0 8px 32px -4px rgba(0, 0, 0, 0.45)",
      },
      minHeight: {
        touch: "48px",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.35s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        "coin-flip-spin": "coinFlipSpin 2.2s ease-in-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0.95", transform: "scale(0.98)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        coinFlipSpin: {
          "0%": { transform: "rotateY(0deg)" },
          "100%": { transform: "rotateY(720deg)" },
        },
      },
      transitionDuration: {
        app: "200ms",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
export default config;
