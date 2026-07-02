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

  // El CSRF nativo de Astro (checkOrigin) da un falso positivo 403 detrás de Traefik por la
  // regresión de @astrojs/node 10.1: Request.url no honra X-Forwarded-Host/Proto (issue
  // withastro/astro#16945), así el Origin (https://twick.dev) no coincide con el host interno.
  // Solo afecta a /api/voice-react (multipart/form-data). La protección CSRF real se hace vía
  // authorizedParties de Clerk en src/middleware.ts.
  security: {
    checkOrigin: false,
  },

  integrations: [
    react(), 
    sitemap({
      filter: (page) => 
        !page.includes('/api/') && 
        !page.includes('/sign-in') && 
        !page.includes('/sign-up') &&
        !page.includes('/dev-login') &&
        !page.includes('/dev/') &&
        !page.includes('/overlay/') &&
        !page.includes('/dashboard'),
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
