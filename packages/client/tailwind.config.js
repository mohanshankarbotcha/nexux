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
        // Stitch V2 Technical Precision Theme Tokens
        canvas: {
          DEFAULT: '#121316',
          dark: '#0D0E11',
        },
        panel: {
          DEFAULT: '#16181D',
          elevated: '#1A1D23',
          hover: '#22262F',
          active: '#2C2E39',
        },
        divider: {
          DEFAULT: '#2D313A',
          focus: '#383D48',
        },
        primary: {
          DEFAULT: '#106EBE',
          hover: '#147FD6',
          active: '#0D5A9C',
          light: '#A2C9FF',
        },
        agent: {
          mint: '#0FF0CB',
          cyan: '#00FFFF',
          dim: 'rgba(15, 240, 203, 0.1)',
        },
        diagnostic: {
          success: '#31EC56',
          warning: '#FFAB00',
          error: '#E7473C',
          critical: '#D8125B',
        },
        foreground: {
          DEFAULT: '#F8F8F9',
          muted: '#A0A5B1',
          subtle: '#6B7280',
        },
        // Backward-compatible nexus aliases
        nexus: {
          950: '#0D0E11',
          900: '#121316',
          850: '#16181D',
          800: '#1A1D23',
          750: '#22262F',
          700: '#2C2E39',
          border: '#2D313A',
          'border-bright': '#383D48',
          accent: '#106EBE',
          'accent-hover': '#147FD6',
        },
      },
      fontFamily: {
        // Default: Owner requirement (Times New Roman for display/UI serif)
        serif: ['"Times New Roman"', 'Times', 'Source Serif 4', 'serif'],
        mono: ['"Courier Prime"', '"Courier New"', 'Consolas', 'Courier', 'monospace'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        label: ['"Courier Prime"', '"Courier New"', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem', // 10px
      },
      spacing: {
        '4.5': '1.125rem',
      },
    },
  },
  plugins: [],
};
