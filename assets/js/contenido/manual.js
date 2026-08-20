/**
 * El manual de usuario.
 *
 * Reemplaza al modal de guía, que daba cuatro pasos sueltos por pantalla. Está
 * pensado para dos personas distintas:
 *
 *   - quien ya usó el sistema y solo necesita recordar el orden de los pasos,
 *   - y quien lo abre por primera vez el día del evento y necesita entender
 *     qué está pasando y por qué.
 *
 * Por eso cada bloque se escribe dos veces. En «breve» va la instrucción sola,
 * en imperativo y sin explicaciones. En «detallada» va la misma instrucción con
 * el contexto: qué hace el sistema por dentro, qué se ve en pantalla, qué pasa
 * si algo sale distinto. Sin términos técnicos: nada de «endpoint», «caché» ni
 * «sincronizar»; se dice «se guarda en el teléfono» y «se envía cuando vuelve
 * la señal».
 *
 * Los dos textos tienen que decir lo mismo. Si la versión breve dice algo que
 * la detallada contradice, la persona que leyó una se equivoca.
 *
 * `modulo` es el permiso que hace falta para ver ese capítulo. Los capítulos
 * sin `modulo` los ve cualquiera.
 */

export const MODOS = [
  {
    valor: 'breve',
    etiqueta: 'Breve',
    detalle: 'Solo los pasos, para recordar rápido.',
    icono: 'fa-bolt'
  },
  {
    valor: 'detallada',
    etiqueta: 'Detallada',
    detalle: 'Todo explicado, sin términos técnicos.',
    icono: 'fa-book-open'
  }
];

export const CAPITULOS = [
  // =========================================================================
  {
    id: 'inicio',
    titulo: 'Antes de empezar',
    icono: 'fa-flag-checkered',
    diagrama: 'general',
    resumen: 'Qué hace este sistema y en qué orden se usa.',
    bloques: [
      {
        id: 'inicio-que-es',
        titulo: 'Para qué sirve el sistema',
        icono: 'fa-circle-info',
        breve: 'Controla quién entra a un evento del personal, y sortea los premios entre quienes entraron.',
        detallada:
          'Este sistema resuelve dos cosas de un evento del personal. La primera es saber quién ' +
          'entró: en lugar de una lista en papel donde alguien va marcando nombres, cada persona ' +
          'llega con un código en el teléfono y se registra en un segundo. La segunda es el ' +
          'sorteo: como el sistema ya sabe quiénes entraron, puede elegir ganadores al azar solo ' +
          'entre los que están presentes, sin que nadie tenga que anotar papelitos.'
      },
      {
        id: 'inicio-orden',
        titulo: 'El orden de las cosas',
        icono: 'fa-list-ol',
        breve:
          'Primero el evento, después los empleados, después las invitaciones. El día del evento: ' +
          'escáner en la puerta y sorteos al final.',
        detallada:
          'Hay un orden que conviene respetar, porque cada paso necesita el anterior. Semanas ' +
          'antes se crea el evento y se marca como activo, se carga la lista del personal y se ' +
          'diseña la invitación con el código. Los días previos se reparten las invitaciones. El ' +
          'día del evento, alguien en la puerta usa el escáner para registrar a quien llega. Y ' +
          'sobre el final de la fiesta se hacen los sorteos, que reparten los premios entre las ' +
          'personas que el escáner registró.'
      },
      {
        id: 'inicio-evento-activo',
        titulo: 'El evento activo manda',
        icono: 'fa-calendar-day',
        breve:
          'Solo un evento puede estar activo. Todo lo que se registra se guarda en ese. Si no hay ' +
          'ninguno activo, el escáner no funciona.',
        detallada:
          'Esta es la idea más importante del sistema y la que más problemas causa cuando se ' +
          'pasa por alto. En cualquier momento hay un solo evento marcado como activo, y todo lo ' +
          'que se registra queda guardado en ese evento: las entradas de la puerta, los sorteos y ' +
          'los ganadores. Si el escáner no registra a nadie o si la lista de asistentes aparece ' +
          'vacía, lo primero que hay que mirar es cuál evento está activo. Suele ser que quedó ' +
          'activo el del año pasado.'
      },
      {
        id: 'inicio-sin-senal',
        titulo: 'Si se cae la señal',
        icono: 'fa-wifi',
        breve: 'El escáner sigue funcionando. Lo registrado se guarda en el dispositivo y se envía solo al volver la señal.',
        detallada:
          'Los salones de fiesta suelen tener mala señal, así que el sistema está preparado para ' +
          'eso. Si se corta la conexión mientras se está escaneando, el escáner no se detiene: ' +
          'guarda cada entrada en el propio teléfono y sigue como si nada. Cuando la señal vuelve, ' +
          'esas entradas se envían solas, sin que nadie tenga que hacer nada. Mientras tanto se ve ' +
          'un contador de pendientes, que es la cantidad de registros que todavía están esperando. ' +
          'Lo único importante es no cerrar la aplicación ni apagar el teléfono con pendientes sin ' +
          'enviar.'
      }
    ],
    consejos: [
      'Probá el circuito completo unos días antes con dos o tres personas de prueba. Es la única forma de descubrir un problema cuando todavía hay tiempo de resolverlo.',
      'Llevá el teléfono de la puerta cargado y con un cargador portátil. La cámara encendida consume batería rápido.'
    ],
    problemas: [
      {
        sintoma: 'El escáner dice que no hay evento activo.',
        solucion: 'Entrá a Eventos y marcá como activo el que corresponde. Sin eso el sistema no sabe dónde guardar las entradas.'
      },
      {
        sintoma: 'La pantalla se ve rara o falta algo que sí estaba.',
        solucion: 'Entrá a Configuración y mirá la versión instalada. Si no coincide con la publicada, el dispositivo tiene una copia vieja: cerrá y volvé a abrir la aplicación.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'scanner',
    vista: 'scanner',
    modulo: 'scanner',
    titulo: 'Escáner QR',
    icono: 'fa-qrcode',
    diagrama: 'escaner',
    resumen: 'Registrar a quien llega, con la cámara o escribiendo el documento.',
    bloques: [
      {
        id: 'scanner-abrir',
        titulo: 'Abrir la cámara',
        icono: 'fa-camera',
        breve: 'Pulsá «Abrir cámara» y aceptá el permiso. En el teléfono se abre a pantalla completa.',
        detallada:
          'Al pulsar «Abrir cámara» el navegador pide permiso para usarla. Hay que aceptarlo una ' +
          'vez por dispositivo; después lo recuerda. En el teléfono la cámara se abre ocupando ' +
          'toda la pantalla, para que el recuadro sea grande y se pueda apuntar cómodo con una ' +
          'mano. Si el permiso se rechazó por error, hay que volver a darlo desde la configuración ' +
          'del navegador, porque ya no lo vuelve a pedir solo.'
      },
      {
        id: 'scanner-camara-correcta',
        titulo: 'Elegir la cámara correcta',
        icono: 'fa-camera-rotate',
        breve: 'Si no lee, cambiá de cámara con el selector. La gran angular no enfoca de cerca.',
        detallada:
          'Los teléfonos modernos tienen varias cámaras traseras, y algunos abren por defecto la ' +
          'gran angular, que no enfoca a corta distancia. Con esa cámara el código se ve borroso y ' +
          'no se lee nunca, por más que uno acerque el teléfono. Si pasa eso, el selector de arriba ' +
          'permite cambiar a otra cámara; la normal casi siempre funciona. El sistema intenta ' +
          'elegir la mejor solo, pero no todos los teléfonos informan cuál es cuál.'
      },
      {
        id: 'scanner-apuntar',
        titulo: 'Apuntar al código',
        icono: 'fa-crosshairs',
        breve: 'Encuadrá el código dentro del recuadro. Se detecta solo, no hay que pulsar nada.',
        detallada:
          'Solo hay que poner el código dentro del recuadro y esperar un instante. No hay botón de ' +
          'disparo: el sistema mira continuamente y reacciona apenas reconoce el código. Ayuda ' +
          'que haya luz y que el teléfono de la persona tenga el brillo alto, porque una pantalla ' +
          'oscura o con reflejos cuesta más de leer. Si la persona trae la invitación impresa, ' +
          'funciona igual.'
      },
      {
        id: 'scanner-resultado',
        titulo: 'Leer el resultado',
        icono: 'fa-circle-check',
        breve: 'Verde es entrada registrada. Ámbar es que ya había entrado. Rojo es que no está en la lista.',
        detallada:
          'Después de cada lectura aparece el nombre de la persona con un color que dice qué pasó. ' +
          'Verde significa que la entrada quedó registrada y puede pasar. Ámbar significa que esa ' +
          'persona ya había sido registrada antes: no es un error, suele pasar cuando alguien sale ' +
          'a fumar y vuelve, y no se registra dos veces a propósito. Rojo significa que el código ' +
          'no corresponde a nadie de la lista, y ahí conviene buscar a la persona por su nombre ' +
          'antes de dejarla pasar.'
      },
      {
        id: 'scanner-espera',
        titulo: 'La espera entre lecturas',
        icono: 'fa-hourglass-half',
        breve: 'Después de cada lectura espera unos segundos antes de leer otra vez. Es a propósito.',
        detallada:
          'Entre una lectura y la siguiente el escáner se toma unos segundos de pausa. Es ' +
          'intencional: sin esa pausa, el mismo código que sigue frente a la cámara se leería ' +
          'muchas veces por segundo y generaría decenas de registros de la misma persona. La ' +
          'pausa da tiempo a apartar el teléfono y que se acerque el siguiente. Si parece que el ' +
          'escáner «se trabó», casi siempre es esta pausa y se resuelve sola.'
      },
      {
        id: 'scanner-manual',
        titulo: 'Cuando el código no está',
        icono: 'fa-keyboard',
        breve: 'Escribí el documento en el campo de abajo. Si tampoco lo sabe, buscá por nombre con la lupa.',
        detallada:
          'Siempre hay alguien que borró la invitación, se quedó sin batería o directamente nunca ' +
          'la recibió. Para eso está el campo de abajo, donde se escribe el número de documento a ' +
          'mano y se registra igual. Y si la persona tampoco recuerda su número, la lupa abre un ' +
          'buscador por nombre que muestra el departamento, el cargo y el distrito de cada ' +
          'coincidencia, para poder confirmar que es quien dice ser antes de registrarla.'
      }
    ],
    consejos: [
      'Poné a alguien fijo en la puerta con el teléfono. Pasarlo de mano en mano hace que se pierdan lecturas.',
      'Si hay mucha gente esperando, conviene un segundo dispositivo escaneando en paralelo: los dos registran en el mismo evento sin pisarse.'
    ],
    problemas: [
      {
        sintoma: 'La cámara se abre pero no lee ningún código.',
        solucion: 'Cambiá de cámara con el selector. Es casi siempre la gran angular, que no enfoca de cerca.'
      },
      {
        sintoma: 'Todo sale en rojo, como si nadie estuviera en la lista.',
        solucion: 'Revisá cuál evento está activo. Si es el equivocado, las personas no figuran como invitadas a ese.'
      },
      {
        sintoma: 'El contador de pendientes sube y no baja.',
        solucion: 'No hay señal. Abrí el modal de pendientes para verlos y enviarlos a mano cuando vuelva la conexión. No cierres la aplicación mientras tanto.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'asistentes',
    vista: 'asistentes',
    modulo: 'asistencias',
    titulo: 'Asistencias',
    icono: 'fa-clipboard-check',
    diagrama: 'asistencias',
    resumen: 'Ver quién entró, buscar a alguien y controlar los pendientes.',
    bloques: [
      {
        id: 'asistentes-lista',
        titulo: 'Quién entró',
        icono: 'fa-list',
        breve: 'La lista muestra a todos los registrados en el evento activo, del más reciente al más antiguo.',
        detallada:
          'Acá aparece todo el personal que ya pasó por la puerta, ordenado con lo último arriba. ' +
          'Es la lista del evento que está activo: si se cambia el evento activo, la lista cambia ' +
          'entera. La pantalla se actualiza sola cada pocos segundos, así que si alguien escanea ' +
          'en la puerta mientras otra persona mira esta lista desde otro dispositivo, el nombre ' +
          'nuevo aparece solo sin tener que recargar nada.'
      },
      {
        id: 'asistentes-buscar',
        titulo: 'Buscar a una persona',
        icono: 'fa-magnifying-glass',
        breve: 'Escribí el nombre o el documento. No hacen falta las tildes.',
        detallada:
          'El buscador acepta parte del nombre, del apellido o del número de documento, y no hace ' +
          'distinción entre mayúsculas y minúsculas ni exige poner las tildes. Escribir «marquez» ' +
          'encuentra a «Márquez». Sirve para confirmar rápido si alguien ya entró, que es la ' +
          'pregunta más frecuente durante el evento.'
      },
      {
        id: 'asistentes-pendientes',
        titulo: 'Los pendientes',
        icono: 'fa-cloud-arrow-up',
        breve: 'Si el contador no está en cero, hay registros sin enviar. Abrilo para enviarlos o revisarlos.',
        detallada:
          'El contador de pendientes muestra cuántas entradas quedaron guardadas en el dispositivo ' +
          'sin haber llegado todavía al sistema central. Con señal se envían solas en segundos. Si ' +
          'el número no baja, se puede abrir el detalle para ver exactamente cuáles son, ' +
          'reintentar el envío a mano, o descartar alguno si se registró por error. Conviene ' +
          'terminar el evento con el contador en cero: mientras haya pendientes, esas personas no ' +
          'participan de los sorteos.'
      }
    ],
    consejos: [
      'Antes de empezar los sorteos, confirmá que los pendientes estén en cero. Quien no llegó al sistema no puede salir sorteado.'
    ],
    problemas: [
      {
        sintoma: 'La lista está vacía y sé que entró gente.',
        solucion: 'Revisá cuál evento está activo. La lista es siempre del evento activo.'
      },
      {
        sintoma: 'Falta alguien que sí escaneé.',
        solucion: 'Mirá los pendientes del dispositivo donde se escaneó. Es probable que esa entrada todavía no se haya enviado.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'rifa',
    vista: 'rifa',
    modulo: 'sorteos',
    titulo: 'Sortear en vivo',
    icono: 'fa-gift',
    diagrama: 'sorteo',
    resumen: 'La pantalla que se proyecta mientras se llaman los ganadores.',
    bloques: [
      {
        id: 'rifa-preparar',
        titulo: 'Antes de empezar',
        icono: 'fa-display',
        breve: 'Proyectá esta pantalla y elegí el sorteo de la lista.',
        detallada:
          'Esta pantalla está hecha para verse desde lejos, así que conviene proyectarla o pasarla ' +
          'a un televisor antes de empezar. Arriba se elige el sorteo de la fiesta, que es uno ' +
          'solo para toda la noche y ya tiene cargados todos los premios que se van a repartir. ' +
          'Una vez elegido, aparece la lista de premios con cuántas unidades quedan de cada uno y ' +
          'una barra que muestra cuánto se lleva repartido.'
      },
      {
        id: 'rifa-extraer',
        titulo: 'Sacar ganadores',
        icono: 'fa-dice',
        breve: 'Elegí el premio, elegí cuántos ganadores querés sacar de una vez, y pulsá extraer.',
        detallada:
          'Se elige qué premio se está sorteando y cuántas personas se quieren sacar en esa tanda. ' +
          'Se puede sacar de a uno, que es lo habitual cuando el premio es importante, o varios ' +
          'juntos cuando hay muchas unidades del mismo premio y llamarlos de a uno tardaría ' +
          'demasiado. El sistema elige al azar entre las personas que registraron su entrada, y ' +
          'dentro de una misma tanda nunca sale dos veces la misma persona.'
      },
      {
        id: 'rifa-anunciar',
        titulo: 'Anunciar por el micrófono',
        icono: 'fa-microphone',
        breve: 'El nombre queda grande en pantalla hasta que vos lo cierres. No desaparece solo.',
        detallada:
          'Al extraer, el nombre del ganador ocupa la pantalla entera para que se lea desde el ' +
          'fondo del salón. Ese cartel no se cierra solo por más que pase el tiempo: se queda ' +
          'hasta que alguien lo cierra a propósito. Es a propósito, porque leer un nombre por el ' +
          'micrófono, esperar a que la persona reaccione y camine hasta el escenario lleva su ' +
          'tiempo, y un cartel que desaparece a los cinco segundos obligaría a repetir el nombre ' +
          'de memoria.'
      },
      {
        id: 'rifa-repetir',
        titulo: 'Nadie gana dos veces',
        icono: 'fa-user-check',
        breve: 'Quien ya ganó queda fuera de los siguientes sorteos, salvo que se haya permitido lo contrario.',
        detallada:
          'Por defecto, una persona que ya ganó algo no vuelve a entrar en los sorteos siguientes ' +
          'de la misma fiesta. Es lo que la gente espera: con doscientos asistentes y veinte ' +
          'premios, que alguien se lleve tres se nota y se comenta. La excepción es cuando hay ' +
          'más premios que personas presentes, y ahí sí hace falta permitir que alguien repita, o ' +
          'el sorteo se queda sin gente a quien darle los premios que faltan. Esa opción se activa ' +
          'al configurar el sorteo.'
      },
      {
        id: 'rifa-entrega',
        titulo: 'Marcar la entrega',
        icono: 'fa-hand-holding-heart',
        breve: 'Marcá cada premio como entregado cuando la persona lo recibe en mano.',
        detallada:
          'La lista de ganadores tiene una marca para señalar que el premio ya fue entregado en ' +
          'mano. No es lo mismo salir sorteado que recibir el premio: a veces la persona salió a ' +
          'la calle, se fue temprano o el premio se entrega al final. Llevar esa marca al día ' +
          'permite saber, al cerrar la noche, qué premios quedaron sin dueño presente.'
      }
    ],
    consejos: [
      'Probá la proyección antes de que llegue la gente. Cambiar de pantalla con el salón lleno y el micrófono abierto es incómodo.',
      'Si un premio tiene muchas unidades, sacá varios ganadores de una vez: se lee la lista completa y se ahorra tiempo.'
    ],
    problemas: [
      {
        sintoma: 'Dice que no hay asistentes y no puede sortear.',
        solucion: 'Nadie registró la entrada todavía en el evento activo. Solo participa quien pasó por el escáner.'
      },
      {
        sintoma: 'Dice que todos los asistentes ya ganaron.',
        solucion: 'Hay más premios que personas presentes. Al editar el sorteo se puede permitir que alguien gane más de una vez.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'sorteos',
    vista: 'sorteos',
    modulo: 'sorteos',
    titulo: 'Preparar los sorteos',
    icono: 'fa-ticket',
    diagrama: 'preparar-sorteo',
    resumen: 'Armar el sorteo de la fiesta con todos sus premios.',
    bloques: [
      {
        id: 'sorteos-uno',
        titulo: 'Un sorteo para toda la fiesta',
        icono: 'fa-layer-group',
        breve: 'Se crea un solo sorteo y se le cargan todos los premios que se van a repartir.',
        detallada:
          'Un sorteo no es un premio: es la jornada entera. Se crea uno solo para la fiesta y se ' +
          'le carga la lista completa de premios que se van a entregar esa noche. Después, durante ' +
          'la fiesta, se van sacando ganadores de esa lista sin tener que crear nada más. Es la ' +
          'forma en que funciona en la realidad, donde alguien con un micrófono va llamando ' +
          'ganadores durante toda la noche.'
      },
      {
        id: 'sorteos-cantidades',
        titulo: 'Premios con cantidad',
        icono: 'fa-gift',
        breve: 'Diez termos iguales son una sola línea con cantidad diez, no diez líneas.',
        detallada:
          'Cada premio se carga una vez, indicando cuántas unidades hay. Si se van a repartir diez ' +
          'termos iguales, eso es una sola línea que dice «termo, cantidad diez», y no diez líneas ' +
          'repetidas. El sistema lleva la cuenta de cuántos se entregaron de cada premio y avisa ' +
          'cuando se agota, pasando solo al siguiente. Cargar el mismo premio dos veces no está ' +
          'permitido justamente por esto: para repetirlo se le sube la cantidad.'
      },
      {
        id: 'sorteos-cierre',
        titulo: 'Cuándo se cierra',
        icono: 'fa-flag-checkered',
        breve: 'El sorteo se cierra solo cuando se repartió todo. También se puede cerrar a mano.',
        detallada:
          'El sorteo queda abierto mientras quede algo por repartir, y se cierra solo cuando se ' +
          'entregó la última unidad del último premio. En la tabla se ve el avance de cada sorteo ' +
          'con un contador de entregados sobre el total. También se puede cerrar a mano si la ' +
          'fiesta terminó y sobraron premios sin repartir.'
      },
      {
        id: 'sorteos-editar',
        titulo: 'Editar con ganadores ya sorteados',
        icono: 'fa-lock',
        breve: 'No se puede quitar un premio del que ya salieron ganadores, ni bajarle la cantidad por debajo de lo entregado.',
        detallada:
          'Una vez que un premio tiene ganadores, el sistema no deja quitarlo de la lista ni ' +
          'reducir su cantidad por debajo de lo que ya se entregó. La razón es simple: sería ' +
          'negar un premio que ya se anunció por el micrófono delante de todos. Si hay que ' +
          'corregir algo así, hay que resolverlo con las personas involucradas, no borrando el ' +
          'registro.'
      }
    ],
    consejos: [
      'Cargá los premios con anticipación, no la misma noche. Es la parte que más tiempo lleva y la que peor se hace apurado.',
      'Si hay más premios que gente esperada, activá «permitir repetir ganador» al crear el sorteo.'
    ],
    problemas: [
      {
        sintoma: 'No aparece ningún premio para elegir.',
        solucion: 'El catálogo de premios está vacío. Hay que cargarlos primero en la pantalla de Premios.'
      },
      {
        sintoma: 'No deja guardar porque hay un premio repetido.',
        solucion: 'El mismo premio está dos veces en la lista. Borrá una de las dos líneas y subile la cantidad a la que queda.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'premios',
    vista: 'premios',
    modulo: 'premios',
    titulo: 'Premios',
    icono: 'fa-trophy',
    diagrama: 'catalogo',
    resumen: 'El catálogo de lo que se va a sortear.',
    bloques: [
      {
        id: 'premios-cargar',
        titulo: 'Cargar un premio',
        icono: 'fa-plus',
        breve: 'Nombre, una descripción opcional y cuántas unidades hay.',
        detallada:
          'Cada premio necesita un nombre claro, porque es el que se va a leer por el micrófono ' +
          'delante de todos. La descripción es opcional y sirve para distinguir premios parecidos ' +
          'entre sí. La cantidad es cuántas unidades hay disponibles en total. Este es el catálogo ' +
          'general: qué se reparte en cada fiesta se define después, al armar el sorteo.'
      },
      {
        id: 'premios-stock',
        titulo: 'Las unidades bajan solas',
        icono: 'fa-arrow-down-9-1',
        breve: 'Cada vez que sale un ganador, la cantidad disponible baja sola.',
        detallada:
          'No hay que ir descontando a mano. Cada vez que se extrae un ganador, la cantidad ' +
          'disponible de ese premio baja sola. Así el catálogo refleja lo que queda de verdad, sin ' +
          'depender de que alguien se acuerde de actualizarlo en medio de la fiesta.'
      }
    ],
    consejos: [
      'Poné nombres que se entiendan al escucharlos, no códigos internos. «Termo azul» se entiende; «TRM-004» no.'
    ],
    problemas: []
  },

  // =========================================================================
  {
    id: 'empleados',
    vista: 'empleados',
    modulo: 'empleados',
    titulo: 'Empleados',
    icono: 'fa-users',
    diagrama: 'empleados',
    resumen: 'La lista del personal: cargarla, corregirla y generar sus códigos.',
    bloques: [
      {
        id: 'empleados-importar',
        titulo: 'Cargar mucha gente de una vez',
        icono: 'fa-file-excel',
        breve: 'Descargá la plantilla, llenala en Excel y subila. El distrito y el departamento se eligen de una lista.',
        detallada:
          'Cargar a mano varios cientos de personas no tiene sentido, así que hay una plantilla de ' +
          'Excel para descargar, llenar y volver a subir. La plantilla ya trae las columnas ' +
          'correctas y, en las de distrito y departamento, un desplegable con las opciones ' +
          'válidas: eso evita que cada persona escriba el nombre del departamento de una forma ' +
          'distinta y después no coincida con nada. La fecha de nacimiento va en formato de día, ' +
          'mes y año.'
      },
      {
        id: 'empleados-detalle',
        titulo: 'Ver la ficha de alguien',
        icono: 'fa-address-card',
        breve: 'Tocá cualquier fila para ver todos sus datos, su código y si ya entró al evento.',
        detallada:
          'Al tocar una fila se abre la ficha completa de esa persona, con todos sus datos, su ' +
          'departamento, su cargo y su distrito. Ahí mismo está su código de invitación, que se ' +
          'puede ver, descargar o copiar como enlace para mandárselo por mensaje. También se ve ' +
          'si ya registró la entrada al evento activo, que sirve para responder rápido cuando ' +
          'alguien pregunta si tal persona llegó.'
      },
      {
        id: 'empleados-baja',
        titulo: 'Dar de baja',
        icono: 'fa-user-slash',
        breve: 'Desactivar saca a la persona de las listas sin borrar su historial. Borrar del todo es solo para administradores.',
        detallada:
          'Hay dos formas de sacar a alguien. Desactivarlo lo quita de las listas y de los ' +
          'sorteos, pero conserva su historial de eventos anteriores: es lo que corresponde ' +
          'cuando una persona deja la institución. Borrarlo del todo elimina el registro y solo ' +
          'lo puede hacer un administrador; se usa cuando alguien se cargó por error o duplicado. ' +
          'Si la persona ya participó de un evento, el sistema no la deja borrar, porque quedaría ' +
          'un registro de asistencia sin dueño.'
      },
      {
        id: 'empleados-exportar',
        titulo: 'Sacar la lista a Excel',
        icono: 'fa-file-arrow-down',
        breve: 'El botón de exportar baja la lista completa en Excel, con el nombre del departamento.',
        detallada:
          'La lista se puede bajar entera en un archivo de Excel, con los mismos datos que se ven ' +
          'en pantalla. En la columna de departamento aparece el nombre y no un código interno, ' +
          'para que el archivo se pueda leer y compartir sin necesitar el sistema. Sirve para ' +
          'armar reportes o para revisar la lista con otra persona antes del evento.'
      }
    ],
    consejos: [
      'Revisá los documentos duplicados antes de importar. Dos personas con el mismo número generan el mismo código y una de las dos no va a poder entrar.',
      'Usá siempre la plantilla descargada, no un Excel propio. Las columnas tienen que llamarse exactamente igual.'
    ],
    problemas: [
      {
        sintoma: 'La importación rechaza filas.',
        solucion: 'El sistema informa cuál fila y por qué. Lo más común es el documento repetido o un departamento escrito distinto al de la lista.'
      },
      {
        sintoma: 'No aparece el botón de borrar.',
        solucion: 'Borrar del todo es solo para administradores. Los demás pueden desactivar, que es lo que corresponde en casi todos los casos.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'departamentos',
    vista: 'departamentos',
    modulo: 'departamentos',
    titulo: 'Departamentos',
    icono: 'fa-building',
    diagrama: 'catalogo',
    resumen: 'Las áreas de la institución a las que pertenece el personal.',
    bloques: [
      {
        id: 'departamentos-para-que',
        titulo: 'Para qué sirven',
        icono: 'fa-sitemap',
        breve: 'Cada empleado pertenece a un departamento. Sirve para filtrar, agrupar y hacer reportes.',
        detallada:
          'Los departamentos son las áreas de la institución, y cada persona del personal ' +
          'pertenece a una. Sirven para filtrar la lista de empleados, para saber de qué área es ' +
          'alguien cuando se lo busca en la puerta, y para sacar reportes por área. Conviene ' +
          'cargarlos antes que a los empleados, porque al importar la lista de personal el ' +
          'departamento se elige de un desplegable con los que ya existen.'
      },
      {
        id: 'departamentos-desactivar',
        titulo: 'Desactivar uno',
        icono: 'fa-toggle-off',
        breve: 'Un departamento desactivado deja de ofrecerse, pero la gente que ya lo tenía lo conserva.',
        detallada:
          'Cuando un área deja de existir o cambia de nombre, se la desactiva en lugar de ' +
          'borrarla. Así deja de aparecer en los desplegables para asignaciones nuevas, pero las ' +
          'personas que ya estaban en ella conservan el dato y el historial no queda incompleto.'
      }
    ],
    consejos: [
      'Cargá los departamentos antes que a los empleados. Si no, la plantilla de importación no va a tener de dónde elegir.'
    ],
    problemas: []
  },

  // =========================================================================
  {
    id: 'eventos',
    vista: 'eventos',
    modulo: 'eventos',
    titulo: 'Eventos',
    icono: 'fa-calendar-day',
    diagrama: 'eventos',
    resumen: 'Crear la fiesta y marcar cuál está activa.',
    bloques: [
      {
        id: 'eventos-crear',
        titulo: 'Crear el evento',
        icono: 'fa-calendar-plus',
        breve: 'Nombre, fecha y lugar. Se crea uno por fiesta.',
        detallada:
          'Cada fiesta es un evento. Se le pone un nombre que se entienda al leerlo dentro de un ' +
          'año, la fecha y el lugar. Todo lo que pase esa noche —las entradas registradas, los ' +
          'sorteos y los ganadores— queda guardado dentro de ese evento, lo que permite consultar ' +
          'después qué pasó en cada fiesta sin que se mezclen entre sí.'
      },
      {
        id: 'eventos-activar',
        titulo: 'Marcarlo como activo',
        icono: 'fa-bullseye',
        breve: 'Solo uno puede estar activo. Es el que usa el escáner y del que salen los sorteos.',
        detallada:
          'Marcar un evento como activo es lo que le dice al sistema dónde guardar todo lo que ' +
          'pase. Solo puede haber uno activo a la vez: al activar uno, el anterior se desactiva ' +
          'solo. Este es el paso que más se olvida, y el que explica la mayoría de los problemas ' +
          'del día del evento. Si el escáner no registra a nadie o la lista de asistentes aparece ' +
          'vacía, casi siempre es porque quedó activo el evento del año pasado.'
      }
    ],
    consejos: [
      'Activá el evento el día anterior, no el mismo día. Es un clic que se olvida justo cuando hay más cosas encima.'
    ],
    problemas: [
      {
        sintoma: 'Los registros aparecen en el evento equivocado.',
        solucion: 'Se escaneó con otro evento activo. Cambiá el activo antes de seguir; lo ya registrado queda en el evento donde se guardó.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'tarjetas',
    vista: 'tarjetas',
    modulo: 'tarjetas',
    titulo: 'Invitaciones',
    icono: 'fa-id-card',
    diagrama: 'invitaciones',
    resumen: 'Diseñar la invitación con el código y repartirla.',
    bloques: [
      {
        id: 'tarjetas-plantilla',
        titulo: 'Subir el diseño',
        icono: 'fa-upload',
        breve: 'Subí la imagen de la invitación, con un espacio libre donde va a ir el código.',
        detallada:
          'La invitación es una imagen que hace de fondo, diseñada por quien corresponda, con un ' +
          'espacio libre reservado para el código. Conviene que sea grande y de buena calidad, ' +
          'porque va a verse en pantallas de teléfono de todos los tamaños. El sistema no diseña ' +
          'la invitación: la recibe hecha y le agrega el código encima.'
      },
      {
        id: 'tarjetas-ubicar',
        titulo: 'Ubicar el código',
        icono: 'fa-arrows-up-down-left-right',
        breve: 'Arrastralo hasta su lugar. Con la rueda del ratón cambiás el tamaño.',
        detallada:
          'El código se arrastra con el ratón hasta el espacio que se le dejó, y se agranda o ' +
          'achica con la rueda. Conviene que quede sobre una zona clara y sin dibujos, porque un ' +
          'código sobre un fondo con muchos detalles cuesta más de leer en la puerta. La posición ' +
          'y el tamaño se guardan junto con el diseño, así que se define una vez y se aplica a ' +
          'todas las invitaciones.'
      },
      {
        id: 'tarjetas-generar',
        titulo: 'Generar y repartir',
        icono: 'fa-download',
        breve: 'Generá una invitación por persona, o todas juntas en un archivo comprimido.',
        detallada:
          'Con el diseño listo se generan las invitaciones: una por persona, cada una con su ' +
          'propio código. Se pueden bajar de a una, para mandársela a alguien puntual, o todas ' +
          'juntas en un archivo comprimido para repartirlas por el canal que se use. Cada archivo ' +
          'lleva el nombre de la persona, así que encontrar la de alguien en particular es ' +
          'directo.'
      },
      {
        id: 'tarjetas-portal',
        titulo: 'Que cada uno consiga la suya',
        icono: 'fa-link',
        breve: 'Hay un enlace público donde cada persona pone su documento y obtiene su invitación.',
        detallada:
          'Mandar cientos de invitaciones una por una tiene un límite práctico, así que existe un ' +
          'enlace público que se puede difundir por cualquier medio. Quien entra pone su número ' +
          'de documento y, si está en la lista, obtiene su propia invitación para guardarla en el ' +
          'teléfono. Es la forma más simple de repartirlas y además resuelve sola a quien la ' +
          'perdió y la necesita de nuevo.'
      }
    ],
    consejos: [
      'Dejá el código sobre una zona clara y lisa del diseño. Sobre una foto con detalles cuesta el doble leerlo.',
      'Probá una invitación real con el escáner antes de repartir las demás.'
    ],
    problemas: [
      {
        sintoma: 'El código sale cortado o encima del texto del diseño.',
        solucion: 'Volvé al diseñador y movelo. La posición se guarda y se aplica a todas las invitaciones.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'usuarios',
    vista: 'usuarios',
    modulo: 'usuarios',
    titulo: 'Usuarios y roles',
    icono: 'fa-user-shield',
    diagrama: 'usuarios',
    resumen: 'Quién puede entrar al sistema y con qué alcance.',
    bloques: [
      {
        id: 'usuarios-diferencia',
        titulo: 'Usuario no es lo mismo que empleado',
        icono: 'fa-circle-question',
        breve: 'Los empleados son los invitados a la fiesta. Los usuarios son quienes manejan el sistema.',
        detallada:
          'Son dos listas distintas y conviene no confundirlas. Los empleados son todo el personal ' +
          'invitado al evento: reciben invitación y pasan por la puerta, pero no entran al ' +
          'sistema. Los usuarios son las pocas personas que sí entran a manejarlo: quien está en ' +
          'la puerta escaneando, quien organiza, quien administra. Una misma persona puede estar ' +
          'en las dos listas, pero son registros separados.'
      },
      {
        id: 'usuarios-roles',
        titulo: 'Los roles',
        icono: 'fa-users-gear',
        breve: 'El rol define qué puede hacer cada usuario. Se asigna al crearlo.',
        detallada:
          'Cada usuario tiene un rol, y el rol es lo que define qué pantallas ve y qué puede ' +
          'hacer en cada una. En lugar de configurar los permisos persona por persona, se ' +
          'configuran una vez por rol y después se asigna el rol que corresponda. Así, quien ' +
          'solo va a estar en la puerta ve el escáner y nada más, sin riesgo de tocar algo que no ' +
          'debía.'
      },
      {
        id: 'usuarios-desactivar',
        titulo: 'Desactivar una cuenta',
        icono: 'fa-user-lock',
        breve: 'Desactivar impide entrar sin borrar el historial. No se puede desactivar al último administrador.',
        detallada:
          'Cuando alguien deja de necesitar acceso, se desactiva su cuenta: deja de poder entrar ' +
          'pero se conserva el registro de lo que hizo. Si la persona tenía la sesión abierta, se ' +
          'le cierra. El sistema no permite desactivar al último administrador que queda, porque ' +
          'eso dejaría a nadie con capacidad de volver a activar cuentas.'
      },
      {
        id: 'usuarios-impersonar',
        titulo: 'Usar la cuenta de otro',
        icono: 'fa-user-secret',
        breve: 'Un administrador puede ver el sistema como lo ve otro usuario, para entender qué le pasa.',
        detallada:
          'Cuando alguien reporta que no encuentra un botón o que algo no le funciona, muchas ' +
          'veces es un tema de permisos y desde una cuenta de administrador no se puede ver el ' +
          'problema. Por eso un administrador puede pasar a ver el sistema exactamente como lo ve ' +
          'esa persona. Mientras dura, aparece una franja de aviso permanente, y se vuelve a la ' +
          'cuenta propia con un clic. No sirve para entrar a la cuenta de otro administrador.'
      }
    ],
    consejos: [
      'Creá un usuario aparte para quien va a estar en la puerta, con un rol limitado. No prestes la cuenta de administrador.'
    ],
    problemas: [
      {
        sintoma: 'Un usuario dice que no ve una pantalla.',
        solucion: 'Revisá los permisos de su rol. Si sigue sin quedar claro, usá su cuenta un momento para ver exactamente lo que ve.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'permisos',
    vista: 'permisos',
    modulo: 'permisos',
    titulo: 'Permisos',
    icono: 'fa-shield-halved',
    diagrama: 'permisos',
    resumen: 'Qué puede hacer cada rol en cada pantalla.',
    bloques: [
      {
        id: 'permisos-matriz',
        titulo: 'La tabla de permisos',
        icono: 'fa-table-cells',
        breve: 'Elegí un rol y marcá qué puede hacer en cada pantalla: ver, agregar, editar, eliminar.',
        detallada:
          'Se elige un rol y aparece una tabla con todas las pantallas del sistema y cuatro ' +
          'casillas por cada una: ver, agregar, editar y eliminar. Ver es la más importante: sin ' +
          'ella la pantalla ni siquiera aparece en el menú. Las otras tres controlan qué botones ' +
          'se muestran dentro. Los cambios afectan a todos los usuarios que tengan ese rol.'
      },
      {
        id: 'permisos-admin',
        titulo: 'El administrador',
        icono: 'fa-key',
        breve: 'El rol de administrador puede todo, siempre. No se le configuran permisos.',
        detallada:
          'El rol de administrador tiene acceso completo por definición y no depende de esta ' +
          'tabla. Es a propósito: si los permisos del administrador se pudieran configurar mal, ' +
          'alguien podría quedarse sin forma de arreglarlo. Conviene que haya pocos ' +
          'administradores y que el resto tenga roles ajustados a lo que realmente necesita.'
      }
    ],
    consejos: [
      'Después de cambiar permisos, pediles que vuelvan a entrar. Los cambios se toman al iniciar sesión.'
    ],
    problemas: [
      {
        sintoma: 'Cambié un permiso y la persona sigue igual.',
        solucion: 'Todavía tiene la sesión anterior abierta. Al cerrar sesión y volver a entrar toma los permisos nuevos.'
      }
    ]
  },

  // =========================================================================
  {
    id: 'configuracion',
    vista: 'configuracion',
    modulo: 'configuracion',
    titulo: 'Configuración',
    icono: 'fa-sliders',
    diagrama: 'configuracion',
    resumen: 'Apariencia, revisión previa y vaciado de registros.',
    bloques: [
      {
        id: 'configuracion-revision',
        titulo: 'La revisión previa',
        icono: 'fa-heart-pulse',
        breve: 'Corré la revisión antes de abrir las puertas. Avisa lo que falta.',
        detallada:
          'Es un botón que revisa de una vez las cosas que suelen fallar el día del evento: si hay ' +
          'un evento activo, si hay personal cargado, cuánta gente entró hasta el momento y si la ' +
          'base de datos está al día con el sistema. Correrlo antes de abrir las puertas lleva ' +
          'unos segundos y es la forma más barata de descubrir un problema cuando todavía hay ' +
          'tiempo de resolverlo.'
      },
      {
        id: 'configuracion-apariencia',
        titulo: 'Apariencia',
        icono: 'fa-palette',
        breve: 'Definí el tema claro u oscuro, el color de la institución y qué logo se usa.',
        detallada:
          'Acá se define cómo se ve el sistema para todos: si arranca en claro o en oscuro, cuál ' +
          'es el color principal —del que salen los botones y todo lo que se destaca— y qué ' +
          'versión del logo se usa y de qué tamaño. El color y el logo valen para todos los ' +
          'dispositivos. El tema es la excepción: quien lo haya cambiado a mano en su dispositivo ' +
          'conserva su elección, y para volver a seguir al general hay un botón que lo dice.'
      },
      {
        id: 'configuracion-interruptores',
        titulo: 'Apagar un módulo',
        icono: 'fa-toggle-on',
        breve: 'Los interruptores apagan el escáner, los sorteos o el portal público en caliente.',
        detallada:
          'Hay tres interruptores para apagar funciones sin tocar nada más. Sirven para el ' +
          'momento en que algo se está usando mal y hay que frenarlo ya: cerrar el portal público ' +
          'cuando terminó el plazo de invitaciones, apagar el escáner cuando ya entró todo el ' +
          'mundo, bloquear los sorteos hasta que sea la hora. Se vuelven a encender igual de ' +
          'rápido.'
      },
      {
        id: 'configuracion-vaciar',
        titulo: 'Vaciar registros',
        icono: 'fa-eraser',
        breve: 'Borra todos los registros de un tipo. No se puede deshacer. Hay que escribir el nombre para confirmar.',
        detallada:
          'Permite borrar de una vez todos los registros de un tipo: las asistencias, los ' +
          'ganadores, los sorteos. Está pensado para limpiar entre una prueba y la siguiente, no ' +
          'para el uso normal. Es irreversible, y por eso pide escribir a mano el nombre exacto de ' +
          'lo que se va a borrar: un borrado total no debería poder dispararse con un clic de ' +
          'más. Los catálogos que cuesta cargar —empleados, departamentos, usuarios— no están en ' +
          'esta lista a propósito.'
      }
    ],
    consejos: [
      'La versión instalada, abajo del todo, dice si el dispositivo ya recibió la última actualización. Si no coincide con la publicada, cerrá y volvé a abrir la aplicación.'
    ],
    problemas: [
      {
        sintoma: 'La revisión avisa que falta correr una migración.',
        solucion: 'La base de datos quedó atrás respecto del sistema. Es una tarea para quien administra la base; el aviso dice cuál falta.'
      }
    ]
  }
];

/** El capítulo que corresponde a una vista, para el botón de ayuda. */
export function capituloDeVista(vista) {
  return CAPITULOS.find((capitulo) => capitulo.vista === vista) || CAPITULOS[0];
}
