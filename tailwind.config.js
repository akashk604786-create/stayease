/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./views/**/*.{html,ejs}"],
  theme: {
    extend: {
      colors: {
        // Warm paper canvas
        cream: {
          DEFAULT: "#FBF8F3",
          deep: "#F4EDE3",
        },
        // Charcoal text
        ink: {
          DEFAULT: "#221F1B",
          soft: "#5C554C",
          faint: "#8E867B",
        },
        // Muted terracotta accent
        clay: {
          50: "#FBF1EB",
          100: "#F4DED1",
          200: "#E7BFA8",
          300: "#D69C7C",
          400: "#C57A55",
          500: "#B05F3B",
          600: "#914B2D",
        },
        line: "#E8DFD2",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica Neue",
          "sans-serif",
        ],
        display: ["Fraunces", "Iowan Old Style", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(34,31,27,0.04), 0 10px 26px -14px rgba(34,31,27,0.14)",
        lift: "0 2px 4px rgba(34,31,27,0.04), 0 22px 44px -18px rgba(34,31,27,0.24)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise 0.55s cubic-bezier(0.22, 0.68, 0.28, 1) both",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 0.68, 0.28, 1)",
      },
    },
  },
  plugins: [],
};
