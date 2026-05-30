# Roadmap de escalado de Twick

Plan por etapas para convertir Twick de MVP funcional a producto escalable para streamers. La idea es implementar una fase, probarla con usuarios o en local, ajustar, y solo después pasar a la siguiente.

## Visión

Twick debe pasar de ser un simulador de chat puntual a una herramienta recurrente de preparación y acompañamiento para streamers: configurar escenas, practicar, usar overlay en OBS, guardar estilos, generar audiencias con personalidad y medir sesiones.

El foco inicial no es añadir muchas funciones sueltas, sino crear una base persistente y monetizable.

## Prioridad Recomendada

1. Persistencia de datos por usuario.
2. Escenas de chat reutilizables.
3. Overlay OBS ligado a escenas.
4. Personalidades de audiencia.
5. Planes Free/Pro.
6. Analítica y entrenamiento.

---

## Etapa 0 — Auditoría y preparación

### Objetivo

Dejar claro qué estado vive hoy en memoria, qué rutas dependen de ese estado, y preparar el proyecto para cambios incrementales sin romper el MVP actual.

### Trabajo

- Documentar el comportamiento actual de:
  - `src/lib/phraseCache.ts`
  - `src/lib/overlayTokens.ts`
  - `src/lib/rateLimiter.ts`
  - `src/pages/api/generate-phrases.ts`
  - `src/pages/api/chat-stream.ts`
- Confirmar qué datos deben persistir:
  - juegos/temas del usuario
  - frases generadas
  - tokens de overlay
  - configuración de overlay
  - escenas guardadas
- Mantener el flujo actual funcionando mientras se agrega persistencia por detrás.

### Criterios de aceptación

- Existe una lista clara de entidades persistentes.
- `pnpm astro check` pasa sin errores.
- El dashboard actual sigue permitiendo generar frases e iniciar stream.
- El overlay actual sigue funcionando con token.

### Pruebas sugeridas

```bash
pnpm astro check
pnpm dev
```

Probar manualmente:

- Login.
- Generar frases para un juego.
- Cambiar a Just Chatting.
- Iniciar, pausar y detener stream.
- Generar URL de OBS.

---

## Etapa 1 — Persistencia por usuario

### Objetivo

Reemplazar progresivamente el estado crítico en memoria por almacenamiento persistente. Esta es la base para escalar a producción, múltiples instancias, cuentas Pro y datos históricos.

### Entidades iniciales

- `user_content`
  - usuario Clerk
  - tipo: `game` o `justchatting`
  - nombre normalizado
  - frases generadas
  - saludos iniciales
  - fecha de creación
  - fecha de última utilización
- `overlay_tokens`
  - usuario Clerk
  - token o hash de token
  - estado activo/revocado
  - fecha de expiración
- `usage_limits`
  - usuario Clerk
  - contador de juegos/temas
  - periodo de reset
  - plan actual

### Trabajo

- Elegir storage persistente. Recomendación: Supabase Postgres si quieres crecer hacia cuentas, billing y analítica; Upstash Redis si solo quieres cache compartida.
- Crear capa de acceso en `src/lib/` para no acoplar endpoints a la base de datos directamente.
- Mantener fallback temporal a memoria si la base no está configurada en local.
- Migrar primero lectura/escritura de juegos y temas.
- Después migrar tokens de overlay.

### Criterios de aceptación

- Los juegos/temas del usuario sobreviven reinicios del servidor.
- El límite de 4 juegos/temas sigue funcionando.
- El overlay token no desaparece por reiniciar el proceso.
- Si la base falla, el endpoint responde con error claro y no rompe silenciosamente.

### Pruebas sugeridas

- Generar juego, reiniciar `pnpm dev`, entrar de nuevo al dashboard y confirmar que sigue en la lista.
- Generar token de OBS, reiniciar servidor y confirmar que la URL sigue válida.
- Verificar errores `401`, `422` y `429`.

---

## Etapa 2 — Escenas de chat

### Objetivo

Crear la primera feature de producto fuerte: escenas reutilizables. Una escena guarda una configuración completa para que el streamer pueda volver a usarla sin reconstruir todo cada vez.

### Modelo de escena

Una escena debe guardar:

- nombre visible
- modo: `game` o `justchatting`
- juego o tema seleccionado
- plataforma: Twitch o Kick
- velocidad de mensajes
- saludos iniciales activados/desactivados
- configuración del overlay:
  - fondo transparente, color o blur
  - color
  - opacidad
  - tamaño de fuente
- fecha de creación y actualización

### Trabajo

- Crear entidad `chat_scenes`.
- Añadir acciones o endpoints para:
  - crear escena
  - listar escenas
  - actualizar escena
  - eliminar escena
  - marcar escena activa
- Añadir UI mínima en el dashboard:
  - selector de escenas
  - botón guardar escena
  - botón duplicar escena
  - botón eliminar escena
- Al seleccionar una escena, hidratar el estado actual del dashboard.

### Criterios de aceptación

- El usuario puede guardar la configuración actual como escena.
- El usuario puede cambiar entre escenas sin regenerar frases si el contenido ya existe.
- La escena activa alimenta el chat del dashboard.
- La escena activa alimenta la URL del overlay.

### Pruebas sugeridas

- Crear escena de juego.
- Crear escena de Just Chatting.
- Cambiar entre ambas y confirmar que el input, velocidad, plataforma y overlay cambian correctamente.
- Recargar la página y confirmar que las escenas siguen disponibles.

---

## Etapa 3 — Overlay OBS por escena

### Objetivo

Convertir el overlay en una URL estable por escena, no solo una URL generada con query params manuales. Esto mejora la experiencia en OBS y reduce errores del usuario.

### Trabajo

- Crear URL de overlay con `sceneId` y token:

```text
/overlay/chat?scene=<sceneId>&token=<token>
```

- Resolver la configuración del overlay en servidor usando la escena guardada.
- Mantener compatibilidad temporal con la URL actual basada en query params.
- Añadir botón en dashboard: copiar URL de escena para OBS.
- Añadir estado visual de token:
  - activo
  - expirado
  - regenerar

### Criterios de aceptación

- Cambiar configuración de escena actualiza el overlay sin cambiar la URL de OBS.
- Una URL de OBS sigue funcionando después de recargar el dashboard.
- Si el token expira o se revoca, el overlay muestra un error legible.

### Pruebas sugeridas

- Copiar URL de OBS de una escena.
- Cambiar velocidad o fondo de la escena.
- Recargar overlay y confirmar que usa la nueva configuración.
- Revocar token y confirmar error `401`.

---

## Etapa 4 — Personalidades de audiencia

### Objetivo

Diferenciar Twick de un generador genérico. El streamer debe poder elegir qué tipo de chat quiere simular.

### Personalidades iniciales

- `sarcastic`: humor irónico, sarcástico y peculiar.
- `normal`: audiencia fanática, respetuosa e interesante.
- `curious`: más preguntas y conversación.
- `chaotic`: mensajes ultra cortos con emotes 7TV garantizados.
- `chill`: comentarios relajados, menos intensidad.

### Trabajo

- Añadir tipo `AudiencePersonality`.
- Guardar personalidad en escenas.
- Ajustar prompts de IA en `src/lib/ai/serviceManager.ts`.
- Ajustar pesos de categorías en `src/lib/chatGenerator.ts`.
- Permitir cambiar personalidad antes de generar frases.

### Criterios de aceptación

- La personalidad afecta frases generadas por IA.
- La personalidad afecta distribución de mensajes durante el stream.
- Las escenas recuerdan la personalidad seleccionada.
- El usuario entiende la diferencia sin leer documentación larga.

### Pruebas sugeridas

- Generar el mismo juego con dos personalidades distintas.
- Comparar tono de mensajes.
- Confirmar que el stream usa las frases correctas.

---

## Etapa 5 — Plan Free y Pro

### Objetivo

Preparar monetización sin bloquear el aprendizaje del producto. El plan gratis debe ser útil, pero dejar claro el valor de subir a Pro.

### Propuesta de límites

Free:

- 4 juegos/temas cada 48 horas.
- 1 escena guardada.
- 1 token de overlay activo.
- personalidades básicas.

Pro:

- escenas ilimitadas o límite alto.
- más juegos/temas.
- personalidades avanzadas.
- estilos extra de overlay.
- historial de sesiones.
- generación más rápida o prioritaria.

### Trabajo

- Añadir entidad `plans` o campo `plan` por usuario.
- Centralizar límites en una función de dominio, no dispersos en endpoints.
- Actualizar mensajes de límite para sugerir upgrade sin ser invasivo.
- Preparar integración futura con Clerk Billing o Stripe.

### Criterios de aceptación

- Los límites se calculan por plan.
- El usuario Free conserva el comportamiento actual.
- El código permite añadir Pro sin reescribir endpoints.

### Pruebas sugeridas

- Usuario Free alcanza límite de contenido.
- Usuario Pro no queda bloqueado por el límite Free.
- Usuario Free intenta crear segunda escena y recibe error claro.

---

## Etapa 6 — Modo entrenamiento

### Objetivo

Transformar Twick en una herramienta de práctica real para streamers. No solo simula mensajes: ayuda a entrenar conversación, improvisación y manejo del chat.

### Funciones iniciales

- Sesiones de práctica con duración.
- Eventos simulados:
  - muchas preguntas seguidas
  - momento de hype
  - silencio del chat
  - comentario incómodo moderado
- Botón de oleadas más completo.
- Marcadores de momento durante la sesión.

### Trabajo

- Crear entidad `practice_sessions`.
- Registrar inicio, fin, escena usada y duración.
- Añadir controles para disparar eventos.
- Guardar eventos relevantes durante la sesión.

### Criterios de aceptación

- El usuario puede iniciar una sesión de práctica desde una escena.
- El sistema registra duración y eventos.
- El usuario puede terminar sesión y ver resumen básico.

### Pruebas sugeridas

- Iniciar sesión.
- Disparar oleadas.
- Detener sesión.
- Confirmar que se guarda resumen.

---

## Etapa 7 — Analítica básica

### Objetivo

Dar feedback al streamer y crear valor recurrente.

### Métricas iniciales

- duración de sesión
- mensajes simulados
- preguntas generadas
- reacciones generadas
- oleadas disparadas
- personalidad usada
- escena usada

### Trabajo

- Crear vista de resumen después de sesión.
- Añadir historial simple de sesiones.
- Mostrar recomendaciones básicas:
  - aumentar o bajar velocidad
  - usar más preguntas
  - probar otra personalidad
  - guardar escena si se usó mucho

### Criterios de aceptación

- Cada sesión terminada muestra resumen.
- El usuario puede ver las últimas sesiones.
- Las recomendaciones salen de datos reales de la sesión.

### Pruebas sugeridas

- Hacer dos sesiones con escenas distintas.
- Confirmar métricas separadas.
- Confirmar que una sesión sin mensajes no rompe el resumen.

---

## Etapa 8 — Pulido de producto y crecimiento

### Objetivo

Mejorar activación, retención y adquisición.

### Ideas

- Onboarding guiado para primera escena.
- Plantillas recomendadas por tipo de streamer.
- Galería de presets:
  - terror
  - cozy
  - competitivo
  - Just Chatting
  - debut streamer
- Página pública de ejemplos.
- Mejor SEO orientado a:
  - simulador de chat para streamers
  - practicar stream Twitch
  - overlay chat OBS
  - chat falso Twitch para práctica

### Criterios de aceptación

- Un usuario nuevo puede llegar, crear una escena y copiar una URL de OBS en menos de 2 minutos.
- La landing explica claramente el valor del overlay y las escenas.
- Hay un flujo claro para volver al producto después del primer uso.

---

## Orden sugerido de implementación

### Sprint 1

- Etapa 0.
- Definir entidades.
- Elegir storage.
- Crear capa de persistencia.

### Sprint 2

- Persistir juegos/temas.
- Persistir frases generadas.
- Mantener límite Free actual.

### Sprint 3

- Persistir tokens de overlay.
- Crear escenas.
- UI mínima para guardar/cargar escenas.

### Sprint 4

- Overlay por escena.
- URL estable para OBS.
- Compatibilidad con URL actual.

### Sprint 5

- Personalidades de audiencia.
- Ajuste de prompts.
- Guardar personalidad en escenas.

### Sprint 6

- Límites por plan.
- Preparación Free/Pro.
- Mensajes de upgrade.

### Sprint 7

- Sesiones de práctica.
- Resumen básico.
- Historial inicial.

## Riesgos técnicos

- La cache en memoria no escala a múltiples instancias.
- Los tokens actuales se pierden al reiniciar servidor.
- El overlay depende de que las frases existan o se generen al cargar.
- Las respuestas de IA pueden fallar al parsear JSON.
- Si se agregan planes de pago sin centralizar límites, el código se puede llenar de condiciones duplicadas.

## Reglas de implementación

- Mantener cambios pequeños y probables.
- No romper el flujo actual mientras se migra.
- Añadir persistencia detrás de interfaces primero.
- Cada etapa debe pasar `pnpm astro check`.
- Probar manualmente dashboard y overlay después de cada etapa.
- Evitar dependencias nuevas salvo que resuelvan un problema claro.

## Primera tarea recomendada

Implementar una capa de persistencia para contenido generado:

- crear funciones tipo `getUserContent`, `saveUserContent`, `listUserContent`
- adaptar `generate-phrases.ts` para usar esa capa
- mantener `phraseCache.ts` como fallback temporal
- verificar que un juego generado sobreviva reinicio del servidor

Esta tarea desbloquea escenas, planes, overlay estable y analítica.
