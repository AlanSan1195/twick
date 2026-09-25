# Integración de emotes Top de 7TV

**Estado:** implementada. El catálogo utiliza la sección Top de [7TV](https://7tv.app/emotes), ordenada por popularidad histórica (`TOP_ALL_TIME`). El diseño anterior basado en URLs de sets fue retirado.

## Flujo actual

1. `src/lib/sevenTv/catalog.ts` hace una consulta fija a `https://7tv.io/v4/gql` con `emotes.search(sort: { order: DESCENDING, sortBy: TOP_ALL_TIME }, page: 1, perPage: 100)`. La consulta vive solo en el servidor; no acepta URLs del cliente.
2. La respuesta GraphQL se valida. Cada emote usable conserva `id`, `name` e `imageUrl`; se elige el WebP de `cdn.7tv.app` con ancho más cercano a 48 px y se deduplican los IDs.
3. El snapshot es síncrono. Inicia la carga o el refresco en segundo plano y devuelve inmediatamente el catálogo disponible. La caché dura 15 minutos; durante una falla, los datos previos pueden usarse hasta una hora. Una solicitud simultánea reutiliza la carga en curso; cada llamada tiene un timeout de 5 segundos y un fallo activa una espera de 30 segundos antes del siguiente intento.
4. `src/lib/chatRealism.ts` limpia emojis Unicode ya presentes en las frases, aplica una variación de escritura independiente y decide un único adorno por mensaje. Si la frase solo tenía emojis, usa un texto breve según su categoría.
5. Si toca 7TV, `src/lib/sevenTv/selector.ts` elige desde la lista plana. El texto aporta afinidad por palabras y grupos de intención. Se evitan los últimos 20 IDs cuando hay alternativas y nunca se repite un ID dentro de un mensaje caótico.
6. `src/pages/api/chat-stream.ts` fija texto y adorno después de establecer el contenido final de saludos, mensajes normales y waves. El SSE envía `content` y `emotes` dentro de cada mensaje; `ChatMessage` solo los presenta, estables incluso si una fila se remonta.

## Frecuencia de selección

| Resultado por mensaje | Probabilidad |
|---|---:|
| Un emoji Unicode | 10 % |
| Emote de 7TV | 75 % |
| Solo texto | 15 % |

Los tres resultados son excluyentes y se sortean con la misma frecuencia para todas las categorías y personalidades. La probabilidad de 7TV supone que hay catálogo disponible; si falla o todavía se está cargando, el mensaje conserva solo texto. Si entra un emote, `chaotic` elige uno el 70 % de las veces, dos el 25 % y tres el 5 %, según la disponibilidad de IDs distintos.

De manera independiente, cada mensaje tiene un 30 % de probabilidad de recibir **una** variación: una falta leve de ortografía, puntuación expresiva (`!`, `!!!`, `?!`, `<3`) o todo el texto en mayúsculas. Se elige una de las tres posibilidades al azar. Si la falta o las mayúsculas no modificarían una frase corta, se utiliza puntuación. El texto se transforma antes de buscar afinidad con los emotes.

## Verificación

- [x] La búsqueda Top usa la consulta GraphQL fija y obtiene los primeros 100 resultados.
- [x] El catálogo rechaza datos inválidos, imágenes fuera del CDN y respuestas GraphQL con errores; deduplica IDs.
- [x] La carga no bloquea el stream y una falla temporal conserva datos recientes.
- [x] El selector mantiene afinidad, variedad y emotes caóticos distintos sin depender de sets.
- [x] La decoración por mensaje reparte 10/75/15, limpia emojis previos y aplica el 30 % de variación independiente.
- [x] El SSE conserva la selección al remontar mensajes y el navegador solo carga imágenes del CDN.
- [x] `README.md` y los planes de TestSprite describen Top.

Ejecutar `pnpm test:7tv`, `pnpm astro check` y `pnpm build` antes de entregar cambios sobre esta integración.
