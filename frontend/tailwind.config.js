/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        coffee: { DEFAULT: '#3B2318', dark: '#241309' },
        turmeric: { DEFAULT: '#E8A33D', deep: '#C97F1F' },
        leaf: { DEFAULT: '#4B6B3A', deep: '#33492A' },
        cream: '#FBF3E4',
        chili: '#B23A2E',
      },
    },
  },
  plugins: [],
};
