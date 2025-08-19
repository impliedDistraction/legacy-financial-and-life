import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://legacyf-l.vercel.app', // update after deploy
  integrations: [tailwind({ applyBaseStyles: false })],
  prefetch: true
});