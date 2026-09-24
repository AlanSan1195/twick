# Guía de implementación: biblioteca de emotes 7TV

Esta guía define cómo reemplazar la selección actual de emotes por una biblioteca de sets 7TV configurada en el servidor. Para activar otro set, un desarrollador añadirá una URL al registro; la carga, selección, API de mensajes y renderizado seguirán funcionando sin cambios por set.

**Estado:** fases 1 y 2 completadas; fases 3–4 pendientes. La configuración y los tipos que aparecen abajo son el contrato propuesto.

## Ruta de implementación

| Fase | Trabajo | Resultado para avanzar |
|---|---|---|
| 1. Registro y catálogo | Validar URLs, consultar cada set por ID, normalizar emotes y añadir caché independiente. | Una segunda URL se carga sin tocar otro archivo; un set inválido o caído no impide cargar los demás. |
| 2. Selector | Añadir la decisión de frecuencia, afinidad y rotación a una función pura con estado por stream. **Completada** en `src/lib/sevenTv/selector.ts`; pruebas reproducibles en `tests/sevenTvSelector.test.mjs` (`pnpm test:7tv`). | Con aleatoriedad controlada se comprueban probabilidades, reparto entre sets y ausencia de duplicados recientes. |
| 3. Mensajes y vistas | Ampliar `ChatMessage`, adjuntar emotes al enviar SSE y actualizar chat, vista previa y diagnóstico. | Un mensaje conserva sus emotes al remontarse; dashboard, overlay y vista previa muestran el mismo formato. |
| 4. Integración final | Ajustar CSP, actualizar referencias al set global y comprobar el proyecto. | El navegador solo pide imágenes al CDN; `pnpm astro check` y `pnpm build` terminan sin errores. |

Completar las fases en este orden. El selector de la fase 2 recibe el catálogo normalizado de la fase 1; la fase 3 consume su resultado sin volver a consultar 7TV.

## Resultado esperado

- El set de IlloJuan es la única fuente inicial: `https://7tv.app/emote-sets/01FEEQAQM0000409S3FGDM8BN7`.
- Cada URL válida añadida al registro queda activa automáticamente para todos los streams.
- Una falla o un set vacío no impide usar los demás sets ni detiene la generación del chat.
- Cada mensaje conserva su selección de emotes aunque React vuelva a montar su fila.
- No se añade una dependencia ni una interfaz para administrar sets.

## Estado actual

`src/components/ChatMessage.tsx` consulta el set global de 7TV, mantiene una caché en memoria del cliente y elige un emote al montar cada mensaje. La lista virtualizada puede desmontar y volver a montar filas, lo que vuelve a sortear el emote. En mensajes caóticos también se repite la misma imagen dos o tres veces.

`src/pages/api/chat-stream.ts` genera y envía mensajes por SSE. `src/middleware.ts` permite conexiones directas del navegador a 7TV y permite imágenes del CDN. La integración nueva moverá la consulta y la elección al servidor. El stream enviará la selección ya fijada en el propio mensaje.

## Diseño

### 1. Registrar las fuentes de 7TV

Crear un registro único, por ejemplo `src/lib/sevenTv/registry.ts`:

```ts
export const SEVEN_TV_SET_URLS = [
  'https://7tv.app/emote-sets/01FEEQAQM0000409S3FGDM8BN7',
] as const;
```

El registro contiene URLs de páginas 7TV o URLs de su API REST:

```text
https://7tv.app/emote-sets/{id}
https://7tv.io/v3/emote-sets/{id}
```

Validar que el protocolo sea HTTPS, el host sea exactamente `7tv.app` o `7tv.io`, y la ruta coincida con uno de esos patrones. Extraer el ID y construir la URL de consulta `https://7tv.io/v3/emote-sets/{id}`; nunca hacer `fetch` a una URL arbitraria del registro. Ignorar query strings y fragmentos. Si una entrada es inválida, omitirla y registrar un aviso `[7TV]` con su posición; las demás fuentes deben seguir cargando. Si ninguna es válida, el chat continúa sin emotes.

El endpoint oficial expone el set global y los sets por ID mediante `GET /v3/emote-sets/{id}` ([código de rutas de 7TV](https://github.com/SevenTV/SevenTV/blob/main/apps/api/src/http/v3/rest/emote_sets.rs)).

**Añadir un set nuevo:** agregar una línea con su URL de `7tv.app` al arreglo y desplegar esa configuración. El loader detecta el ID, consulta la API y lo incorpora al catálogo sin editar el selector, el componente visual, la ruta SSE ni el middleware. Por ejemplo, la única edición para un segundo set sería:

```ts
export const SEVEN_TV_SET_URLS = [
  'https://7tv.app/emote-sets/01FEEQAQM0000409S3FGDM8BN7',
  'https://7tv.app/emote-sets/ID_REAL_DEL_SEGUNDO_SET',
] as const;
```

`ID_REAL_DEL_SEGUNDO_SET` es un marcador que debe sustituirse por el ID de la URL real.

### 2. Cargar y normalizar cada set

Crear un servicio de servidor en `src/lib/sevenTv/` que gestione las fuentes del registro y entregue al selector entradas normalizadas con `id`, `name`, `setId` y `imageUrl`.

- Validar la estructura recibida antes de usarla; omitir emotes sin ID, nombre o imagen WebP utilizable.
- Aceptar únicamente URLs de imagen HTTPS del host `cdn.7tv.app`. Elegir el archivo WebP de aproximadamente 2x del tamaño de presentación (24 px), con fallback al WebP disponible más cercano.
- Mantener una caché por ID de set con TTL de 15 minutos y una respuesta anterior utilizable durante un máximo de una hora.
- Deduplicar solicitudes simultáneas por set, limitar cada consulta a 5 segundos y cargar como máximo tres sets en paralelo por proceso.
- Al refrescar el catálogo, usar `Promise.allSettled` o un equivalente: una respuesta fallida no descarta sets cargados correctamente.
- No bloquear el inicio ni los ticks SSE esperando a 7TV. Iniciar o refrescar la carga en segundo plano; hasta tener catálogo usable, enviar mensajes sin emotes.
- Si un set aparece en más de una fuente, consultar su ID una sola vez. Si un emote aparece en varios sets, deduplicar por ID de emote y conservar la primera aparición según el orden del registro; omitir los sets que queden vacíos tras deduplicar.

La caché vive en memoria por instancia del servidor y guarda el catálogo normalizado, no el JSON completo de 7TV. La implementación no debe asumir que es compartida entre procesos o despliegues. Registrar con el prefijo `[7TV]` los fallos de carga y la cantidad de emotes útiles por set, sin exponer esos errores al chat.

### 3. Elegir emotes con contexto y variedad

Crear un selector puro que reciba el mensaje final, su categoría y personalidad, el catálogo normalizado y el estado de selección del stream. No debe llamar a 7TV ni a un modelo de IA. Cuando `message.sub` exista, usar la probabilidad de suscripción antes que la de `message.category`.

**Probabilidad base por categoría:**

| Categoría | Probabilidad |
|---|---:|
| Preguntas | 20 % |
| Gameplay | 30 % |
| Comentarios | 35 % |
| Reacciones | 55 % |
| Mensaje de suscripción (`message.sub`) | 10 % |

Aplicar estos ajustes antes del límite final: `chaotic` suma 15 puntos; `chill` resta 10; dos mensajes seguidos con emote restan 20; cuatro mensajes seguidos sin emote suman 10. Limitar la probabilidad resultante al rango de 10–75 %.

Para asociar emotes al texto, normalizar los nombres y el mensaje (minúsculas, acentos y palabras en `camelCase`) y reconocer términos y sinónimos en español e inglés. Usar estos grupos generales: risa, hype/celebración, sorpresa/miedo, tristeza/decepción y duda/confusión. Puntuar cada emote por coincidencia de palabras o grupo: una coincidencia de palabra vale 2 puntos y una del grupo vale 1. Solo una puntuación mayor que cero cuenta como afinidad; los nombres de comunidad que no describen una emoción seguirán siendo elegibles mediante el fallback aleatorio. No se necesita configuración de aliases por set: así, un set nuevo se activa añadiendo únicamente su URL.

Para que un set grande no domine a los pequeños, hallar la puntuación máxima entre todos los sets, elegir con igual probabilidad uno de los sets que alcanzan ese máximo y después elegir un emote de ese set con esa puntuación. Si ningún emote puntúa, elegir primero un set disponible al azar y luego un emote de él. Mantener por stream una cola de los últimos 20 IDs. Excluirlos antes de elegir el set; si no queda ningún candidato en ningún set, permitir de nuevo el conjunto elegible. Para un segundo o tercer emote, repetir la elección excluyendo los IDs ya elegidos en ese mensaje; si se agota el grupo de mayor afinidad, usar los demás candidatos. Nunca repetir un ID dentro del mismo mensaje.

Estas reglas de cantidad se aplican solo si el mensaje supera primero el sorteo de frecuencia: un mensaje normal recibe un emote; uno `chaotic` recibe un emote el 70 % de las veces, dos el 25 % y tres el 5 %, si hay suficientes candidatos distintos. Elegir posición de forma independiente por emote: 30 % al inicio y 70 % al final.

### 4. Fijar la selección en el mensaje y renderizarla

Añadir a `ChatMessage` en `src/utils/types.ts` una propiedad opcional compatible con mensajes existentes:

```ts
emotes?: Array<{
  id: string;
  name: string;
  url: string;
  position: 'start' | 'end';
}>;
```

En `src/pages/api/chat-stream.ts`, aplicar el selector después de establecer el contenido y categoría que realmente se enviarán. Cubrir saludos iniciales, mensajes normales, mensajes de wave y mensajes preconstruidos. En particular, aplicar la selección a la frase final de un wave, no al texto provisional que se use para construirlo. Mantener el historial de repeticiones dentro de cada conexión SSE.

En `src/components/ChatMessage.tsx`, quitar la carga, el sorteo y los estados que deciden qué emote se muestra. Renderizar `message.emotes` en su posición, manteniendo el texto aunque una imagen falle. Usar dimensiones que no deformen las imágenes ni causen saltos de layout. El componente puede ocultar una imagen rota, pero no sustituirla por otro emote.

Actualizar `src/components/OverlayPreview.tsx` con al menos un mensaje de muestra que incluya el nuevo campo `emotes`; así la vista previa conserva un ejemplo visible tras retirar el sorteo del componente. Actualizar `src/dev/SevenTvEmoteTest.tsx` y `src/pages/dev/chat.astro` para que el diagnóstico use el mismo servicio de servidor y el formato normalizado. No conservar una consulta directa del navegador a 7TV.

En `src/middleware.ts`, quitar `7tv.io` y `*.7tv.io` de `connect-src`, y conservar `https://cdn.7tv.app` en `img-src`. Mantener intactas las reglas de Clerk, autenticación, rate limit y los demás encabezados.

## Verificación y criterios de aceptación

Usar datos de 7TV simulados y aleatoriedad inyectada para comprobar el loader y el selector sin depender de la red. Añadir un script `test:7tv` con el runner integrado de Node, sin dependencia adicional; comprobar las vistas con el servidor local. Ejecutar la comprobación de tipos y el build al cerrar la fase 4.

- [ ] El registro inicial contiene solo el set de IlloJuan.
- [ ] Añadir una URL válida de otro set lo activa automáticamente sin cambios en selector, SSE o UI.
- [ ] URLs con otro host, protocolo o ruta se omiten con un aviso `[7TV]`; no provocan solicitudes a hosts arbitrarios ni impiden cargar otras fuentes.
- [ ] Dos solicitudes simultáneas al mismo set producen una sola petición upstream.
- [ ] Un set caído, inválido o vacío no bloquea los demás ni retrasa la aparición del texto.
- [ ] Emotes duplicados entre sets se muestran una sola vez en el catálogo combinado.
- [x] La selección respeta las probabilidades, la afinidad contextual, la rotación reciente y los límites de mensajes caóticos (`pnpm test:7tv`).
- [x] La regla de uno, dos o tres emotes caóticos se aplica después del sorteo de frecuencia y no duplica IDs dentro del mensaje (`pnpm test:7tv`).
- [ ] La selección no cambia al desmontar y volver a montar una fila virtualizada.
- [ ] La vista previa muestra al menos un emote definido en su mensaje de muestra.
- [ ] El diagnóstico de desarrollo usa el mismo servicio y no consulta 7TV desde el navegador.
- [ ] La CSP permite imágenes de `cdn.7tv.app` y no requiere conexión del navegador con 7TV.
- [ ] `pnpm astro check` termina sin errores y `pnpm build` completa correctamente.

## Archivos a revisar durante la implementación

- `src/lib/sevenTv/`: registro de URLs, cliente, normalización, caché y selector.
- `src/pages/api/chat-stream.ts` y `src/utils/types.ts`: selección y contrato SSE.
- `src/components/ChatMessage.tsx`, `src/components/OverlayPreview.tsx`, `src/middleware.ts` y diagnóstico `/dev/chat`: render, vista previa, CSP y soporte de desarrollo.
- `package.json`: añadir el script `test:7tv` sin instalar dependencias.
- `README.md`, `testsprite_tests/standard_prd.json` y `testsprite_tests/testsprite_frontend_test_plan.json`: actualizar las referencias obsoletas al set global y a la probabilidad fija.
