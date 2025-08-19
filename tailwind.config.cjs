/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff8ff',
          100: '#dbeefe',
          200: '#bfdfff',
          300: '#93c8ff',
          400: '#58a7ff',
          500: '#267fff',
          600: '#1a62db',
          700: '#184fb0',
          800: '#183f8a',
          900: '#16386f'
        }
      }
    }
  },
  plugins: []
};