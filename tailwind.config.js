/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        steel: { 950: '#17202a', 800: '#27343f', 600: '#4a5b69', 300: '#b9c3cb', 100: '#e8ecef', 50: '#f4f6f7' },
        belt: { 700: '#1d5a78', 600: '#256f93', 100: '#dcebf2' },
        amber: { chain: '#e3a008' },
        brand: { navy: '#003080', green: '#008040' },
      },
      fontFamily: {
        sans: ['Bahnschrift', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
