# Integración de emotes Top de 7TV

**Estado:** implementada. El catálogo utiliza la sección Top de [7TV](https://7tv.app/emotes), ordenada por popularidad histórica (`TOP_ALL_TIME`). El diseño anterior basado en URLs de sets fue retirado.

## Flujo actual

1. `src/lib/sevenTv/catalog.ts` hace una consulta fija a `https://7tv.io/v4/gql` con `emotes.search(sort: { order: DESCENDING, sortBy: TOP_ALL_TIME }, page: 1, perPage: 100)`. La consulta vive solo en el servidor; no acepta URLs del cliente.
2. La respuesta GraphQL se valida. Cada emote usable conserva `id`, `name` e `imageUrl`; se elige el WebP de `cdn.7tv.app` con ancho más cercano a 48 px y se deduplican los IDs.
3. El snapshot es síncrono. Inicia la carga o el refresco en segundo plano y devuelve inmediatamente el catálogo disponible. La caché dura 15 minutos; durante una falla, los datos previos pueden usarse hasta una hora. Una solicitud simultánea reutiliza la carga en curso; cada llamada tiene un timeout de 5 segundos y un fallo activa una espera de 30 segundos antes del siguiente intento.
4. `src/lib/sevenTv/selector.ts` decide por mensaje con una función pura y una lista plana de emotes. La frecuencia depende de categoría, personalidad, suscripción y rachas. El texto aporta afinidad por palabras y grupos de intención. Se evitan los últimos 20 IDs cuando hay alternativas y nunca se repite un ID dentro de un mensaje caótico.
5. `src/pages/api/chat-stream.ts` fija la selección después de establecer el texto final de saludos, mensajes normales y waves. El SSE envía `emotes` dentro de cada mensaje; `ChatMessage` solo presenta esa selección, estable incluso si una fila se remonta.

## Frecuencia de selección

| Mensaje | Probabilidad base |
|---|---:|
| Pregunta | 20 % |
| Gameplay | 30 % |
| Comentario | 35 % |
| Reacción | 55 % |
| Suscripción | 10 % |

La personalidad `chaotic` suma 15 puntos y `chill` resta 10. Dos mensajes seguidos con emote restan 20; cuatro sin emote suman 10. El resultado se limita a 10–75 %. Si entra un emote, `chaotic` elige uno el 70 % de las veces, dos el 25 % y tres el 5 %, según la disponibilidad de IDs distintos.

## Verificación

- [x] La búsqueda Top usa la consulta GraphQL fija y obtiene los primeros 100 resultados.
- [x] El catálogo rechaza datos inválidos, imágenes fuera del CDN y respuestas GraphQL con errores; deduplica IDs.
- [x] La carga no bloquea el stream y una falla temporal conserva datos recientes.
- [x] El selector mantiene probabilidades, afinidad, variedad y emotes caóticos distintos sin depender de sets.
- [x] El SSE conserva la selección al remontar mensajes y el navegador solo carga imágenes del CDN.
- [x] `README.md` y los planes de TestSprite describen Top.

Ejecutar `pnpm test:7tv`, `pnpm astro check` y `pnpm build` antes de entregar cambios sobre esta integración.
