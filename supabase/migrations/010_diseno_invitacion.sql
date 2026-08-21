-- ---------------------------------------------------------------------
-- 010 · El diseño de la invitación, por evento
-- ---------------------------------------------------------------------
--
-- Qué guarda
-- ----------
-- Cómo se ve la invitación de este evento: la disposición, dos colores, los
-- textos del encabezado y del pie, y qué datos se muestran. Nada de imágenes:
-- es un objeto de unos pocos cientos de bytes.
--
-- Por qué acá y no en una tabla aparte
-- ------------------------------------
-- Es un diseño por evento, así que vive con el evento. Una tabla aparte
-- obligaría a un join en el portal público —que es la pantalla que más tiene
-- que responder— y dejaría filas huérfanas al borrar un evento.
--
-- Lo que se pierde es reusar un diseño entre eventos. Se resuelve en la
-- pantalla, con un botón que copia el diseño de otro evento: son cuatro o cinco
-- fiestas al año, no hace falta un catálogo para eso.
--
-- Por qué JSONB y no una columna por campo
-- ----------------------------------------
-- Porque los campos van a cambiar. Agregar una disposición o una opción nueva
-- sería una migración cada vez, y cada una sobre una tabla que el portal
-- público consulta. En JSONB el código decide qué campos entiende, y lo que no
-- reconoce lo ignora sin romperse.
--
-- El precio es que la base no valida el contenido. Se asume: quien lo lee
-- (`disenoInvitacion.js`) completa campo por campo lo que falte o venga mal, y
-- ante cualquier basura muestra el diseño de siempre. Una invitación que no se
-- ve porque alguien guardó un color mal escrito sería peor que una invitación
-- con el color de siempre.
--
-- NULL significa «este evento no configuró nada» y es el estado normal: los
-- eventos que ya existen quedan así y se siguen viendo exactamente igual.
--
-- Es idempotente y no borra nada.
-- ---------------------------------------------------------------------

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS invitacion_config JSONB;

COMMENT ON COLUMN eventos.invitacion_config IS
  'Cómo se ve la invitación de este evento. NULL = el diseño de siempre. Lo interpreta assets/js/nucleo/disenoInvitacion.js.';
