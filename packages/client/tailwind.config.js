/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        nexus: {
          950: '#070a12',
          900: '#0c111d',
          850: '#111827',
          800: '#172235',
          750: '#1e293b',
          700: '#2d3b53',
          border: '#1f2937',
          'border-bright': '#374151',
          accent: '#38bdf8',
          'accent-hover': '#0ea5e9',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
