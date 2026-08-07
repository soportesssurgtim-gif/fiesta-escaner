/**
 * Repositorio genérico sobre una tabla de Supabase.
 *
 * Los diez catálogos del sistema (empleados, departamentos, premios, roles…)
 * hacían exactamente lo mismo: listar ordenado, insertar si no hay id,
 * actualizar si lo hay, y traducir el error 23505 a "ya existe". Eso son unas
 * cuarenta líneas repetidas diez veces.
 *
 * Con esta clase cada controlador se queda solo con lo suyo: qué campos acepta
 * y cómo validarlos.
 */

import { supabase } from './supabase.js';

export class Repositorio {
  /**
   * @param {string} tabla          Nombre de la tabla en Postgres.
   * @param {Object} opciones
   * @param {string} opciones.ordenarPor      Columna para ordenar los listados.
   * @param {boolean} opciones.ascendente     Dirección del orden.
   * @param {string} opciones.mensajeDuplicado Qué decirle al usuario ante un choque
   *                                           de índice único (ej: DUI repetido).
   */
  /**
   * @param {string[]} [opciones.columnasOpcionales] Columnas que puede que
   *   todavía no existan en la base porque su migración está pendiente. Si el
   *   guardado falla por una de ellas, se reintenta sin esa columna en lugar de
   *   romper. Evita que agregar un campo nuevo deje inservible una pantalla que
   *   funcionaba, mientras alguien corre el SQL.
   */
  constructor(tabla, opciones = {}) {
    this.tabla = tabla;
    this.ordenarPor = opciones.ordenarPor || null;
    this.ascendente = opciones.ascendente !== false;
    this.mensajeDuplicado = opciones.mensajeDuplicado || 'El registro ya existe.';
    this.columnasOpcionales = opciones.columnasOpcionales || [];
  }

  /**
   * ¿El error es "esa columna no existe" sobre una columna que declaramos
   * opcional? PostgREST lo reporta como PGRST204 y Postgres como 42703.
   */
  _columnaFaltante(error) {
    const codigo = String(error?.code || '');
    if (codigo !== 'PGRST204' && codigo !== '42703') return null;

    const mensaje = String(error?.message || '');
    return this.columnasOpcionales.find((columna) => mensaje.includes(columna)) || null;
  }

  /** Quita una columna del objeto y avisa una sola vez en el log. */
  _sinColumna(datos, columna) {
    const { [columna]: _descartada, ...resto } = datos;
    console.warn(
      `[${this.tabla}] La columna "${columna}" no existe todavía. ` +
      'Se guardó sin ella. Corre las migraciones pendientes en Supabase.'
    );
    return resto;
  }

  /** Consulta base con el orden ya aplicado. */
  _consulta(columnas = '*') {
    let consulta = supabase.from(this.tabla).select(columnas);
    if (this.ordenarPor) {
      consulta = consulta.order(this.ordenarPor, { ascending: this.ascendente });
    }
    return consulta;
  }

  /** Trae todo. `filtros` es un objeto plano tipo { activo: 'TRUE' }. */
  async listar(filtros = {}, columnas = '*') {
    let consulta = this._consulta(columnas);
    for (const [campo, valor] of Object.entries(filtros)) {
      consulta = consulta.eq(campo, valor);
    }
    const { data, error } = await consulta;
    if (error) throw error;
    return data || [];
  }

  /** Trae una fila por id, o null si no está. */
  async obtenerPorId(id, columnas = '*') {
    const { data, error } = await supabase
      .from(this.tabla)
      .select(columnas)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  /** Busca la primera fila que cumpla un filtro simple. */
  async buscarUno(filtros = {}, columnas = '*') {
    let consulta = supabase.from(this.tabla).select(columnas);
    for (const [campo, valor] of Object.entries(filtros)) {
      consulta = consulta.eq(campo, valor);
    }
    const { data, error } = await consulta.limit(1).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  /** Cuenta filas sin traérselas (head: true no descarga el contenido). */
  async contar(filtros = {}) {
    let consulta = supabase.from(this.tabla).select('*', { count: 'exact', head: true });
    for (const [campo, valor] of Object.entries(filtros)) {
      consulta = consulta.eq(campo, valor);
    }
    const { count, error } = await consulta;
    if (error) throw error;
    return count || 0;
  }

  async insertar(datos) {
    const { data, error } = await supabase
      .from(this.tabla)
      .insert(datos)
      .select()
      .maybeSingle();

    if (error) {
      const faltante = this._columnaFaltante(error);
      if (faltante) return this.insertar(this._sinColumna(datos, faltante));
      throw this._traducirError(error);
    }
    return data || datos;
  }

  async actualizar(id, datos) {
    const { data, error } = await supabase
      .from(this.tabla)
      .update(datos)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      const faltante = this._columnaFaltante(error);
      if (faltante) return this.actualizar(id, this._sinColumna(datos, faltante));
      throw this._traducirError(error);
    }
    return data || { ...datos, id };
  }

  /**
   * Inserta o actualiza según venga o no un id.
   * Es el patrón que usan todos los formularios del sistema.
   */
  async guardar(id, datos) {
    return id ? this.actualizar(id, datos) : this.insertar(datos);
  }

  async eliminar(id) {
    const { error } = await supabase.from(this.tabla).delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  /**
   * Convierte errores de Postgres en algo que el usuario entienda.
   * El 23505 es la violación de índice único; el resto pasa tal cual porque el
   * controlador ya lo va a registrar en el log.
   */
  _traducirError(error) {
    if (error && error.code === '23505') {
      const amigable = new Error(this.mensajeDuplicado);
      amigable.esDeUsuario = true;
      return amigable;
    }
    return error;
  }
}
