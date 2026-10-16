# Decisiones técnicas

## D1. Yjs como modelo colaborativo (Día 0)
- **Contexto:** MVP de 7 días con editor de texto y funcionamiento sin conexión.
- **Alternativas:** Automerge; implementación propia.
- **Motivo:** en la fecha de la decisión, `automerge-repo` tenía como tag `latest` una versión alpha
  (2.6.0-alpha.3) con un backend de sincronización nuevo, y la capa de sync era la que más cambiaba.
  Yjs es estable y tiene binding para CodeMirror 6.
- **Consecuencias:** hay que ensamblar piezas (persistencia, transporte). Revisar Automerge en la
  semana 4 si cobran importancia el cifrado de extremo a extremo y el control de acceso.

## D2. Persistencia propia en lugar de `y-indexeddb` (Día 1)
- **Contexto:** el requisito 4.2 exige no mostrar un guardado como exitoso si falló.
- **Hallazgo:** `y-indexeddb@9.0.12` escribe con `addAutoKey` sin esperar la transacción ni
  capturar errores; no puede confirmar un guardado ni reportar fallos.
- **Decisión:** capa propia (~200 líneas) que guarda un registro de actualizaciones de Yjs y
  confirma al completarse la transacción. Ante un fallo conserva las actualizaciones en memoria y
  las reintenta juntas, sin dejar huecos.
- **Consecuencias:** código propio que mantener (no es un CRDT, solo almacenamiento de
  actualizaciones). La compactación está implementada y probada con un IndexedDB simulado.

## D3. Título como registro «último escritor gana»
El título vive en el `Y.Map` «meta» del propio documento (viaja al compartir). Dos ediciones
simultáneas del título no se fusionan: gana una. El texto del documento sí es un `Y.Text` colaborativo.
La lista de documentos guarda una copia del título como caché de lectura.
