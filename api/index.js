/**
 * LA ÚNICA Serverless Function del proyecto.
 *
 * Todo /api/* entra por acá. Vercel solo cuenta como función a los archivos
 * que están en la raíz de /api, y todo lo demás vive bajo /api/_lib, que queda
 * excluido por empezar con guion bajo.
 *
 * Antes: 11 archivos = 11 funciones, con un techo de 12 en el plan Hobby.
 * Ahora: 1 función. Se pueden agregar todos los recursos que se quieran sin
 * volver a pensar en ese límite.
 *
 * El mapeo de URL a recurso lo hace el rewrite de vercel.json, que convierte
 *   /api/empleados?accion=exportar-csv
 * en
 *   /api/index?recurso=empleados&accion=exportar-csv
 */

import { Enrutador } from './_lib/enrutador.js';

import { controladorAutenticacion } from './_lib/controladores/autenticacion.js';
import { controladorAsistencias } from './_lib/controladores/asistencias.js';
import { controladorEmpleados } from './_lib/controladores/empleados.js';
import { controladorDepartamentos } from './_lib/controladores/departamentos.js';
import { controladorEventos } from './_lib/controladores/eventos.js';
import { controladorPremios } from './_lib/controladores/premios.js';
import { controladorRoles } from './_lib/controladores/roles.js';
import { controladorTarjetas } from './_lib/controladores/tarjetas.js';
import { controladorUsuarios } from './_lib/controladores/usuarios.js';
import { controladorConfiguracion } from './_lib/controladores/configuracion.js';
import { controladorInvitacionPublica } from './_lib/controladores/invitacionPublica.js';

const enrutador = new Enrutador();

// Cada recurso se registra con su nombre "oficial" y con los alias históricos
// que el frontend viejo pudo haber dejado en caché o en un service worker.
enrutador.registrar(['auth', 'autenticacion'], controladorAutenticacion);
enrutador.registrar(['asistencias', 'asistencia'], controladorAsistencias);
enrutador.registrar(['empleados'], controladorEmpleados);
enrutador.registrar(['departamentos', 'dpto'], controladorDepartamentos);
enrutador.registrar(['eventos'], controladorEventos);
enrutador.registrar(['premios', 'sorteos'], controladorPremios);
enrutador.registrar(['roles', 'permisos'], controladorRoles);
enrutador.registrar(['tarjetas', 'plantillas'], controladorTarjetas);
enrutador.registrar(['usuarios'], controladorUsuarios);
enrutador.registrar(['configuracion'], controladorConfiguracion);
enrutador.registrar(['invitacion-publica', 'invitacion'], controladorInvitacionPublica);

export default async function handler(req, res) {
  return enrutador.despachar(req, res);
}
