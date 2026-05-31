/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#17171c",
        ink: "#212121",
        "deep-green": "#003c33",
        "dark-navy": "#071829",
        canvas: "#ffffff",
        "soft-stone": "#eeece7",
        "pale-green": "#edfce9",
        "pale-blue": "#f1f5ff",
        hairline: "#d9d9dd",
        "border-light": "#e5e7eb",
        muted: "#93939f",
        slate: "#75758a",
        coral: "#ff7759",
        "coral-soft": "#ffad9b",
        "action-blue": "#1863dc",
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "22px",
        xl: "30px",
        pill: "32px",
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui"],
        body: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
