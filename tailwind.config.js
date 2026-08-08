/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)'
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Iowan Old Style"', '"Times New Roman"', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        hebrew: ['"SBL Hebrew"', '"Ezra SIL"', '"Times New Roman"', 'serif'],
        greek: ['"SBL Greek"', 'Cardo', '"New Athena Unicode"', 'Georgia', 'serif']
      },
      fontSize: {
        scripture: ['1.125rem', { lineHeight: '1.9' }]
      }
    }
  },
  plugins: []
}
