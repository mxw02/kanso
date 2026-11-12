/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        zen: {
          950: '#090a0f',
          900: '#0f111a',
          850: '#151824',
          800: '#1b1f2e',
          700: '#282e44',
          600: '#3c4463',
          400: '#8b95b5',
          200: '#ccd2e3',
          50: '#f8f9fc',
        },
        kanso: {
          accent: '#6366f1',
          agent: '#10b981',
          human: '#3b82f6',
        },
      },
    },
  },
  plugins: [],
};
