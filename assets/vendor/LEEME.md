# Librerías de terceros, servidas desde acá

## anime.esm.min.js

- **Qué es:** [Anime.js](https://animejs.com) v4.5.0, el bundle ESM minificado.
- **Licencia:** MIT, © Julian Garnier.
- **De dónde salió:** `https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.esm.min.js`
- **Para qué se usa:** las animaciones de los diagramas del manual. Ver
  `assets/js/composables/usarAnimacionDiagrama.js`.

### Por qué está acá y no en un CDN

Leaflet sí viene de un CDN, y la diferencia es que el mapa no tiene sentido sin
conexión: sin señal no hay imágenes que mostrar. El manual sí: es documentación
que alguien puede querer leer en el patio del salón, sin datos.

Sirviéndolo desde el mismo dominio, el service worker lo guarda solo la primera
vez que alguien abre el manual, y de ahí en adelante funciona sin conexión. Un
CDN no se puede guardar así sin pedir CORS y sin quedar atado a que ese CDN
siga en pie.

### Por qué NO está en la lista de precarga

Son 116 KB, y el precache entero del sistema son 753 KB. Cargarlo de entrada le
costaría un 15% más de descarga a todo el mundo, incluida la gente que solo usa
el escáner en la puerta del evento y nunca va a abrir el manual.

Se carga con un `import()` dinámico recién cuando el manual se abre. El service
worker lo guarda en ese momento —su estrategia para estáticos es «caché
primero, y si no está, lo busca y lo guarda»— así que a partir de la segunda vez
está disponible sin conexión.

### Si no carga, no pasa nada

Los diagramas se animan con CSS por su cuenta: los nodos aparecen en orden, las
líneas se trazan y el punto recorre los tramos rectos. Lo que agrega Anime.js es
el punto siguiendo las curvas de las ramas —que con CSS no se puede— y el
control para detener la animación cuando la lámina deja de verse.

Sin la librería, el diagrama se ve completo y se entiende igual.

### Para actualizarlo

Bajar el archivo de la misma dirección con la versión nueva, revisar que
`createMotionPath` siga devolviendo `{ translateX, translateY, rotate }` y correr
`probar-anime`, que comprueba justamente eso contra el archivo real.
