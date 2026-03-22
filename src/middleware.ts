import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { defineMiddleware, sequence } from 'astro:middleware';
import {
  checkIpRateLimit,
  getRemainingRequests,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
} from './lib/rateLimiter';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/api/(.*)',  // Protege TODOS los endpoints API
  '/dev/(.*)'   // Protege rutas de desarrollo/debug
]);

const isApiRoute = createRouteMatcher(['/api/(.*)']);

// Middleware de rate limiting por IP — se aplica solo a rutas API
const rateLimitMiddleware = defineMiddleware(async (context, next) => {
  if (!isApiRoute(context.request)) {
    return next();
  }

  // Extraer IP del request (Traefik inyecta x-forwarded-for)
  const forwarded = context.request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';

  if (!checkIpRateLimit(ip)) {
    const remaining = getRemainingRequests(ip);
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
          'X-RateLimit-Remaining': String(remaining),
        },
      }
    );
  }

  return next();
});

// Middleware para headers de seguridad
const securityHeaders = defineMiddleware(async (context, next) => {
  const response = await next();
  const isDev = import.meta.env.DEV;
  
  // Prevenir clickjacking
  response.headers.set('X-Frame-Options', 'DENY');
  
  // Prevenir MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Habilitar XSS protection en navegadores antiguos
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Controlar información del referrer
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Prevenir que el sitio sea embebido (más moderno que X-Frame-Options)
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Content Security Policy - ajustada para Clerk y recursos necesarios
  // En desarrollo usamos dominios de dev, en producción usamos el dominio personalizado
  const clerkDomains = isDev
    ? {
        script: "https://*.clerk.accounts.dev",
        connect:
          "https://*.clerk.accounts.dev https://api.clerk.com https://clerk-telemetry.com wss://*.clerk.accounts.dev https://7tv.io https://*.7tv.io",
        frame: "https://*.clerk.accounts.dev",
        img: "https://*.clerk.com https://img.clerk.com https://cdn.7tv.app",
      }
    : {
        script: "https://*.twick.dev https://*.clerk.com",
        connect:
          "https://*.twick.dev https://api.clerk.com https://clerk-telemetry.com wss://*.clerk.com https://7tv.io https://*.7tv.io",
        frame: "https://*.twick.dev https://*.clerk.com",
        img: "https://*.clerk.com https://img.clerk.com https://*.twick.dev https://cdn.7tv.app",
      };

  const connectSrc = isDev
    ? `connect-src 'self' ${clerkDomains.connect} ws://localhost:* ws://127.0.0.1:*`
    : `connect-src 'self' ${clerkDomains.connect}`;
  
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${clerkDomains.script} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${clerkDomains.img}`,
    "font-src 'self' data:",
    connectSrc,
    `frame-src 'self' https://challenges.cloudflare.com ${clerkDomains.frame}`,
    "worker-src 'self' blob:",
  ].join('; ');
  
  response.headers.set('Content-Security-Policy', csp);
  
  return response;
});

// Middleware de autenticación con Clerk
const authMiddleware = clerkMiddleware((auth, context) => {
  // clerck nos permite extraer este metodo de redirect y de obtener el userId para seber si el usuario ha iniciado sesión o no
  const { redirectToSignIn, userId } = auth();
  
  if (!userId && isProtectedRoute(context.request)) {
    return redirectToSignIn();
  }
});

// Combinar middlewares: rate limit -> auth -> headers de seguridad
export const onRequest = sequence(rateLimitMiddleware, authMiddleware, securityHeaders);
