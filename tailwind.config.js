import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "oklch(0.24 0.026 265)",
        input: "oklch(0.18 0.02 265)",
        ring: "oklch(0.72 0.16 212)",
        background: "oklch(0.075 0 0)",
        foreground: "oklch(0.93 0.012 260)",
        primary: {
          DEFAULT: "oklch(0.58 0.19 270)",
          foreground: "oklch(0.98 0.004 260)"
        },
        secondary: {
          DEFAULT: "oklch(0.14 0.016 265)",
          foreground: "oklch(0.9 0.012 260)"
        },
        muted: {
          DEFAULT: "oklch(0.13 0.014 260)",
          foreground: "oklch(0.68 0.02 255)"
        },
        accent: {
          DEFAULT: "oklch(0.18 0.045 220)",
          foreground: "oklch(0.86 0.09 210)"
        },
        destructive: {
          DEFAULT: "oklch(0.62 0.16 28)",
          foreground: "oklch(0.98 0.004 260)"
        },
        card: {
          DEFAULT: "oklch(0.105 0.012 268)",
          foreground: "oklch(0.93 0.012 260)"
        }
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.55rem",
        sm: "0.4rem"
      },
      boxShadow: {
        "auth-card": "0 24px 80px oklch(0 0 0 / 0.42), 0 0 0 1px oklch(0.34 0.06 268 / 0.22)",
        "auth-glow": "0 12px 38px oklch(0.58 0.19 270 / 0.28)"
      },
      keyframes: {
        "auth-fade": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.99)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
        },
        "light-drift": {
          "0%": { transform: "translate3d(-2%, 2%, 0)" },
          "50%": { transform: "translate3d(2%, -1%, 0)" },
          "100%": { transform: "translate3d(-2%, 2%, 0)" }
        },
        "city-glow": {
          "0%, 100%": { opacity: "0.42" },
          "50%": { opacity: "0.72" }
        }
      },
      animation: {
        "auth-fade": "auth-fade 260ms ease-out both",
        "light-drift": "light-drift 14s ease-in-out infinite",
        "city-glow": "city-glow 6s ease-in-out infinite"
      }
    }
  },
  plugins: [animate]
};
