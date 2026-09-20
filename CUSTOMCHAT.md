# Custom Chat — plan de personalización

## Objetivo

Permitir que la persona usuaria configure desde el dashboard la apariencia del chat en tres superficies coherentes:

- Chat de control dentro del dashboard.
- Vista previa del overlay.
- Overlay de OBS mediante la URL generada.

Las capturas de referencia inspiran dos direcciones visuales: mensajes como tarjetas separadas y nombre de usuario tratado como una etiqueta independiente. No se busca reproducirlas píxel por píxel; se conservará la identidad visual actual de Twick y se añadirán opciones controladas.

## Alcance y decisiones

- El aspecto actual será el preset predeterminado y seguirá siendo compatible con las URLs existentes.
- La personalización se aplicará al área de mensajes; no rediseñará el resto del dashboard.
- Las preferencias se guardarán en `localStorage` del navegador para restaurarse después de una recarga.
- Los cambios del dashboard y la vista previa serán inmediatos.
- OBS recibirá la apariencia mediante parámetros de la URL. Si una fuente ya está abierta, la persona usuaria deberá copiar la URL actualizada y reemplazarla en OBS.
- El token del overlay no cambiará al modificar la apariencia.
- No se añadirá almacenamiento en servidor ni dependencias nuevas.

## Fases de implementación

### Fase 1 — Modelo compartido de apariencia

Crear en `src/utils/types.ts` el tipo `ChatAppearance` y sus valores predeterminados.

El modelo debe incluir, como mínimo:

| Campo | Propósito | Regla inicial |
|---|---|---|
| `preset` | Seleccionar el diseño base | `current`, `cards` o `separated-name` |
| `messageGap` | Separación vertical entre mensajes | Valor limitado a un rango pequeño en píxeles |
| `alignment` | Distribución de los mensajes | `left` o `alternating` |
| `padding` | Relleno interno de cada mensaje | Rango limitado para evitar tarjetas desproporcionadas |
| `radius` | Radio de las esquinas | Rango limitado y `0` para esquinas rectas |
| `cardColor` | Color de la tarjeta | Color hexadecimal validado |
| `cardOpacity` | Opacidad de la tarjeta | Porcentaje limitado de 0 a 100 |
| `borderWidth` | Grosor del borde | Rango limitado en píxeles |
| `borderColor` | Color del borde | Color hexadecimal validado |

Definir también:

- Constante de apariencia predeterminada equivalente al render actual.
- Tipos literales para presets y alineación.
- Funciones de normalización para valores recibidos de `localStorage` o de la URL.
- Fallback seguro cuando falte un campo, el color sea inválido o un número quede fuera de rango.

La normalización debe impedir que una URL manipulada produzca estilos inválidos o valores extremos.

### Fase 2 — Renderizado reutilizable

Actualizar los componentes de mensajes para aceptar `appearance` además de `fontSize` y `platform`.

#### Chat de control

- Pasar la configuración desde `StreamerDashboard` a `ChatWindow` y de ahí a `ChatMessage`.
- Mantener la virtualización, el autoscroll, el timestamp, los emblemas, los emotes y los bloques de suscripción.
- Incluir `appearance` y `fontSize` en la comparación de memoización para que los cambios se vean sin reiniciar el stream.

#### Presets

1. **Actual**
   - Mantener la estructura vigente: filas compactas, alternancia de fondo existente y sin separación adicional destacada.
2. **Tarjetas**
   - Cada mensaje se presenta como una tarjeta independiente.
   - Aplicar separación, relleno, radio, color, opacidad y borde configurables.
   - Permitir alineación izquierda o alternada sin romper el ancho disponible.
3. **Nombre separado**
   - Mostrar el nombre y sus emblemas como etiqueta visual separada del contenido.
   - Mantener el color determinista del usuario y el contenido debajo o junto a la etiqueta según el ancho disponible.

Los estilos dinámicos deben usar `style` solo para valores calculados —colores, opacidades, radios, espacios y grosores— y conservar Tailwind para la estructura y los estados.

#### Vista previa

Actualizar `OverlayPreview` para consumir exactamente el mismo `ChatAppearance` que el chat real. La muestra debe contener:

- Mensajes normales con nombres largos y textos largos.
- Al menos una suscripción destacada.
- Emblemas y emotes representativos.
- Fondo transparente, sólido y blur.

La vista previa debe cambiar al mover cualquier control, sin esperar a generar ni regenerar el token.

#### Overlay de OBS

- Extender las props de `ChatOverlay` y `src/pages/overlay/chat.astro` para recibir la apariencia.
- Aplicar la misma normalización usada en el dashboard.
- Conservar los valores actuales cuando los parámetros nuevos no existan, asegurando compatibilidad con URLs antiguas.
- Mantener el fondo, la conexión SSE y la reconexión sin cambios funcionales.

### Fase 3 — Editor del dashboard y persistencia local

Agregar dentro de la sección `OBS Overlay` un bloque identificable como **Personalización del chat**.

#### Controles

- Selector de preset: Actual, Tarjetas y Nombre separado.
- Selector de alineación: izquierda o alternada.
- Sliders para separación, relleno, radio, opacidad y ancho del borde.
- Selectores de color para tarjeta y borde.
- Indicadores numéricos visibles junto a cada slider.
- Botón para restaurar valores del preset seleccionado.
- Vista previa inmediata debajo de los controles.

Los controles que no tengan efecto visual en el preset actual deben permanecer visibles pero explicar su efecto, o quedar deshabilitados con una etiqueta accesible. Los valores deben tener `label`, `id`, foco visible y soporte de teclado.

#### Persistencia

- Guardar la configuración serializada bajo una clave versionada, por ejemplo `chat-appearance:v1`.
- Leerla solo en el cliente y combinarla con los valores predeterminados mediante la función de normalización.
- Si el JSON está corrupto, ignorarlo y volver a los valores predeterminados sin bloquear el dashboard.
- Mantener la preferencia independiente del token y del estado activo del stream.

#### URL del overlay

Extender `buildOverlayUrl` con parámetros para preset y ajustes visuales. Los parámetros deben:

- Usar nombres estables y valores compactos.
- Omitir opcionales que coincidan con el valor predeterminado cuando sea conveniente.
- Codificar colores y valores correctamente con `URLSearchParams`.
- Actualizarse automáticamente al cambiar un control.

La interfaz debe explicar: “Los cambios se reflejan en la vista previa. Para aplicarlos a OBS, copia la URL actualizada y reemplaza la URL del Browser Source”.

### Fase 4 — Validación, pruebas y entrega

#### Pruebas funcionales

- Cargar el dashboard sin configuración guardada y confirmar que aparece el preset Actual.
- Cambiar a Tarjetas y comprobar separación, radio, relleno, fondo y borde.
- Cambiar a Nombre separado y comprobar que el nombre queda visualmente separado del texto.
- Cambiar alineación izquierda/alternada.
- Mover cada slider y confirmar actualización inmediata de la vista previa y del chat de control.
- Recargar el dashboard y comprobar que la configuración permanece.
- Restaurar un preset y confirmar que sus valores reemplazan los ajustes anteriores.
- Generar la URL y comprobar que el token no cambia al modificar estilos.
- Abrir el overlay con los parámetros nuevos y comprobar que coincide con la vista previa.
- Abrir una URL antigua sin parámetros de apariencia y comprobar que conserva el diseño actual.

#### Casos visuales y de robustez

- Texto corto, texto largo y saltos de línea.
- Nombre de usuario largo y varios emblemas.
- Mensaje de suscripción destacado.
- Emote presente, ausente o con error de carga.
- Fondos transparente, sólido y blur.
- Ventanas estrechas, anchas y alturas reducidas.
- Colores inválidos, opacidades negativas o superiores a 100 y radios excesivos en la URL; todos deben normalizarse a valores seguros.
- Configuración `localStorage` corrupta o de una versión anterior.

#### Verificación del repositorio

Ejecutar al terminar la implementación:

```bash
pnpm astro check
pnpm build
```

No se deben introducir errores de TypeScript, cambios inesperados en las rutas del overlay ni dependencias nuevas.

## Criterios de aceptación

- Existe un único modelo `ChatAppearance` compartido por dashboard, vista previa y overlay.
- El preset Actual reproduce el comportamiento visual existente cuando no hay configuración.
- Los tres presets se pueden seleccionar desde el dashboard y se reflejan inmediatamente en el chat de control y la vista previa.
- Los ajustes de separación, alineación, relleno, radio, color, opacidad y borde funcionan dentro de límites definidos.
- La configuración sobrevive a una recarga en el mismo navegador.
- La URL de OBS incorpora la configuración sin regenerar ni modificar el token.
- Una URL antigua sigue funcionando con el diseño predeterminado.
- Emblemas, emotes, mensajes largos y suscripciones continúan renderizándose.
- `pnpm astro check` y `pnpm build` finalizan correctamente.

## Archivos previstos

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Modificar | `src/utils/types.ts` | Tipo, defaults y normalización de `ChatAppearance` |
| Modificar | `src/components/ChatMessage.tsx` | Render de presets y estilos por mensaje |
| Modificar | `src/components/ChatWindow.tsx` | Propagar apariencia al chat del dashboard |
| Modificar | `src/components/OverlayPreview.tsx` | Vista previa con el modelo compartido |
| Modificar | `src/components/ChatOverlay.tsx` | Render del overlay con apariencia |
| Modificar | `src/components/StreamerDashboard.tsx` | Editor, persistencia y URL de OBS |
| Modificar | `src/pages/overlay/chat.astro` | Lectura y validación de parámetros de apariencia |

## Fuera de alcance

- Sin sincronización en vivo entre dashboard y OBS.
- Sin perfiles múltiples ni guardado de temas en servidor.
- Sin editor CSS libre o JavaScript personalizado.
- Sin rediseño de header, controles, navegación o paneles ajenos al chat.
- Sin cambios al protocolo SSE, generación de mensajes o autenticación del overlay.
