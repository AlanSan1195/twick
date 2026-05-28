// ============================================
// AUTH DE DESARROLLO — sesión local para pruebas
// ============================================

export const DEV_AUTH_COOKIE = 'twick_dev_auth';
export const DEV_AUTH_USER_ID = 'dev:tester';
export const DEV_AUTH_USERNAME = 'tester@twick.dev';
export const DEV_AUTH_PASSWORD = 'twick-dev-2026';

const DEV_AUTH_COOKIE_VALUE = 'dev-session-v1';

/**
 * Indica si el login local de desarrollo está disponible.
 */
export function isDevAuthEnabled(): boolean {
  return import.meta.env.DEV;
}

/**
 * Valida las credenciales del usuario local de testing.
 */
export function validateDevCredentials(username: string, password: string): boolean {
  return isDevAuthEnabled()
    && username === DEV_AUTH_USERNAME
    && password === DEV_AUTH_PASSWORD;
}

/**
 * Lee una cookie concreta desde el header Cookie del request.
 */
function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawKey, ...rawValue] = pair.trim().split('=');
    if (rawKey === name) {
      try {
        return decodeURIComponent(rawValue.join('='));
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Devuelve el userId local si existe una sesión de desarrollo válida.
 */
export function getDevUserId(request: Request): string | null {
  if (!isDevAuthEnabled()) return null;

  const cookieValue = readCookie(request, DEV_AUTH_COOKIE);
  return cookieValue === DEV_AUTH_COOKIE_VALUE ? DEV_AUTH_USER_ID : null;
}

/**
 * Resuelve primero Clerk y usa la sesión local solo como fallback en dev.
 */
export function resolveSessionUserId(locals: App.Locals, request: Request): string | null {
  const auth = locals.auth?.();
  return auth?.userId ?? getDevUserId(request);
}

/**
 * Configuración de cookie para crear una sesión local de testing.
 */
export function getDevAuthCookieValue(): string {
  return DEV_AUTH_COOKIE_VALUE;
}
