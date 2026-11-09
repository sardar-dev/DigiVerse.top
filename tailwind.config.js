/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cloud Commerce design tokens
        bg: "#F6F8FC",
        surface: "#FFFFFF",
        ink: "#17213A",
        muted: "#6E7890",
        border: "#DFE5F0",
        brand: "#3169F5",
        "brand-light": "#73A0FF",
        "brand-soft": "#EDF2FB",
        "brand-dark": "#1E4FD6",
        success: "#15803D",
        "success-soft": "#ECFDF3",
        danger: "#DC2626",
        "danger-soft": "#FEF2F2",
        warning: "#B45309",
        "warning-soft": "#FFFBEB",

        // Legacy aliases kept so any missed class still resolves
        // sensibly during the transition — safe to remove once every
        // page has been migrated to the tokens above.
        paper: "#F6F8FC",
        wire: "#6E7890",
        line: "#DFE5F0",
        signal: "#DC2626",
      },
      fontFamily: {
        display: ["'Inter'", "'Noto Sans Arabic'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
        body: ["'Inter'", "'Noto Sans Arabic'", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "12px",
        sm: "8px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(23, 33, 58, 0.04), 0 1px 3px 0 rgba(23, 33, 58, 0.06)",
        "card-hover": "0 4px 10px 0 rgba(23, 33, 58, 0.08)",
      },
    },
  },
  plugins: [],
};
