export const MODULOS_DOCENTE = [
  { numero: 1, inicio: '07:30', fin: '08:30' },
  { numero: 2, inicio: '08:35', fin: '09:35' },
  { numero: 3, inicio: '09:40', fin: '10:40' },
  { numero: 4, inicio: '10:50', fin: '11:50' },
  { numero: 5, inicio: '11:55', fin: '12:55' },
  { numero: 6, inicio: '13:15', fin: '14:15' },
  { numero: 7, inicio: '14:20', fin: '15:20' },
  { numero: 8, inicio: '15:25', fin: '16:25' },
  { numero: 9, inicio: '16:35', fin: '17:35' },
  { numero: 10, inicio: '17:40', fin: '18:40' }
];

// No hay clases los sábados.
export const DIAS_SEMANA = [
  { valor: 'LUNES', etiqueta: 'Lun' },
  { valor: 'MARTES', etiqueta: 'Mar' },
  { valor: 'MIERCOLES', etiqueta: 'Mié' },
  { valor: 'JUEVES', etiqueta: 'Jue' },
  { valor: 'VIERNES', etiqueta: 'Vie' }
];

export const ETIQUETA_DIA = Object.fromEntries(DIAS_SEMANA.map((d) => [d.valor, d.etiqueta]));

export const ETIQUETA_TURNO = { MANANA: 'Mañana', TARDE: 'Tarde' };

export function bloqueEsModuloFijo(bloque) {
  return MODULOS_DOCENTE.some((m) => m.inicio === bloque.horaInicio && m.fin === bloque.horaFin);
}

// Límite entre mañana y tarde: el módulo 5 termina 12:55, el 6 arranca 13:15.
// Comparación de strings "HH:MM" funciona porque están en el mismo formato
// zero-padded, así que el orden lexicográfico coincide con el horario real.
const LIMITE_TARDE = '13:00';

export function turnoDeHora(horaInicio) {
  return horaInicio < LIMITE_TARDE ? 'MANANA' : 'TARDE';
}

// Un bloque es contraturno cuando cae en el turno contrario al de la división,
// esté o no alineado a un módulo fijo: antes solo se marcaba contraturno un
// horario "suelto" (que no coincidía con ningún módulo de la grilla), así que
// una materia a contraturno que sí calzaba con un módulo fijo del otro turno
// (ej. Educación Física a la mañana en una división de la tarde) no se
// distinguía de una clase normal.
export function bloqueEsContraturno(bloque, turnoDivision) {
  if (!turnoDivision) return !bloqueEsModuloFijo(bloque);
  return turnoDeHora(bloque.horaInicio) !== turnoDivision;
}

// Paleta fija de 8 colores para distinguir materias/cargos de un vistazo en la
// grilla. La asignación es por hash del nombre del cargo (no por posición en una
// lista), así una materia siempre cae en el mismo color sin importar qué otras
// materias estén cargadas ese día.
const CANTIDAD_COLORES_MATERIA = 8;

export function colorMateria(nombreCargo) {
  let hash = 0;
  for (let i = 0; i < nombreCargo.length; i++) {
    hash = (hash * 31 + nombreCargo.charCodeAt(i)) >>> 0;
  }
  return `horarios-chip-materia-${(hash % CANTIDAD_COLORES_MATERIA) + 1}`;
}

// Día de semana (valor de DIAS_SEMANA) para una fecha "YYYY-MM-DD", o null si
// cae en fin de semana. Arma el Date con los componentes locales (no parsea el
// string ISO directo, que Date interpreta como UTC medianoche) para que no se
// corra un día según la zona horaria del navegador.
export function diaSemanaDeFecha(fechaStr) {
  if (!fechaStr) return null;
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  const diaJs = new Date(anio, mes - 1, dia).getDay(); // 0=domingo … 6=sábado
  if (diaJs === 0 || diaJs === 6) return null;
  return DIAS_SEMANA[diaJs - 1].valor;
}

// Duración de un bloque en horas (con decimales), a partir de "HH:MM".
export function duracionHoras(bloque) {
  const [hIni, mIni] = bloque.horaInicio.split(':').map(Number);
  const [hFin, mFin] = bloque.horaFin.split(':').map(Number);
  return Math.max(0, (hFin * 60 + mFin - (hIni * 60 + mIni)) / 60);
}

// "YYYY-MM-DD" (o "YYYY-MM-DDT00:00:00.000Z") -> timestamp UTC de esa fecha a
// medianoche, sin pasar por un Date en hora local. Las fechas de licencias
// llegan del backend como medianoche UTC — leer solo los primeros 10
// caracteres y reconstruir en UTC evita que new Date(...).setHours(0,0,0,0)
// reinterprete esa medianoche UTC como el día anterior en una zona horaria
// con offset negativo (Argentina, UTC-3) — mismo problema que diaSemanaDeFecha
// ya evita arriba, acá aplicado a licencias en vez de bloques de horario.
export function claveDiaUTC(fechaIso) {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

// ¿Está vigente la licencia en la fecha dada? Sin `fecha` compara contra hoy.
// Usado tanto para "¿está vigente hoy?" (Cargos, Licencias) como para
// resolver quién ocupaba un cargo en una fecha puntual del pasado al cargar
// un parte diario atrasado (Horarios, Partes Diarios).
export function licenciaVigenteEn(licencia, fecha) {
  let claveFecha;
  if (fecha) {
    claveFecha = claveDiaUTC(fecha);
  } else {
    const ahora = new Date();
    claveFecha = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  }
  const inicio = claveDiaUTC(licencia.fechaInicio);
  if (inicio > claveFecha) return false;
  if (!licencia.fechaFin) return true;
  return claveDiaUTC(licencia.fechaFin) >= claveFecha;
}

export function resumenHorario(bloques) {
  if (!bloques || bloques.length === 0) return '-';
  const ordenados = [...bloques].sort((a, b) => {
    const diaA = DIAS_SEMANA.findIndex((d) => d.valor === a.diaSemana);
    const diaB = DIAS_SEMANA.findIndex((d) => d.valor === b.diaSemana);
    if (diaA !== diaB) return diaA - diaB;
    return a.horaInicio.localeCompare(b.horaInicio);
  });
  return ordenados.map((b) => `${ETIQUETA_DIA[b.diaSemana]} ${b.horaInicio}-${b.horaFin}`).join(', ');
}
