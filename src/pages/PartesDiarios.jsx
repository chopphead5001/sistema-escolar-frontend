import { useState, useEffect, useRef } from 'react';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Cargos.css';
import './MateriasAdeudadas.css';
import './Inasistencias.css';
import './PartesDiarios.css';
import { diaSemanaDeFecha, duracionHoras, turnoDeHora, licenciaVigenteEn, bloqueVigenteEn, ETIQUETA_TURNO } from '../constants/horarios';

const CARGOS_LABEL = 'Cargos (sin división)';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function turnoAEnum(turno) {
  return turno === 'Mañana' ? 'MANANA' : 'TARDE';
}

function nombrePersona(persona) {
  return `${persona.apellido}, ${persona.nombre}`;
}

function fechaCorta(fechaIso) {
  return fechaIso.slice(0, 10);
}

function redondear(n) {
  return Math.round(n * 100) / 100;
}

// Faltar en todos los turnos programados un día = 1 día; en solo alguno de
// los que tenía, una fracción (ej. 1 de 2 turnos = medio día).
function formatoDias(v) {
  if (v === 0.5) return 'medio día';
  return `${v} ${v === 1 ? 'día' : 'días'}`;
}

// "Cargos (sin división)" se mide en días (ver agruparCargosDelDia); el resto
// (profesores de aula) sigue en horas.
function formatoAusente(valor, label) {
  const v = redondear(valor);
  if (label === CARGOS_LABEL) return formatoDias(v);
  return `${v}h`;
}

// Resumen del header de una persona en el ranking: si tiene ausencias de
// ambos tipos (ej. da clase Y además cubre un cargo administrativo), muestra
// los dos por separado en vez de sumarlos en un solo número sin sentido.
function resumenAusenciasPersona(p) {
  const partes = [];
  if (p.diasAusentes > 0) partes.push(`${formatoDias(p.diasAusentes)} (${p.pctDias}%)`);
  if (p.horasAusentes > 0) partes.push(`${p.horasAusentes}h (${p.pctHoras}%)`);
  return `${partes.join(' + ')} ausente`;
}

// Resuelve, para un cargo "real" (no generado por otra licencia), quién lo
// ocupaba en la fecha dada: si tiene una licencia vigente esa fecha y existe
// un cargo de cobertura todavía vigente para ella, se baja a ese cargo — y se
// repite (por si ese cargo de cobertura a su vez tuvo su propia licencia con
// su propio suplente, ver 2026-08-21 en CLAUDE.md). Mismo criterio que
// Horarios.jsx, pero evaluado en una fecha puntual (Registro puede cargar un
// día atrasado) en vez de siempre "hoy".
function cargoActivoEn(cargoBase, todosLosCargos, fecha) {
  let actual = cargoBase;
  for (let profundidad = 0; profundidad < 10; profundidad++) {
    const licenciaActiva = (actual.licencias || []).find((l) => licenciaVigenteEn(l, fecha));
    if (!licenciaActiva) return actual;
    const cobertura = todosLosCargos.find((c) => c.origenLicenciaId === licenciaActiva.id && c.vigente);
    if (!cobertura) return actual;
    actual = cobertura;
  }
  return actual;
}

// Para una fecha+turno, agrupa los cargos que tienen horario ese día/turno por
// división (más un balde aparte para los cargos sin división). Un bloque
// cuenta para el turno según su propio horario (turnoDeHora), no según el
// turno "oficial" de la división — así un contraturno de mañana en una
// división de tarde aparece en el turno mañana, que es cuando la persona
// realmente está en la escuela.
//
// turnoDeHora solo mira la hora de inicio del bloque: un cargo administrativo
// con un horario libre que cruce las 13:00 (ej. "8:30 a 14:30") cae entero en
// el turno de su inicio (acá, mañana) y no aparece en absoluto en el turno
// tarde ese día, aunque en la práctica la persona siga en la escuela. Decisión
// consciente (no un bug): partir el bloque en 2 turnos complicaría bastante el
// cálculo de horas en Estadísticas para un caso que hoy no se da con los
// cargos administrativos reales del colegio. Si en el futuro aparece un
// horario así y hace falta que la persona sea visible en ambos turnos, este
// es el lugar para revisarlo.
function agruparCargosDelDia(cargos, fecha, turno) {
  const dia = diaSemanaDeFecha(fecha);
  const porDivision = {};
  const sinDivision = [];
  if (!dia) return { porDivision, sinDivision };

  const turnoEnum = turnoAEnum(turno);
  const cargosBase = cargos.filter((c) => !c.origenLicenciaId);
  const cargosActivos = cargosBase.map((c) => cargoActivoEn(c, cargos, fecha));
  cargosActivos.forEach((cargo) => {
    const bloques = (cargo.bloquesHorario || []).filter(
      (b) => b.diaSemana === dia && turnoDeHora(b.horaInicio) === turnoEnum && bloqueVigenteEn(b, fecha)
    );
    if (bloques.length === 0) return;
    // Cargos sin división (Director/a, Preceptor/a, Secretaría, EMTP, etc.) no
    // se cuentan en horas de cátedra: una ausencia ahí es "faltó el día", no
    // "faltó N horas" — a pedido del usuario (2026-09-16), para no confundir
    // con las horas reales de los profesores de aula.
    const horas = cargo.divisionId
      ? redondear(bloques.reduce((acc, b) => acc + duracionHoras(b), 0))
      : 1;
    const item = { cargo, bloques, horas };
    if (cargo.divisionId) {
      if (!porDivision[cargo.divisionId]) porDivision[cargo.divisionId] = { division: cargo.division, items: [] };
      porDivision[cargo.divisionId].items.push(item);
    } else {
      sinDivision.push(item);
    }
  });

  return { porDivision, sinDivision };
}

// Arma el ranking de ausentismo: por persona, horas ausentes vs. horas
// posibles (las que tenía programadas en turnos ya confirmados), agrupado por
// división/cargos para el detalle expandible.
function calcularEstadisticas(cargos, confirmados, partes, filtroMes, filtroTurno) {
  const confirmadosFiltrados = confirmados.filter((c) => {
    const f = fechaCorta(c.fecha);
    if (filtroMes !== 'todos' && !f.startsWith(filtroMes)) return false;
    if (filtroTurno !== 'todos' && c.turno !== filtroTurno) return false;
    return true;
  });
  const clavesConfirmadas = new Set(confirmadosFiltrados.map((c) => `${c.divisionId}|${fechaCorta(c.fecha)}|${c.turno}`));
  const turnosConfirmadosUnicos = new Set(confirmadosFiltrados.map((c) => `${fechaCorta(c.fecha)}|${c.turno}`));
  const diasSet = new Set(confirmadosFiltrados.map((c) => fechaCorta(c.fecha)));

  const conteo = {}; // personaId -> { nombre, grupos: { label -> {ausentes, posibles, fechas:[]} } }
  function entradaPersona(cargo) {
    const id = cargo.personaId;
    if (!conteo[id]) conteo[id] = { personaId: id, nombre: nombrePersona(cargo.persona), grupos: {} };
    return conteo[id];
  }
  function entradaGrupo(cargo) {
    const persona = entradaPersona(cargo);
    const label = cargo.division?.nombre || CARGOS_LABEL;
    if (!persona.grupos[label]) persona.grupos[label] = { ausentes: 0, posibles: 0, fechas: [] };
    return persona.grupos[label];
  }

  const cargosBaseStats = cargos.filter((c) => !c.origenLicenciaId);

  // Posibles por división: para cada turno confirmado, sumar las horas
  // programadas de quien estaba realmente a cargo ese día (resuelto vía
  // cargoActivoEn) — no de todos los cargos de la división sin filtrar, que
  // incluiría al titular Y a cada nivel de una cadena de suplencias contando
  // la misma franja horaria una vez por cada uno.
  confirmadosFiltrados.forEach((confirmado) => {
    const dia = diaSemanaDeFecha(fechaCorta(confirmado.fecha));
    if (!dia) return;
    const turnoEnum = turnoAEnum(confirmado.turno);
    cargosBaseStats
      .filter((c) => c.divisionId === confirmado.divisionId)
      .map((c) => cargoActivoEn(c, cargos, confirmado.fecha))
      .forEach((cargo) => {
        const bloques = (cargo.bloquesHorario || []).filter((b) => b.diaSemana === dia && turnoDeHora(b.horaInicio) === turnoEnum && bloqueVigenteEn(b, confirmado.fecha));
        if (bloques.length === 0) return;
        entradaGrupo(cargo).posibles += bloques.reduce((acc, b) => acc + duracionHoras(b), 0);
      });
  });

  // "Cargos" (sin división): no tienen confirmación propia, se usa como proxy
  // de "hubo actividad escolar ese turno" la unión de turnos ya confirmados
  // por cualquier división MÁS los turnos donde ya hay una ausencia de cargo
  // cargada (evidencia de que el turno existió aunque nadie lo haya
  // confirmado desde una división) — a pedido del usuario (2026-09-16): con
  // solo confirmados, la mayoría de los partes de cargos importados no
  // tenían con qué compararse y el ausentismo daba >100%.
  const turnosConEvidenciaCargos = new Set(turnosConfirmadosUnicos);
  partes.forEach((parte) => {
    if (parte.cargo.divisionId !== null) return;
    const f = fechaCorta(parte.fecha);
    if (filtroMes !== 'todos' && !f.startsWith(filtroMes)) return;
    if (filtroTurno !== 'todos' && parte.turno !== filtroTurno) return;
    turnosConEvidenciaCargos.add(`${f}|${parte.turno}`);
  });

  // Turnos (Mañana/Tarde) que una persona sin división tenía programados un
  // día puntual, mirando TODOS sus cargos sin división vigentes ese día (no
  // solo el que originó el parte) — necesario para gente como Da Costa,
  // Valeria, que tiene un cargo de Preceptora a la mañana y otro a la tarde.
  function turnosSinDivisionProgramados(personaId, fecha, dia) {
    const turnos = new Set();
    cargosBaseStats
      .filter((c) => !c.divisionId && c.personaId === personaId)
      .map((c) => cargoActivoEn(c, cargos, fecha))
      .forEach((cargo) => {
        (cargo.bloquesHorario || []).forEach((b) => {
          if (b.diaSemana !== dia || !bloqueVigenteEn(b, fecha)) return;
          const t = ETIQUETA_TURNO[turnoDeHora(b.horaInicio)];
          if (filtroTurno !== 'todos' && t !== filtroTurno) return;
          turnos.add(t);
        });
      });
    return turnos;
  }

  // Horas (docentes de aula) y días (cargos sin división) se acumulan por
  // separado: sumarlos en un solo número no tiene sentido (mezclaría "5
  // días" con "5 horas") y fue lo que hacía que personas con ambos tipos de
  // cargo (ej. Escudero, Gaston: profesor + preceptor) dieran porcentajes de
  // ausentismo absurdos como 800% — a pedido del usuario (2026-09-16).
  let totalHorasAusentesDocentes = 0;
  let totalDiasAusentesCargos = 0;

  // Docentes de aula: sin cambios, un parte = sus horas reales.
  partes.forEach((parte) => {
    if (!parte.horasAfectadas || parte.cargo.divisionId === null) return;
    const f = fechaCorta(parte.fecha);
    if (filtroMes !== 'todos' && !f.startsWith(filtroMes)) return;
    if (filtroTurno !== 'todos' && parte.turno !== filtroTurno) return;
    const clave = `${parte.cargo.divisionId}|${f}|${parte.turno}`;
    if (!clavesConfirmadas.has(clave)) return;

    const grupo = entradaGrupo(parte.cargo);
    grupo.ausentes += parte.horasAfectadas;
    grupo.fechas.push({ fecha: f, horas: parte.horasAfectadas, cargoNombre: parte.cargo.nombreCargo });
    totalHorasAusentesDocentes += parte.horasAfectadas;
  });

  // Cargos sin división: agrupar por (persona, fecha) — faltar en los 2
  // turnos que tenía programados ese día cuenta como 1 día completo; faltar
  // en uno solo de los que tenía programados, como medio día — a pedido del
  // usuario (2026-09-16), para que Da Costa, Valeria (Preceptora mañana y
  // tarde) no figure faltando "2 días" por faltar un solo día completo.
  const partesCargoPorPersonaFecha = new Map(); // "personaId|fecha" -> { cargo, fecha, turnosAusentes: Set }
  partes.forEach((parte) => {
    if (!parte.horasAfectadas || parte.cargo.divisionId !== null) return;
    const f = fechaCorta(parte.fecha);
    if (filtroMes !== 'todos' && !f.startsWith(filtroMes)) return;
    if (filtroTurno !== 'todos' && parte.turno !== filtroTurno) return;
    const key = `${parte.cargo.personaId}|${f}`;
    if (!partesCargoPorPersonaFecha.has(key)) {
      partesCargoPorPersonaFecha.set(key, { cargo: parte.cargo, fecha: f, turnosAusentes: new Set() });
    }
    partesCargoPorPersonaFecha.get(key).turnosAusentes.add(parte.turno);
  });

  partesCargoPorPersonaFecha.forEach(({ cargo, fecha, turnosAusentes }) => {
    const dia = diaSemanaDeFecha(fecha);
    const turnosProgramados = dia ? turnosSinDivisionProgramados(cargo.personaId, fecha, dia) : new Set();
    const denominador = turnosProgramados.size || turnosAusentes.size || 1;
    const fraccionDia = redondear(Math.min(1, turnosAusentes.size / denominador));

    const grupo = entradaGrupo(cargo);
    grupo.ausentes += fraccionDia;
    grupo.fechas.push({
      fecha,
      horas: fraccionDia,
      cargoNombre: `${cargo.nombreCargo} (${[...turnosAusentes].sort().join('/')})`
    });
    totalDiasAusentesCargos += fraccionDia;
  });

  // Posibles de "Cargos": 1 día posible por (persona, fecha) donde tenía al
  // menos un turno programado y ese turno tiene evidencia de haber ocurrido
  // — misma unidad "día" que ausentes arriba, no por turno suelto.
  const fechasConEvidencia = new Set([...turnosConEvidenciaCargos].map((c) => c.split('|')[0]));
  const personasSinDivision = [...new Set(cargosBaseStats.filter((c) => !c.divisionId).map((c) => c.personaId))];
  personasSinDivision.forEach((personaId) => {
    fechasConEvidencia.forEach((fecha) => {
      const dia = diaSemanaDeFecha(fecha);
      if (!dia) return;
      const turnosProgramados = turnosSinDivisionProgramados(personaId, fecha, dia);
      if (turnosProgramados.size === 0) return;
      const hayEvidenciaEseDia = [...turnosProgramados].some((t) => turnosConEvidenciaCargos.has(`${fecha}|${t}`));
      if (!hayEvidenciaEseDia) return;
      const cargoPersona = cargosBaseStats.find((c) => !c.divisionId && c.personaId === personaId);
      entradaGrupo(cargoPersona).posibles += 1;
    });
  });

  const ranking = Object.values(conteo)
    .map((p) => {
      let diasAusentes = 0, diasPosibles = 0, horasAusentes = 0, horasPosibles = 0;
      Object.entries(p.grupos).forEach(([label, g]) => {
        if (label === CARGOS_LABEL) { diasAusentes += g.ausentes; diasPosibles += g.posibles; }
        else { horasAusentes += g.ausentes; horasPosibles += g.posibles; }
      });
      return {
        ...p,
        diasAusentes: redondear(diasAusentes),
        diasPosibles: redondear(diasPosibles),
        pctDias: diasPosibles > 0 ? Math.round((diasAusentes / diasPosibles) * 100) : 0,
        horasAusentes: redondear(horasAusentes),
        horasPosibles: redondear(horasPosibles),
        pctHoras: horasPosibles > 0 ? Math.round((horasAusentes / horasPosibles) * 100) : 0
      };
    })
    .filter((p) => p.diasAusentes > 0 || p.horasAusentes > 0)
    .sort((a, b) => (b.diasAusentes + b.horasAusentes) - (a.diasAusentes + a.horasAusentes));

  // Misma información que "ranking", pero organizada por división en vez de
  // por persona (invierte conteo: división -> personas que faltaron ahí).
  const porDivision = {};
  Object.values(conteo).forEach((p) => {
    Object.entries(p.grupos).forEach(([label, g]) => {
      if (!porDivision[label]) porDivision[label] = { ausentes: 0, posibles: 0, personas: [] };
      porDivision[label].ausentes += g.ausentes;
      porDivision[label].posibles += g.posibles;
      if (g.ausentes > 0) {
        porDivision[label].personas.push({
          personaId: p.personaId, nombre: p.nombre,
          ausentes: redondear(g.ausentes), posibles: redondear(g.posibles), fechas: g.fechas
        });
      }
    });
  });
  const divisiones = Object.entries(porDivision)
    .map(([label, d]) => ({
      label, ausentes: redondear(d.ausentes), posibles: redondear(d.posibles),
      personas: d.personas.sort((a, b) => b.ausentes - a.ausentes)
    }))
    .filter((d) => d.ausentes > 0)
    .sort((a, b) => b.ausentes - a.ausentes);

  return {
    ranking,
    divisiones,
    totalHorasAusentes: redondear(totalHorasAusentesDocentes),
    totalDiasAusentesCargos: redondear(totalDiasAusentesCargos),
    diasRegistrados: diasSet.size,
    promedioHorasDia: diasSet.size ? redondear(totalHorasAusentesDocentes / diasSet.size) : 0
  };
}

function PartesDiarios() {
  const { cicloLectivo } = useCicloLectivo();

  const [vista, setVista] = useState('registro');
  const [cargosDisponibles, setCargosDisponibles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  async function cargarCargos() {
    setCargando(true);
    setError('');
    try {
      const respuesta = await cliente.get('/partes-diarios/cargos-disponibles', { params: { cicloLectivo } });
      setCargosDisponibles(respuesta.data);
    } catch (err) {
      setError('No se pudo cargar el listado de cargos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarCargos();
  }, [cicloLectivo]);

  // ===== REGISTRO =====
  const [fecha, setFecha] = useState('');
  const [turno, setTurno] = useState('Tarde');
  const [partesDelTurno, setPartesDelTurno] = useState([]);
  const [confirmados, setConfirmados] = useState([]);
  const [marcas, setMarcas] = useState({});
  const [divisionesAbiertas, setDivisionesAbiertas] = useState({});
  const [guardandoRegistro, setGuardandoRegistro] = useState(false);

  const solicitudConfirmadosRef = useRef(0);

  async function cargarConfirmados() {
    const idSolicitud = ++solicitudConfirmadosRef.current;
    try {
      const respuesta = await cliente.get('/partes-diarios/confirmados', { params: { cicloLectivo } });
      if (idSolicitud !== solicitudConfirmadosRef.current) return; // llegó una carga más nueva antes: descartar esta
      setConfirmados(respuesta.data);
    } catch (err) {
      if (idSolicitud !== solicitudConfirmadosRef.current) return;
      setConfirmados([]);
    }
  }

  useEffect(() => {
    cargarConfirmados();
  }, [cicloLectivo]);

  // fecha/turno pueden cambiar rápido (ej. tipeando la fecha) — sin este
  // guard, la respuesta de un fetch viejo puede llegar después que la de uno
  // más nuevo y pisar partesDelTurno con datos de otra fecha/turno (mismo
  // patrón ya resuelto en MateriasAdeudadas.jsx con solicitudGenerarRef).
  const solicitudTurnoRef = useRef(0);

  async function cargarPartesDelTurno() {
    const idSolicitud = ++solicitudTurnoRef.current;
    if (!fecha || !turno) {
      setPartesDelTurno([]);
      return;
    }
    try {
      const respuesta = await cliente.get('/partes-diarios', { params: { fecha, turno } });
      if (idSolicitud !== solicitudTurnoRef.current) return;
      setPartesDelTurno(respuesta.data);
    } catch (err) {
      if (idSolicitud !== solicitudTurnoRef.current) return;
      setPartesDelTurno([]);
    }
  }

  useEffect(() => {
    cargarPartesDelTurno();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, turno]);

  useEffect(() => {
    const iniciales = {};
    partesDelTurno.forEach((p) => {
      iniciales[p.cargoId] = { ausente: true, horas: p.horasAfectadas || 0, parteId: p.id };
    });
    setMarcas(iniciales);
  }, [partesDelTurno]);

  const agrupado = agruparCargosDelDia(cargosDisponibles, fecha, turno);
  const divisionesOrdenadas = Object.entries(agrupado.porDivision).sort(
    ([, a], [, b]) => a.division.anio - b.division.anio || a.division.nombre.localeCompare(b.division.nombre)
  );

  const yaConfirmado = divisionesOrdenadas.some(([divisionId]) =>
    confirmados.some((c) => c.divisionId === Number(divisionId) && fechaCorta(c.fecha) === fecha && c.turno === turno)
  );

  function alternarDivision(divisionId) {
    setDivisionesAbiertas((prev) => ({ ...prev, [divisionId]: !prev[divisionId] }));
  }

  function alternarAusente(cargoId, horas) {
    setMarcas((prev) => {
      const actual = prev[cargoId];
      if (actual?.ausente) {
        return { ...prev, [cargoId]: { ...actual, ausente: false } };
      }
      return { ...prev, [cargoId]: { ausente: true, horas, parteId: actual?.parteId ?? null } };
    });
  }

  function horasAusentesDeGrupo(items) {
    return redondear(items.reduce((acc, { cargo }) => acc + (marcas[cargo.id]?.ausente ? marcas[cargo.id].horas : 0), 0));
  }

  async function guardarRegistro() {
    setGuardandoRegistro(true);
    setError('');
    setMensajeExito('');
    try {
      for (const [divisionId] of divisionesOrdenadas) {
        await cliente.post('/partes-diarios/confirmar-turno', { divisionId: parseInt(divisionId), fecha, turno, cicloLectivo });
      }

      let ausentes = 0;
      for (const [cargoIdStr, marca] of Object.entries(marcas)) {
        const cargoId = parseInt(cargoIdStr);
        if (marca.ausente) {
          await cliente.post('/partes-diarios', { fecha, turno, cargoId, horasAfectadas: marca.horas });
          ausentes++;
        } else if (marca.parteId) {
          await cliente.delete(`/partes-diarios/${marca.parteId}`);
        }
      }

      setMensajeExito(
        ausentes > 0
          ? `Parte del ${fecha} (${turno}) guardado: ${ausentes} ausencia(s) registradas`
          : `Parte del ${fecha} (${turno}) guardado: sin novedades`
      );
      await cargarPartesDelTurno();
      await cargarConfirmados();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el parte del día');
    } finally {
      setGuardandoRegistro(false);
    }
  }

  function cancelarRegistro() {
    const iniciales = {};
    partesDelTurno.forEach((p) => {
      iniciales[p.cargoId] = { ausente: true, horas: p.horasAfectadas || 0, parteId: p.id };
    });
    setMarcas(iniciales);
  }

  // ===== ESTADÍSTICAS =====
  const [partesDelCiclo, setPartesDelCiclo] = useState([]);
  const [cargandoStats, setCargandoStats] = useState(false);
  const [modoStats, setModoStats] = useState('division');
  const [filtroMes, setFiltroMes] = useState('todos');
  const [filtroTurnoStats, setFiltroTurnoStats] = useState('todos');
  const [busquedaStats, setBusquedaStats] = useState('');
  const [rankingAbierto, setRankingAbierto] = useState({});
  const [divisionesStatsAbiertas, setDivisionesStatsAbiertas] = useState({});

  const solicitudCicloRef = useRef(0);

  async function cargarPartesDelCiclo() {
    const idSolicitud = ++solicitudCicloRef.current;
    setCargandoStats(true);
    try {
      const respuesta = await cliente.get('/partes-diarios', { params: { cicloLectivo } });
      if (idSolicitud !== solicitudCicloRef.current) return;
      setPartesDelCiclo(respuesta.data);
    } catch (err) {
      if (idSolicitud !== solicitudCicloRef.current) return;
      setPartesDelCiclo([]);
    } finally {
      if (idSolicitud === solicitudCicloRef.current) setCargandoStats(false);
    }
  }

  useEffect(() => {
    if (vista === 'estadisticas') cargarPartesDelCiclo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, cicloLectivo]);

  const meses = [...new Set(confirmados.map((c) => fechaCorta(c.fecha).slice(0, 7)))].sort().reverse();
  const stats = calcularEstadisticas(cargosDisponibles, confirmados, partesDelCiclo, filtroMes, filtroTurnoStats);
  const rankingFiltrado = busquedaStats
    ? stats.ranking.filter((r) => r.nombre.toLowerCase().includes(busquedaStats.toLowerCase()))
    : stats.ranking;

  const divisionesStatsFiltradas = busquedaStats
    ? stats.divisiones
        .map((d) => ({ ...d, personas: d.personas.filter((p) => p.nombre.toLowerCase().includes(busquedaStats.toLowerCase())) }))
        .filter((d) => d.personas.length > 0)
    : stats.divisiones;

  function alternarRanking(personaId) {
    setRankingAbierto((prev) => ({ ...prev, [personaId]: !prev[personaId] }));
  }

  function alternarDivisionStats(label) {
    setDivisionesStatsAbiertas((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  // ===== HISTÓRICO (carga manual, existía antes tal cual) =====
  const [fechaHist, setFechaHist] = useState('');
  const [turnoFiltroHist, setTurnoFiltroHist] = useState('');
  const [partesHist, setPartesHist] = useState([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [guardandoHist, setGuardandoHist] = useState(false);
  const [busquedaPersona, setBusquedaPersona] = useState('');
  const [formularioHist, setFormularioHist] = useState({ tipo: 'docente', turno: 'Mañana', divisionId: '', cargoId: '', horasAfectadas: '' });
  const [licenciaVigente, setLicenciaVigente] = useState(null);

  function cambiarTipoHist(tipo) {
    // Cargo administrativo siempre computa como 1 día, no horas (ver
    // agruparCargosDelDia / formatoAusente).
    setFormularioHist((previo) => ({ ...previo, tipo, divisionId: '', cargoId: '', horasAfectadas: tipo === 'cargo' ? '1' : '' }));
    setBusquedaPersona('');
  }

  const solicitudHistRef = useRef(0);

  async function cargarPartesHist() {
    const idSolicitud = ++solicitudHistRef.current;
    if (!fechaHist) {
      setPartesHist([]);
      return;
    }
    setCargandoHist(true);
    try {
      const respuesta = await cliente.get('/partes-diarios', { params: { fecha: fechaHist, turno: turnoFiltroHist || undefined } });
      if (idSolicitud !== solicitudHistRef.current) return;
      setPartesHist(respuesta.data);
    } catch (err) {
      if (idSolicitud !== solicitudHistRef.current) return;
      setError('No se pudo cargar el parte diario');
    } finally {
      if (idSolicitud === solicitudHistRef.current) setCargandoHist(false);
    }
  }

  useEffect(() => {
    cargarPartesHist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaHist, turnoFiltroHist]);

  useEffect(() => {
    async function verificarLicencia() {
      const cargo = cargosDisponibles.find((c) => c.id === parseInt(formularioHist.cargoId));
      if (!cargo || !fechaHist) {
        setLicenciaVigente(null);
        return;
      }
      try {
        const respuesta = await cliente.get('/partes-diarios/verificar-licencia', { params: { personaId: cargo.personaId, fecha: fechaHist } });
        setLicenciaVigente(respuesta.data.tieneLicencia ? respuesta.data.licencia : null);
      } catch (err) {
        setLicenciaVigente(null);
      }
    }
    verificarLicencia();
  }, [formularioHist.cargoId, fechaHist, cargosDisponibles]);

  // Resuelto a quién ocupaba cada cargo real en fechaHist — si no, un cargo
  // con una cobertura activa aparecería dos veces en el selector (el titular
  // y quien lo cubre), ambos con el mismo nombreCargo.
  const cargosResueltosHist = cargosDisponibles
    .filter((c) => !c.origenLicenciaId)
    .map((c) => cargoActivoEn(c, cargosDisponibles, fechaHist));

  // Grado/división → materia: en Docente, la "materia" es directamente el
  // cargo (nombreCargo) de esa división, así que elegirla ya define también
  // la persona, sin un paso aparte.
  const divisionesConCargos = [...new Map(
    cargosResueltosHist.filter((c) => c.division).map((c) => [c.divisionId, c.division])
  ).values()].sort((a, b) => a.anio - b.anio || a.nombre.localeCompare(b.nombre));

  const materiasDeLaDivision = formularioHist.divisionId
    ? cargosResueltosHist
        .filter((c) => c.divisionId === parseInt(formularioHist.divisionId))
        .sort((a, b) => a.nombreCargo.localeCompare(b.nombreCargo))
    : [];

  const cargosAdminFiltrados = (busquedaPersona
    ? cargosResueltosHist.filter((c) => nombrePersona(c.persona).toLowerCase().includes(busquedaPersona.toLowerCase()))
    : cargosResueltosHist
  ).filter((c) => !c.divisionId);

  async function manejarAltaHist(evento) {
    evento.preventDefault();
    setGuardandoHist(true);
    setError('');
    setMensajeExito('');
    try {
      await cliente.post('/partes-diarios', {
        fecha: fechaHist,
        turno: formularioHist.turno,
        cargoId: parseInt(formularioHist.cargoId),
        horasAfectadas: formularioHist.horasAfectadas || null
      });
      // Estadísticas solo cuenta una ausencia de división si ese fecha+turno+
      // división ya está confirmado (es lo que da el denominador de "horas
      // posibles"). Un alta por Histórico no pasa por "Guardar parte del día"
      // en Registro, así que sin esto quedaba cargada pero invisible en
      // Estadísticas.
      if (formularioHist.tipo === 'docente' && formularioHist.divisionId) {
        await cliente.post('/partes-diarios/confirmar-turno', {
          divisionId: parseInt(formularioHist.divisionId),
          fecha: fechaHist,
          turno: formularioHist.turno,
          cicloLectivo
        });
      }
      await cargarConfirmados();
      setMensajeExito('Registro cargado correctamente');
      setFormularioHist({ tipo: formularioHist.tipo, turno: formularioHist.turno, divisionId: '', cargoId: '', horasAfectadas: '' });
      setBusquedaPersona('');
      cargarPartesHist();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar la falta');
    } finally {
      setGuardandoHist(false);
    }
  }

  async function eliminarParteHist(parteId) {
    if (!window.confirm('¿Confirmás que querés eliminar este registro?')) return;
    try {
      await cliente.delete(`/partes-diarios/${parteId}`);
      cargarPartesHist();
    } catch (err) {
      setError('No se pudo eliminar el registro');
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Partes diarios — Ciclo {cicloLectivo}</h1>
      </div>

      <div className="cargos-tabs">
        <button className={vista === 'registro' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => setVista('registro')}>
          Registro
        </button>
        <button className={vista === 'estadisticas' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => setVista('estadisticas')}>
          Estadísticas
        </button>
        <button className={vista === 'historico' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => setVista('historico')}>
          Histórico
        </button>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {vista === 'registro' ? (
        <>
          <div className="alumnos-formulario">
            <div className="alumnos-formulario-fila">
              <div>
                <label>Fecha</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label>Turno</label>
                <div className="partes-turno-selector">
                  <button
                    type="button"
                    className={turno === 'Mañana' ? 'partes-turno-boton partes-turno-boton-activo' : 'partes-turno-boton'}
                    onClick={() => setTurno('Mañana')}
                  >
                    Mañana
                  </button>
                  <button
                    type="button"
                    className={turno === 'Tarde' ? 'partes-turno-boton partes-turno-boton-activo' : 'partes-turno-boton'}
                    onClick={() => setTurno('Tarde')}
                  >
                    Tarde
                  </button>
                </div>
              </div>
            </div>
            {yaConfirmado && (
              <p className="inasistencias-aviso-ya-cargado">
                ⚠️ Este turno ya fue cargado. Si guardás de nuevo, se actualiza lo existente.
              </p>
            )}
          </div>

          {cargando ? (
            <p>Cargando...</p>
          ) : !fecha ? (
            <p className="alumnos-vacio">Elegí una fecha para ver quién tiene horario ese día.</p>
          ) : divisionesOrdenadas.length === 0 && agrupado.sinDivision.length === 0 ? (
            <p className="alumnos-vacio">
              {diaSemanaDeFecha(fecha) ? 'Nadie tiene horario cargado para ese día y turno.' : 'No hay clases los fines de semana.'}
            </p>
          ) : (
            <>
              {divisionesOrdenadas.map(([divisionId, { division, items }]) => {
                const abierta = !!divisionesAbiertas[divisionId];
                const horasAusentes = horasAusentesDeGrupo(items);
                return (
                  <div key={divisionId} className="partes-tarjeta">
                    <div className="partes-tarjeta-header" onClick={() => alternarDivision(divisionId)}>
                      <span className="partes-tarjeta-nombre">{division.nombre}</span>
                      <span className={`partes-badge ${horasAusentes > 0 ? 'partes-badge-alerta' : ''}`}>
                        {horasAusentes > 0 ? `✗ ${horasAusentes}h` : 'Completo'}
                      </span>
                      <span className={`partes-chevron ${abierta ? 'partes-chevron-abierto' : ''}`}>▼</span>
                    </div>
                    {abierta && (
                      <div className="partes-tarjeta-body">
                        {items.map(({ cargo, horas }) => {
                          const ausente = !!marcas[cargo.id]?.ausente;
                          return (
                            <div key={cargo.id} className="partes-fila-persona">
                              <div className="partes-persona-info">
                                <div className="partes-persona-nombre">{nombrePersona(cargo.persona)}</div>
                                <div className="partes-persona-detalle">
                                  {cargo.nombreCargo} · {horas}h{cargo.origenLicenciaId && ' · suplencia'}
                                </div>
                              </div>
                              <button
                                type="button"
                                className={`partes-toggle ${ausente ? 'partes-toggle-ausente' : 'partes-toggle-presente'}`}
                                onClick={() => alternarAusente(cargo.id, horas)}
                              >
                                {ausente ? '✗' : '✓'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {agrupado.sinDivision.length > 0 && (
                <div className="partes-tarjeta">
                  <div className="partes-tarjeta-header" onClick={() => alternarDivision('sin-division')}>
                    <span className="partes-tarjeta-nombre">{CARGOS_LABEL}</span>
                    <span className={`partes-badge ${horasAusentesDeGrupo(agrupado.sinDivision) > 0 ? 'partes-badge-alerta' : ''}`}>
                      {horasAusentesDeGrupo(agrupado.sinDivision) > 0 ? `✗ ${formatoAusente(horasAusentesDeGrupo(agrupado.sinDivision), CARGOS_LABEL)}` : 'Completo'}
                    </span>
                    <span className={`partes-chevron ${divisionesAbiertas['sin-division'] ? 'partes-chevron-abierto' : ''}`}>▼</span>
                  </div>
                  {divisionesAbiertas['sin-division'] && (
                    <div className="partes-tarjeta-body">
                      {agrupado.sinDivision.map(({ cargo, horas }) => {
                        const ausente = !!marcas[cargo.id]?.ausente;
                        return (
                          <div key={cargo.id} className="partes-fila-persona">
                            <div className="partes-persona-info">
                              <div className="partes-persona-nombre">{nombrePersona(cargo.persona)}</div>
                              <div className="partes-persona-detalle">
                                {cargo.nombreCargo} · 1 día{cargo.origenLicenciaId && ' · suplencia'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className={`partes-toggle ${ausente ? 'partes-toggle-ausente' : 'partes-toggle-presente'}`}
                              onClick={() => alternarAusente(cargo.id, horas)}
                            >
                              {ausente ? '✗' : '✓'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="partes-acciones-guardar">
                <button type="button" onClick={cancelarRegistro} disabled={guardandoRegistro}>Cancelar</button>
                <button type="button" className="partes-boton-guardar" onClick={guardarRegistro} disabled={guardandoRegistro}>
                  {guardandoRegistro ? 'Guardando...' : 'Guardar parte del día'}
                </button>
              </div>
            </>
          )}
        </>
      ) : vista === 'estadisticas' ? (
        <>
          <div className="cargos-subtabs-contenedor">
            <span className="cargos-subtabs-etiqueta">Ver</span>
            <div className="cargos-tabs cargos-tabs-secundarias">
              <button className={modoStats === 'division' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => setModoStats('division')}>Por división</button>
              <button className={modoStats === 'persona' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => setModoStats('persona')}>Por persona</button>
            </div>
          </div>

          <input
            type="text"
            placeholder="Buscar persona..."
            value={busquedaStats}
            onChange={(e) => setBusquedaStats(e.target.value)}
            style={{ marginBottom: '12px', maxWidth: '320px' }}
          />

          <div className="cargos-tabs">
            <button className={filtroTurnoStats === 'todos' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => setFiltroTurnoStats('todos')}>Ambos turnos</button>
            <button className={filtroTurnoStats === 'Mañana' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => setFiltroTurnoStats('Mañana')}>Mañana</button>
            <button className={filtroTurnoStats === 'Tarde' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => setFiltroTurnoStats('Tarde')}>Tarde</button>
          </div>

          <div className="partes-filtro-mes">
            <button className={filtroMes === 'todos' ? 'partes-mes-boton partes-mes-boton-activo' : 'partes-mes-boton'} onClick={() => setFiltroMes('todos')}>Todos</button>
            {meses.map((m) => {
              const [anio, mes] = m.split('-');
              return (
                <button key={m} className={filtroMes === m ? 'partes-mes-boton partes-mes-boton-activo' : 'partes-mes-boton'} onClick={() => setFiltroMes(m)}>
                  {MESES[parseInt(mes) - 1].slice(0, 3)} {anio}
                </button>
              );
            })}
          </div>

          <div className="partes-stats-grid">
            <div className="partes-stat-tile">
              <div className="partes-stat-numero">{stats.totalHorasAusentes}</div>
              <div className="partes-stat-etiqueta">Horas ausentes (docentes)</div>
            </div>
            <div className="partes-stat-tile">
              <div className="partes-stat-numero">{stats.totalDiasAusentesCargos}</div>
              <div className="partes-stat-etiqueta">Días ausentes (cargos)</div>
            </div>
            <div className="partes-stat-tile">
              <div className="partes-stat-numero">{stats.diasRegistrados}</div>
              <div className="partes-stat-etiqueta">Días registrados</div>
            </div>
            <div className="partes-stat-tile">
              <div className="partes-stat-numero">{stats.ranking.length}</div>
              <div className="partes-stat-etiqueta">Personas con faltas</div>
            </div>
            <div className="partes-stat-tile">
              <div className="partes-stat-numero">{stats.promedioHorasDia}</div>
              <div className="partes-stat-etiqueta">Prom. horas/día (docentes)</div>
            </div>
          </div>

          {cargandoStats ? (
            <p>Cargando...</p>
          ) : modoStats === 'persona' ? (
            rankingFiltrado.length === 0 ? (
              <p className="alumnos-vacio">Sin inasistencias registradas para este filtro.</p>
            ) : (
              rankingFiltrado.map((p, indice) => {
                const { personaId, nombre, grupos } = p;
                const abierto = !!rankingAbierto[personaId];
                return (
                  <div key={personaId} className="partes-tarjeta">
                    <div className="partes-tarjeta-header" onClick={() => alternarRanking(personaId)}>
                      <div style={{ flex: 1 }}>
                        <div className="partes-tarjeta-nombre">{nombre}</div>
                        <div className="partes-ranking-subtitulo">{resumenAusenciasPersona(p)}</div>
                      </div>
                      <span className="partes-badge partes-badge-alerta">{indice + 1}°</span>
                      <span className={`partes-chevron ${abierto ? 'partes-chevron-abierto' : ''}`}>▼</span>
                    </div>
                    {abierto && (
                      <div className="partes-tarjeta-body">
                        {Object.entries(grupos).filter(([, g]) => g.ausentes > 0).sort((a, b) => b[1].ausentes - a[1].ausentes).map(([label, g]) => {
                          const pctGrupo = g.posibles > 0 ? Math.round((g.ausentes / g.posibles) * 100) : 0;
                          return (
                            <div key={label} className="partes-fila-detalle">
                              <div className="partes-fila-detalle-encabezado">
                                <span>{label}</span>
                                <span className="partes-fila-detalle-badges">
                                  <span className="partes-badge">{formatoAusente(g.ausentes, label)} / {formatoAusente(g.posibles, label)}</span>
                                  <span className="partes-badge partes-badge-alerta">{pctGrupo}%</span>
                                </span>
                              </div>
                              <div className="partes-fila-detalle-fechas">
                                {g.fechas.map((f, i) => (
                                  <span key={i}>{f.fecha.split('-').reverse().join('/')} · {f.cargoNombre} ({formatoAusente(f.horas, label)}){i < g.fechas.length - 1 ? ', ' : ''}</span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : divisionesStatsFiltradas.length === 0 ? (
            <p className="alumnos-vacio">Sin inasistencias registradas para este filtro.</p>
          ) : (
            divisionesStatsFiltradas.map(({ label, ausentes, posibles, personas }) => {
              const pct = posibles > 0 ? Math.round((ausentes / posibles) * 100) : 0;
              const abierta = !!divisionesStatsAbiertas[label];
              return (
                <div key={label} className="partes-tarjeta">
                  <div className="partes-tarjeta-header" onClick={() => alternarDivisionStats(label)}>
                    <div style={{ flex: 1 }}>
                      <div className="partes-tarjeta-nombre">{label}</div>
                      <div className="partes-ranking-subtitulo">{formatoAusente(ausentes, label)} ausente / {formatoAusente(posibles, label)} posibles · {pct}% de ausentismo</div>
                    </div>
                    <span className="partes-badge partes-badge-alerta">{personas.length} persona{personas.length !== 1 ? 's' : ''}</span>
                    <span className={`partes-chevron ${abierta ? 'partes-chevron-abierto' : ''}`}>▼</span>
                  </div>
                  {abierta && (
                    <div className="partes-tarjeta-body">
                      {personas.map((p) => {
                        const pctPersona = p.posibles > 0 ? Math.round((p.ausentes / p.posibles) * 100) : 0;
                        return (
                          <div key={p.personaId} className="partes-fila-detalle">
                            <div className="partes-fila-detalle-encabezado">
                              <span>{p.nombre}</span>
                              <span className="partes-fila-detalle-badges">
                                <span className="partes-badge">{formatoAusente(p.ausentes, label)} / {formatoAusente(p.posibles, label)}</span>
                                <span className="partes-badge partes-badge-alerta">{pctPersona}%</span>
                              </span>
                            </div>
                            <div className="partes-fila-detalle-fechas">
                              {p.fechas.map((f, i) => (
                                <span key={i}>{f.fecha.split('-').reverse().join('/')} · {f.cargoNombre} ({formatoAusente(f.horas, label)}){i < p.fechas.length - 1 ? ', ' : ''}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      ) : (
        <>
          <div className="alumnos-formulario">
            <div className="alumnos-formulario-fila">
              <div>
                <label>Fecha</label>
                <input type="date" value={fechaHist} onChange={(e) => setFechaHist(e.target.value)} />
              </div>
              <div>
                <label>Turno</label>
                <select value={turnoFiltroHist} onChange={(e) => setTurnoFiltroHist(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="Mañana">Mañana</option>
                  <option value="Tarde">Tarde</option>
                </select>
              </div>
            </div>
          </div>

          {!fechaHist ? (
            <p className="alumnos-vacio">Elegí una fecha para ver o cargar un registro manual.</p>
          ) : (
            <>
              <form onSubmit={manejarAltaHist} className="alumnos-formulario">
                <div className="alumnos-formulario-fila">
                  <div>
                    <label>Turno</label>
                    <select value={formularioHist.turno} onChange={(e) => setFormularioHist({ ...formularioHist, turno: e.target.value })}>
                      <option value="Mañana">Mañana</option>
                      <option value="Tarde">Tarde</option>
                    </select>
                  </div>
                </div>

                <div className="cargos-tabs">
                  <button type="button" className={formularioHist.tipo === 'docente' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => cambiarTipoHist('docente')}>
                    Docente (grado y materia)
                  </button>
                  <button type="button" className={formularioHist.tipo === 'cargo' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'} onClick={() => cambiarTipoHist('cargo')}>
                    Cargo administrativo
                  </button>
                </div>

                {formularioHist.tipo === 'docente' ? (
                  <div className="alumnos-formulario-fila">
                    <div>
                      <label>Grado / división</label>
                      <select
                        value={formularioHist.divisionId}
                        onChange={(e) => setFormularioHist({ ...formularioHist, divisionId: e.target.value, cargoId: '' })}
                        required
                      >
                        <option value="">Seleccioná...</option>
                        {divisionesConCargos.map((division) => (
                          <option key={division.id} value={division.id}>{division.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Materia</label>
                      <select
                        value={formularioHist.cargoId}
                        onChange={(e) => setFormularioHist({ ...formularioHist, cargoId: e.target.value })}
                        disabled={!formularioHist.divisionId}
                        required
                      >
                        <option value="">{formularioHist.divisionId ? 'Seleccioná una materia' : 'Elegí primero un grado'}</option>
                        {materiasDeLaDivision.map((cargo) => (
                          <option key={cargo.id} value={cargo.id}>
                            {cargo.nombreCargo} — {nombrePersona(cargo.persona)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="alumnos-formulario-fila">
                    <div>
                      <label>Persona / cargo</label>
                      <input
                        type="text"
                        placeholder="Buscar por apellido..."
                        value={busquedaPersona}
                        onChange={(e) => setBusquedaPersona(e.target.value)}
                        style={{ marginBottom: '6px' }}
                      />
                      <select value={formularioHist.cargoId} onChange={(e) => setFormularioHist({ ...formularioHist, cargoId: e.target.value })} required>
                        <option value="">Seleccioná un cargo</option>
                        {cargosAdminFiltrados.map((cargo) => (
                          <option key={cargo.id} value={cargo.id}>
                            {nombrePersona(cargo.persona)} — {cargo.nombreCargo}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="alumnos-formulario-fila">
                  <div>
                    <label>{formularioHist.tipo === 'cargo' ? 'Días afectados' : 'Horas afectadas'}</label>
                    <input
                      type="number"
                      min={formularioHist.tipo === 'cargo' ? '1' : '0.5'}
                      step={formularioHist.tipo === 'cargo' ? '1' : '0.5'}
                      value={formularioHist.horasAfectadas}
                      onChange={(e) => setFormularioHist({ ...formularioHist, horasAfectadas: e.target.value })}
                      disabled={formularioHist.tipo === 'cargo'}
                      required
                    />
                  </div>
                </div>

                {licenciaVigente && (
                  <p className="inasistencias-aviso-ya-cargado">
                    ⚠️ Esta persona tiene una licencia vigente ({licenciaVigente.tipoLicencia.nombre}) desde el{' '}
                    {new Date(licenciaVigente.fechaInicio).toLocaleDateString('es-AR')}
                    {licenciaVigente.fechaFin
                      ? ` hasta el ${new Date(licenciaVigente.fechaFin).toLocaleDateString('es-AR')}`
                      : ' sin fecha de fin'}.
                  </p>
                )}

                <button type="submit" disabled={guardandoHist}>
                  {guardandoHist ? 'Guardando...' : 'Cargar registro histórico'}
                </button>
              </form>

              {cargandoHist ? (
                <p>Cargando...</p>
              ) : partesHist.length === 0 ? (
                <p className="alumnos-vacio">No hay partes cargados para este día.</p>
              ) : (
                <table className="alumnos-tabla">
                  <thead>
                    <tr>
                      <th>Turno</th>
                      <th>Persona</th>
                      <th>Cargo</th>
                      <th>División</th>
                      <th>Horas afectadas</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partesHist.map((parte) => (
                      <tr key={parte.id}>
                        <td>{parte.turno}</td>
                        <td>{nombrePersona(parte.cargo.persona)}</td>
                        <td>{parte.cargo.nombreCargo}</td>
                        <td>{parte.cargo.division?.nombre || '-'}</td>
                        <td>{parte.horasAfectadas || '-'}</td>
                        <td>
                          <span className="materiasadeudadas-acciones">
                            <button onClick={() => eliminarParteHist(parte.id)}>Eliminar</button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default PartesDiarios;
