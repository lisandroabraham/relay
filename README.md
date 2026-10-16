# Relay

Aplicación de notas **local-first** (en construcción). Objetivo de la primera semana: demostrar
que se puede seguir editando sin conexión y recuperar un estado coherente al sincronizar.

## Estado actual: Día 1

| Capacidad | Estado |
|---|---|
| Crear, listar, abrir y editar documentos | Implementado |
| Persistencia local en IndexedDB (Yjs) | Implementado |
| Guardado **confirmado** (la UI solo dice «guardado» cuando la transacción termina) | Implementado |
| Error de almacenamiento visible + reintento sin perder cambios | Implementado |
| Pruebas de la capa de datos (Vitest, IndexedDB simulado) | Superadas (9/9) en un entorno de desarrollo |
| Pruebas E2E en navegador real (Playwright) | **Escritas, NO ejecutadas todavía** |
| Interfaz verificada manualmente en navegador | **Pendiente** |
| Sincronización / servidor / modo desconexión | **No implementado** (Día 2 en adelante) |
| Eliminar documentos | No implementado |
| Límite de tamaño del contenido del documento | No implementado |

## Requisitos
Node.js LTS y pnpm (`npm install -g pnpm`).

## Ejecutar
```bash
pnpm install
pnpm dev          # abre la URL que muestre la terminal (normalmente :5173)
pnpm typecheck
pnpm test         # pruebas unitarias de la capa de datos
pnpm build
```
Pruebas E2E (necesitan descargar un navegador la primera vez):
```bash
pnpm --filter @relay/web exec playwright install --with-deps chromium
pnpm test:e2e
```

## Limitaciones importantes
- Los datos viven **solo en este navegador**. Si el usuario borra los datos del sitio o cambia de
  dispositivo, se pierden. No hay copia en ningún servidor.
- «Guardado en este dispositivo» significa: la transacción de IndexedDB se completó según el
  navegador. No garantiza que el sistema operativo haya volcado a disco.
- No hay autenticación ni cifrado. No guardes información sensible.

## Estructura
```
apps/web/src/data   Capa de datos (sin React): idb.ts, persistence.ts, documentStore.ts
apps/web/src/ui     Componentes React
apps/web/tests      Pruebas unitarias (Vitest)
apps/web/e2e        Pruebas de navegador (Playwright)
docs/DECISIONS.md   Decisiones técnicas
```
