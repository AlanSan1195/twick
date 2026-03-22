// @ts-check
import { defineConfig } from 'astro/config';
import { esMX } from '@clerk/localizations'
import { dark, neobrutalism } from '@clerk/themes';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import clerk from '@clerk/astro';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://twick.dev',
  output: 'server',

  integrations: [
    react(), 
    sitemap({
      filter: (page) => 
        !page.includes('/api/') && 
        !page.includes('/sign-in') && 
        !page.includes('/sign-up'),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      i18n: {
        defaultLocale: 'es',
        locales: {
          es: 'es-MX',
        },
      },
    }),
    clerk({
      signInFallbackRedirectUrl: '/dashboard',
      signUpFallbackRedirectUrl: '/dashboard',
      signInUrl: '/sign-in',
      signUpUrl: '/sign-up',
      localization: esMX,
      appearance: {
        theme: dark,
      },
    })
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: node({
    mode: 'standalone',
  }),
});