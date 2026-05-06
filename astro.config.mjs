import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://legacyfinancial.app',
  output: 'static',
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
    maxDuration: 120,
  }),
  prefetch: true
});