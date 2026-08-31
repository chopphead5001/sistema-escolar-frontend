import { useState, useEffect, Fragment } from 'react';
import { useAuth } from '../context/AuthContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Licencias.css';
import './MateriasAdeudadas.css';
import { useCicloLectivo } from '../context/CicloLectivoContext';

const MAX_MATERIAS_TOTAL = 16;

const CAMPOS_NOTAS = {
  INTENSIFICA: [
    { campo: 'notaMarzo', etiqueta: 'Marzo' },
    { campo: 'notaJunio', etiqueta: 'Junio (opt.)' },
    { campo: 'notaJulio', etiqueta: 'Julio' },
    { campo: 'notaNoviembre', etiqueta: 'Noviembre' },
    { campo: 'notaDiciembre', etiqueta: 'Diciembre' }
  ],
  RECURSA: [
    { campo: 'valoracionPreliminar1C', etiqueta: 'Valoración 1° cuatr.', tipo: 'valoracion' },
    { campo: 'notaCuatrimestre1C', etiqueta: 'Nota 1° cuatr.' },
    { campo: 'valoracionPreliminar2C', etiqueta: 'Valoración 2° cuatr.', tipo: 'valoracion' },
    { campo: 'notaCuatrimestre2C', etiqueta: 'Nota 2° cuatr.' }
  ]
};
CAMPOS_NOTAS.PENDIENTE = CAMPOS_NOTAS.RECURSA;

function MateriasAdeudadas() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [alumnos, setAlumnos] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [deudas, setDeudas] = useState([]);
  const [deudasProximoCiclo, setDeudasProximoCiclo] = useState([]);
  const [resumenes, setResumenes] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevaDeuda, setNuevaDeuda] = useState({
    alumnoId: '', materiaId: '', divisionOrigenId: '', cicloOrigen: cicloLectivo - 1, modalidad: 'INTENSIFICA', cargoResponsableId: ''
  });
  const [cargosParaAlta, setCargosParaAlta] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [accionEnCurso, setAccionEnCurso] = useState(null);
  const [modalidadPasarInput, setModalidadPasarInput] = useState('INTENSIFICA');
  const [modalidadCambioInput, setModalidadCambioInput] = useState('INTENSIFICA');
  const [cargosParaAccion, setCargosParaAccion] = useState([]);
  const [cargoResponsableInput, setCargoResponsableInput] = useState('');
  const [busquedaTabla, setBusquedaTabla] = useState('');
  const [estadosFiltro, setEstadosFiltro] = useState([]);
  const [mostrarAprobadas, setMostrarAprobadas] = useState(false);
  const [notasInput, setNotasInput] = useState({});
  const [selectorAbierto, setSelectorAbierto] = useState(null);
  const [seleccionInput, setSeleccionInput] = useState({});

  const [mostrarGenerar, setMostrarGenerar] = useState(false);
  const [divisionGenerarId, setDivisionGenerarId] = useState('');
  const [buscandoPreview, setBuscandoPreview] = useState(false);
  const [candidatosGenerar, setCandidatosGenerar] = useState(null);
  const [seleccionGenerar, setSeleccionGenerar] = useState({});
  const [generando, setGenerando] = useState(false);

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaAlumnos, respuestaMaterias, respuestaDeudas, respuestaDivisiones, respuestaProximoCiclo] = await Promise.all([
        cliente.get('/alumnos'),
        cliente.get('/boletines/materias'),
        cliente.get('/materias-adeudadas', { params: { cicloActual: cicloLectivo } }),
        cliente.get('/divisiones'),
        cliente.get('/materias-adeudadas', { params: { cicloActual: cicloLectivo + 1 } })
      ]);
      setAlumnos(respuestaAlumnos.data);
      setMaterias(respuestaMaterias.data);
      setDeudas(respuestaDeudas.data);
      setDivisiones(respuestaDivisiones.data);
      // Materias que quedaron pendientes este ciclo por el tope de 16 (ver
      // /materias-excluidas): se muestran ya mismo, en la tabla de este año,
      // para no tener que cambiar el selector de ciclo lectivo para verlas.
      setDeudasProximoCiclo(
        respuestaProximoCiclo.data.filter((d) => d.modalidad === 'PENDIENTE' && d.cicloOrigen === cicloLectivo)
      );
    } catch (err) {
      setError('No se pudo cargar la información');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (esSecretaria) cargarDatos();
  }, [cicloLectivo, esSecretaria]);

  // Los cargos disponibles como "profesor a cargo" dependen de la materia
  // elegida (ver GET /cargos-para-materia) — Pendiente no tiene, todavía no
  // arrancó a cursarse.
  useEffect(() => {
    if (!nuevaDeuda.materiaId || nuevaDeuda.modalidad === 'PENDIENTE') {
      setCargosParaAlta([]);
      return;
    }
    cliente.get(`/materias-adeudadas/cargos-para-materia/${nuevaDeuda.materiaId}`)
      .then((r) => setCargosParaAlta(r.data))
      .catch(() => setCargosParaAlta([]));
  }, [nuevaDeuda.materiaId, nuevaDeuda.modalidad]);

  // Resumen de carga (cursa/recursa/intensifica/total) por cada alumno que
  // aparece en la tabla — uno por alumno, no por materia adeudada. Incluye
  // también a los que solo tienen una materia postergada para el año que
  // viene (sin ninguna deuda activa este ciclo), para que igual les aparezca
  // el resumen y el botón de editar materias a cursar.
  useEffect(() => {
    async function cargarResumenes() {
      const idsUnicos = [...new Set([...deudas, ...deudasProximoCiclo].map((d) => d.alumnoId))];
      if (idsUnicos.length === 0) {
        setResumenes({});
        return;
      }
      const resultados = await Promise.all(
        idsUnicos.map((id) =>
          cliente.get(`/materias-adeudadas/resumen/${id}/${cicloLectivo}`)
            .then((r) => [id, r.data])
            .catch(() => [id, null])
        )
      );
      setResumenes(Object.fromEntries(resultados));
    }
    cargarResumenes();
  }, [deudas, deudasProximoCiclo, cicloLectivo]);

  async function manejarAlta(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    setMensajeExito('');
    try {
      await cliente.post('/materias-adeudadas', {
        alumnoId: parseInt(nuevaDeuda.alumnoId),
        materiaId: parseInt(nuevaDeuda.materiaId),
        cicloOrigen: parseInt(nuevaDeuda.cicloOrigen),
        cicloActual: cicloLectivo,
        divisionOrigenId: parseInt(nuevaDeuda.divisionOrigenId),
        modalidad: nuevaDeuda.modalidad,
        cargoResponsableId: nuevaDeuda.cargoResponsableId ? parseInt(nuevaDeuda.cargoResponsableId) : null
      });
      setMensajeExito('Materia adeudada registrada correctamente');
      setNuevaDeuda({ alumnoId: '', materiaId: '', divisionOrigenId: '', cicloOrigen: cicloLectivo - 1, modalidad: 'INTENSIFICA', cargoResponsableId: '' });
      setMostrarFormulario(false);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar la materia adeudada');
    } finally {
      setGuardando(false);
    }
  }

  function alternarGenerar() {
    setError('');
    setMensajeExito('');
    setMostrarGenerar(!mostrarGenerar);
    setDivisionGenerarId('');
    setCandidatosGenerar(null);
    setSeleccionGenerar({});
  }

  async function buscarPreviewGenerar() {
    if (!divisionGenerarId) return;
    setBuscandoPreview(true);
    setError('');
    setCandidatosGenerar(null);
    try {
      const respuesta = await cliente.get(`/materias-adeudadas/generar-preview/${divisionGenerarId}/${cicloLectivo}`);
      setCandidatosGenerar(respuesta.data);
      const seleccionInicial = {};
      respuesta.data.forEach((c) => { seleccionInicial[`${c.alumnoId}-${c.materiaId}`] = true; });
      setSeleccionGenerar(seleccionInicial);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo calcular la vista previa');
    } finally {
      setBuscandoPreview(false);
    }
  }

  function alternarCandidatoGenerar(clave) {
    setSeleccionGenerar((prev) => ({ ...prev, [clave]: !prev[clave] }));
  }

  async function confirmarGenerar() {
    const items = candidatosGenerar
      .filter((c) => seleccionGenerar[`${c.alumnoId}-${c.materiaId}`])
      .map((c) => ({ alumnoId: c.alumnoId, materiaId: c.materiaId, tipo: c.tipo, origenAdeudadaId: c.origenAdeudadaId }));
    if (items.length === 0) return;
    setGenerando(true);
    setError('');
    try {
      const respuesta = await cliente.post(`/materias-adeudadas/generar/${divisionGenerarId}/${cicloLectivo}`, { items });
      setMensajeExito(`Se generaron ${respuesta.data.creadas} materia(s) adeudada(s) para ${cicloLectivo + 1}.`);
      setMostrarGenerar(false);
      setCandidatosGenerar(null);
      setSeleccionGenerar({});
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo confirmar la generación');
    } finally {
      setGenerando(false);
    }
  }

  function iniciarPasarCiclo(deuda) {
    setError('');
    // Si ya era Pendiente, el default es que lo siga siendo — no se puede
    // "empezar" en Pendiente algo que ya es Recursa/Intensifica.
    setModalidadPasarInput(deuda.modalidad === 'PENDIENTE' ? 'PENDIENTE' : 'INTENSIFICA');
    setAccionEnCurso({ tipo: 'pasar', deudaId: deuda.id });
  }

  function iniciarRevertir(deudaId) {
    setError('');
    setAccionEnCurso({ tipo: 'revertir', deudaId });
  }

  function iniciarEliminar(deudaId) {
    setError('');
    setAccionEnCurso({ tipo: 'eliminar', deudaId });
  }

  function iniciarCambioModalidad(deuda) {
    setError('');
    setModalidadCambioInput(deuda.modalidad === 'INTENSIFICA' ? 'RECURSA' : 'INTENSIFICA');
    setAccionEnCurso({ tipo: 'cambiarModalidad', deudaId: deuda.id });
  }

  async function iniciarAsignarProfesor(deuda) {
    setError('');
    setCargoResponsableInput(deuda.cargoResponsableId ?? '');
    setAccionEnCurso({ tipo: 'asignarProfesor', deudaId: deuda.id });
    try {
      const respuesta = await cliente.get(`/materias-adeudadas/cargos-para-materia/${deuda.materiaId}`);
      setCargosParaAccion(respuesta.data);
    } catch {
      setCargosParaAccion([]);
    }
  }

  async function confirmarAsignarProfesor(deudaId) {
    try {
      await cliente.put(`/materias-adeudadas/${deudaId}/cargo-responsable`, {
        cargoResponsableId: cargoResponsableInput ? parseInt(cargoResponsableInput) : null
      });
      setMensajeExito('Profesor a cargo actualizado correctamente');
      setAccionEnCurso(null);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo asignar el profesor');
    }
  }

  function iniciarNotas(deuda) {
    setError('');
    const inicial = {};
    CAMPOS_NOTAS[deuda.modalidad].forEach(({ campo }) => {
      inicial[campo] = deuda[campo] ?? '';
    });
    setNotasInput(inicial);
    setAccionEnCurso({ tipo: 'notas', deudaId: deuda.id });
  }

  function cancelarAccion() {
    setAccionEnCurso(null);
  }

  async function confirmarPasarCiclo(deudaId) {
    try {
      await cliente.post(`/materias-adeudadas/${deudaId}/pasar-al-siguiente-ciclo`, {
        modalidad: modalidadPasarInput
      });
      setMensajeExito('La materia se pasó al ciclo siguiente correctamente');
      setAccionEnCurso(null);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo pasar la materia al ciclo siguiente');
    }
  }

  async function confirmarRevertir(deudaId) {
    try {
      await cliente.post(`/materias-adeudadas/${deudaId}/revertir`);
      setMensajeExito('La materia se revirtió correctamente');
      setAccionEnCurso(null);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo revertir la materia');
    }
  }

  async function confirmarEliminar(deudaId) {
    try {
      await cliente.delete(`/materias-adeudadas/${deudaId}`);
      setMensajeExito('La materia adeudada se eliminó correctamente');
      setAccionEnCurso(null);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar la materia adeudada');
    }
  }

  async function confirmarCambioModalidad(deudaId) {
    try {
      await cliente.put(`/materias-adeudadas/${deudaId}`, { modalidad: modalidadCambioInput });
      setMensajeExito('Modalidad cambiada correctamente. Las notas cargadas se reiniciaron.');
      setAccionEnCurso(null);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la modalidad');
    }
  }

  async function confirmarNotas(deuda) {
    const body = {};
    CAMPOS_NOTAS[deuda.modalidad].forEach(({ campo }) => {
      body[campo] = notasInput[campo] === '' ? null : notasInput[campo];
    });
    try {
      const { data } = await cliente.put(`/materias-adeudadas/${deuda.id}/notas`, body);
      setMensajeExito(
        data.estado === 'APROBADA'
          ? `Se aprobó automáticamente con nota ${data.notaFinal}`
          : 'Notas guardadas correctamente'
      );
      setAccionEnCurso(null);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar las notas');
    }
  }

  async function marcarDecididoPorEDT(deudaId, valor) {
    try {
      await cliente.put(`/materias-adeudadas/${deudaId}`, { decididoPorEDT: valor });
      cargarDatos();
    } catch (err) {
      setError('No se pudo actualizar la decisión de EDT');
    }
  }

  function iniciarSeleccion(alumnoId) {
    setError('');
    const resumen = resumenes[alumnoId];
    if (!resumen) return;
    const inicial = {};
    resumen.materiasPlan.forEach((m) => {
      inicial[m.materiaId] = !resumen.materiasExcluidas.includes(m.materiaId);
    });
    setSeleccionInput(inicial);
    setSelectorAbierto(alumnoId);
  }

  function alternarSeleccion(materiaId) {
    setSeleccionInput((anterior) => ({ ...anterior, [materiaId]: !anterior[materiaId] }));
  }

  async function guardarSeleccion(alumnoId) {
    const resumen = resumenes[alumnoId];
    const materiaIdsExcluidas = resumen.materiasPlan
      .filter((m) => !seleccionInput[m.materiaId])
      .map((m) => m.materiaId);
    try {
      await cliente.put(`/materias-adeudadas/materias-excluidas/${alumnoId}/${cicloLectivo}`, {
        materiaIdsExcluidas
      });
      setMensajeExito('Selección de materias guardada correctamente');
      setSelectorAbierto(null);
      // No alcanza con refrescar solo el resumen: excluir una materia nueva
      // registra automáticamente una fila "pendiente para el año que viene"
      // (ver el backend) que también hay que traer, si no la fila con el
      // chip "→ {año}" no aparece hasta el próximo refresco de la página.
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la selección');
    }
  }

  const conteoActivasPorAlumno = {};
  deudas.forEach((d) => {
    // Una materia ya pasada de ciclo dejó de ser "carga activa" de este año
    // (la decisión de postergarla ya se tomó) — no debería seguir empujando
    // la alerta de EDT, igual que ya no cuenta en el resumen de arriba.
    if (d.estado !== 'APROBADA' && d.estado !== 'TRASLADADA') {
      conteoActivasPorAlumno[d.alumnoId] = (conteoActivasPorAlumno[d.alumnoId] || 0) + 1;
    }
  });

  const alumnosOrdenados = [...alumnos].sort((a, b) =>
    `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`)
  );
  const divisionesOrdenadas = [...divisiones].sort((a, b) => a.nombre.localeCompare(b.nombre));

  const etiquetaModalidad = { INTENSIFICA: 'Intensifica', RECURSA: 'Recursa', PENDIENTE: 'Pendiente (1° vez)' };
  // Etiqueta genérica para los chips de filtro (sin contexto de fila).
  const etiquetaEstadoChip = { CCA: 'CCA', CSA: 'CSA', APROBADA: 'Aprobada', TRASLADADA: 'Pasada de ciclo' };
  // Texto que se muestra en el badge de cada fila — TRASLADADA se arma aparte
  // porque necesita saber a qué ciclo pasó esa deuda puntual.
  function textoEstado(deuda) {
    if (deuda.estado === 'TRASLADADA') return `Pasó a ${deuda.cicloActual + 1}`;
    return etiquetaEstadoChip[deuda.estado];
  }

  function alternarEstadoFiltro(estado) {
    setEstadosFiltro((anterior) =>
      anterior.includes(estado) ? anterior.filter((e) => e !== estado) : [...anterior, estado]
    );
  }

  // Las filas "pendiente para el año que viene" se muestran junto a las de
  // este ciclo, marcadas aparte (_proximoCiclo), para que no haga falta
  // cambiar el selector de ciclo lectivo para verlas.
  const deudasCombinadas = [...deudas, ...deudasProximoCiclo.map((d) => ({ ...d, _proximoCiclo: true }))];

  const busquedaNorm = busquedaTabla.trim().toLowerCase();
  const deudasFiltradas = deudasCombinadas.filter((d) => {
    const coincideBusqueda = !busquedaNorm || `${d.alumno.apellido} ${d.alumno.nombre}`.toLowerCase().includes(busquedaNorm);
    const coincideEstado = estadosFiltro.length === 0 || estadosFiltro.includes(d.estado);
    // Por defecto las aprobadas quedan afuera (para no tapar lo pendiente);
    // se ven si se prende el toggle o si se las pide explícitamente por chip.
    const ocultaPorAprobada = d.estado === 'APROBADA' && !mostrarAprobadas && estadosFiltro.length === 0;
    return coincideBusqueda && coincideEstado && !ocultaPorAprobada;
  });

  // Agrupa por alumno, ordenado alfabéticamente, para mostrar un subtítulo
  // con el resumen de carga (cursa/recursa/intensifica) por alumno.
  const gruposPorAlumno = {};
  deudasFiltradas.forEach((d) => {
    if (!gruposPorAlumno[d.alumnoId]) gruposPorAlumno[d.alumnoId] = { alumno: d.alumno, deudas: [] };
    gruposPorAlumno[d.alumnoId].deudas.push(d);
  });
  const gruposOrdenados = Object.values(gruposPorAlumno).sort((a, b) =>
    `${a.alumno.apellido} ${a.alumno.nombre}`.localeCompare(`${b.alumno.apellido} ${b.alumno.nombre}`)
  );

  if (!esSecretaria) {
    return (
      <div className="alumnos-pagina">
        <h1>Materias adeudadas</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Materias adeudadas — Ciclo {cicloLectivo}</h1>
        <div className="materiasadeudadas-acciones-encabezado">
          <button onClick={alternarGenerar}>
            {mostrarGenerar ? 'Cancelar' : `Generar automáticamente para ${cicloLectivo + 1}`}
          </button>
          <button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
            {mostrarFormulario ? 'Cancelar' : '+ Registrar materia adeudada'}
          </button>
        </div>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {mostrarFormulario && (
        <form onSubmit={manejarAlta} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
              <label>Alumno</label>
              <select
                value={nuevaDeuda.alumnoId}
                onChange={(e) => setNuevaDeuda({ ...nuevaDeuda, alumnoId: e.target.value })}
                required
              >
                <option value="">Seleccioná un alumno</option>
                {alumnosOrdenados.map((alumno) => (
                  <option key={alumno.id} value={alumno.id}>{alumno.apellido}, {alumno.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Materia</label>
              <select
                value={nuevaDeuda.materiaId}
                onChange={(e) => setNuevaDeuda({ ...nuevaDeuda, materiaId: e.target.value })}
                required
              >
                <option value="">Seleccioná una materia</option>
                {materias.map((materia) => (
                  <option key={materia.id} value={materia.id}>{materia.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label>División de origen</label>
              <select
                value={nuevaDeuda.divisionOrigenId}
                onChange={(e) => setNuevaDeuda({ ...nuevaDeuda, divisionOrigenId: e.target.value })}
                required
              >
                <option value="">De dónde viene la materia</option>
                {divisionesOrdenadas.map((division) => (
                  <option key={division.id} value={division.id}>{division.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="alumnos-formulario-fila">
            <div>
              <label>Ciclo en que se generó la deuda</label>
              <input
                type="number"
                value={nuevaDeuda.cicloOrigen}
                onChange={(e) => setNuevaDeuda({ ...nuevaDeuda, cicloOrigen: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Modalidad</label>
              <select
                value={nuevaDeuda.modalidad}
                onChange={(e) => setNuevaDeuda({ ...nuevaDeuda, modalidad: e.target.value })}
              >
                <option value="INTENSIFICA">Intensifica</option>
                <option value="RECURSA">Recursa</option>
                <option value="PENDIENTE">Pendiente (1° vez)</option>
              </select>
            </div>
            {nuevaDeuda.modalidad !== 'PENDIENTE' && (
              <div>
                <label>Profesor a cargo (opcional)</label>
                <select
                  value={nuevaDeuda.cargoResponsableId}
                  onChange={(e) => setNuevaDeuda({ ...nuevaDeuda, cargoResponsableId: e.target.value })}
                  disabled={!nuevaDeuda.materiaId}
                >
                  <option value="">Sin asignar</option>
                  {cargosParaAlta.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.persona.apellido}, {c.persona.nombre}{c.division ? ` — ${c.division.nombre}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Registrar'}
          </button>
        </form>
      )}

      {mostrarGenerar && (
        <div className="alumnos-formulario">
          <p className="materiasadeudadas-confirmar-texto">
            Busca, por división, dos cosas para {cicloLectivo + 1}: materias con promedio de Boletines por
            debajo de 7 en {cicloLectivo} que todavía no tengan una adeudada registrada ("Nueva"), y materias
            que el alumno ya debía (Recursa/Intensifica/Pendiente) y que siguen sin aprobar ("Continúa").
            No se crea nada hasta confirmar la selección.
          </p>
          <div className="alumnos-formulario-fila">
            <div>
              <label>División</label>
              <select value={divisionGenerarId} onChange={(e) => { setDivisionGenerarId(e.target.value); setCandidatosGenerar(null); }}>
                <option value="">Seleccioná una división</option>
                {divisionesOrdenadas.map((division) => (
                  <option key={division.id} value={division.id}>{division.nombre}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={buscarPreviewGenerar} disabled={!divisionGenerarId || buscandoPreview}>
              {buscandoPreview ? 'Buscando...' : 'Buscar candidatos'}
            </button>
          </div>

          {candidatosGenerar !== null && (
            candidatosGenerar.length === 0 ? (
              <p className="alumnos-vacio">No hay nada nuevo ni pendiente de continuar para {cicloLectivo + 1}.</p>
            ) : (
              <>
                <table className="alumnos-tabla">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Alumno</th>
                      <th>Materia</th>
                      <th>Tipo</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidatosGenerar.map((c) => {
                      const clave = `${c.alumnoId}-${c.materiaId}`;
                      return (
                        <tr key={clave}>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!seleccionGenerar[clave]}
                              onChange={() => alternarCandidatoGenerar(clave)}
                            />
                          </td>
                          <td>{c.alumnoNombre}</td>
                          <td>{c.materiaNombre}</td>
                          <td>
                            {c.tipo === 'nueva' ? (
                              <span className="materiasadeudadas-estado materiasadeudadas-estado-csa">Nueva</span>
                            ) : (
                              <span className="materiasadeudadas-estado materiasadeudadas-estado-cca">Continúa</span>
                            )}
                          </td>
                          <td>
                            {c.tipo === 'nueva' ? `Promedio ${cicloLectivo}: ${c.promedio}` : etiquetaModalidad[c.modalidad]}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="materiasadeudadas-confirmar-texto">
                  "Continúa" mantiene la misma modalidad que ya tenía. Para "Nueva": las primeras 4 materias de
                  cada alumno (contando las que ya vaya a tener para {cicloLectivo + 1}) se generan como
                  Intensifica; el resto, como Recursa.
                </p>
                <button
                  type="button"
                  onClick={confirmarGenerar}
                  disabled={generando || Object.values(seleccionGenerar).every((v) => !v)}
                >
                  {generando ? 'Generando...' : `Confirmar generación (${Object.values(seleccionGenerar).filter(Boolean).length})`}
                </button>
              </>
            )
          )}
        </div>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : deudas.length === 0 && deudasProximoCiclo.length === 0 ? (
        <p className="alumnos-vacio">No hay materias adeudadas registradas para este ciclo.</p>
      ) : (
        <>
          <div className="alumnos-formulario licencias-filtros">
            <div className="alumnos-formulario-fila">
              <div>
                <label>Buscar por alumno</label>
                <input
                  type="text"
                  placeholder="Buscar por apellido o nombre..."
                  value={busquedaTabla}
                  onChange={(e) => setBusquedaTabla(e.target.value)}
                />
              </div>
              <div>
                <label>Filtrar por estado</label>
                <div className="licencias-filtro-tipos">
                  {Object.entries(etiquetaEstadoChip).map(([codigo, etiqueta]) => (
                    <button
                      key={codigo}
                      type="button"
                      className={estadosFiltro.includes(codigo) ? 'licencias-chip licencias-chip-activo' : 'licencias-chip'}
                      onClick={() => alternarEstadoFiltro(codigo)}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label>&nbsp;</label>
                <label className="materiasadeudadas-toggle-aprobadas">
                  <input
                    type="checkbox"
                    checked={mostrarAprobadas}
                    onChange={(e) => setMostrarAprobadas(e.target.checked)}
                  />
                  Mostrar aprobadas
                </label>
              </div>
            </div>
          </div>

          {gruposOrdenados.length === 0 ? (
            <p className="alumnos-vacio">Ninguna materia adeudada coincide con la búsqueda.</p>
          ) : (
            gruposOrdenados.map(({ alumno, deudas: deudasAlumno }) => {
              const resumen = resumenes[alumno.id];
              // Distinto de resumen.pendientes (modalidad PENDIENTE ya activa
              // este ciclo): esto es lo que quedó afuera del cupo de este año
              // y todavía no cuenta para nada hasta que arranque su propio
              // ciclo — ver las filas con chip "→ {año}" más abajo.
              const postergadas = deudasProximoCiclo.filter((d) => d.alumnoId === alumno.id).length;
              return (
                <div key={alumno.id} className="materiasadeudadas-grupo-alumno">
                  <div className="materiasadeudadas-subtitulo-alumno">
                    <h2>{alumno.apellido}, {alumno.nombre}</h2>
                    {resumen && (
                      <span className={resumen.requiereSeleccion ? 'materiasadeudadas-resumen materiasadeudadas-resumen-excedido' : 'materiasadeudadas-resumen'}>
                        Cursando {resumen.cursando} + Recursa {resumen.recursa} + Intensifica {resumen.intensifica} + Pendientes {resumen.pendientes} = {resumen.total}/{MAX_MATERIAS_TOTAL}
                      </span>
                    )}
                    {postergadas > 0 && (
                      <span className="materiasadeudadas-resumen-postergadas">
                        +{postergadas} postergada{postergadas > 1 ? 's' : ''} para {cicloLectivo + 1} (no cuenta en el total de arriba)
                      </span>
                    )}
                    {resumen && resumen.materiasPlan.length > 0 && selectorAbierto !== alumno.id && (
                      <button onClick={() => iniciarSeleccion(alumno.id)}>
                        {resumen.requiereSeleccion ? 'Seleccionar materias a cursar' : 'Editar materias a cursar'}
                      </button>
                    )}
                  </div>

                  {selectorAbierto === alumno.id && resumen && (() => {
                    const cupo = MAX_MATERIAS_TOTAL - resumen.recursa - resumen.intensifica - resumen.pendientes;
                    const marcadas = Object.values(seleccionInput).filter(Boolean).length;
                    return (
                      <div className="materiasadeudadas-selector">
                        <p className="materiasadeudadas-confirmar-texto">
                          Cupo para materias del año actual: {marcadas}/{Math.max(cupo, 0)} (recursa + intensifica + pendientes ya ocupan {resumen.recursa + resumen.intensifica + resumen.pendientes} de 16)
                        </p>
                        <div className="materiasadeudadas-selector-lista">
                          {resumen.materiasPlan.map((m) => {
                            const marcada = !!seleccionInput[m.materiaId];
                            return (
                              <label key={m.materiaId} className="materiasadeudadas-selector-item">
                                <input
                                  type="checkbox"
                                  checked={marcada}
                                  disabled={!marcada && marcadas >= cupo}
                                  onChange={() => alternarSeleccion(m.materiaId)}
                                />
                                {m.nombre}
                              </label>
                            );
                          })}
                        </div>
                        <div className="materiasadeudadas-accion-inline">
                          <button className="materiasadeudadas-aprobar" onClick={() => guardarSeleccion(alumno.id)}>
                            Guardar selección
                          </button>
                          <button onClick={() => setSelectorAbierto(null)}>Cancelar</button>
                        </div>
                      </div>
                    );
                  })()}

                  <table className="alumnos-tabla">
                    <thead>
                      <tr>
                        <th>Materia</th>
                        <th>Origen</th>
                        <th>Grado y división</th>
                        <th>Modalidad</th>
                        <th>Profesor a cargo</th>
                        <th>Estado</th>
                        <th>Nota</th>
                        <th>Alerta</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deudasAlumno.map((deuda) => {
                        const cantidadActivas = conteoActivasPorAlumno[deuda.alumnoId] || 0;
                        const requiereEDT = cantidadActivas > 4;
                        return (
                          <Fragment key={deuda.id}>
                            <tr className={deuda._proximoCiclo ? 'materiasadeudadas-fila-proximo-ciclo' : ''}>
                              <td>
                                {deuda.materia.nombre}
                                {deuda._proximoCiclo && (
                                  <span className="materiasadeudadas-chip-proximo" title="No entró en el cupo de este año; queda para el ciclo siguiente">
                                    → {deuda.cicloActual}
                                  </span>
                                )}
                              </td>
                              <td>{deuda.cicloOrigen}</td>
                              <td>{deuda.divisionOrigen?.nombre || '—'}</td>
                              <td>{etiquetaModalidad[deuda.modalidad]}</td>
                              <td>
                                {deuda.modalidad === 'PENDIENTE' ? '—' : deuda.cargoResponsable
                                  ? `${deuda.cargoResponsable.persona.apellido}, ${deuda.cargoResponsable.persona.nombre}${deuda.cargoResponsable.division ? ` — ${deuda.cargoResponsable.division.nombre}` : ''}`
                                  : <em>Sin asignar</em>}
                              </td>
                              <td>
                                <span className={`materiasadeudadas-estado materiasadeudadas-estado-${deuda.estado.toLowerCase()}`}>
                                  {textoEstado(deuda)}
                                </span>
                              </td>
                              <td>{deuda.notaFinal ?? '—'}</td>
                              <td>
                                {deuda._proximoCiclo ? null : deuda.decididoPorEDT ? (
                                  <span className="materiasadeudadas-edt-pendiente">
                                    <span className="materiasadeudadas-edt-decidido" title="La decisión sobre esta materia ya fue tomada por el EDT">
                                      EDT decidido
                                    </span>
                                    <button
                                      className="materiasadeudadas-marcar-edt"
                                      onClick={() => marcarDecididoPorEDT(deuda.id, false)}
                                    >
                                      Desmarcar
                                    </button>
                                  </span>
                                ) : deuda.estado !== 'APROBADA' && requiereEDT ? (
                                  <span className="materiasadeudadas-edt-pendiente">
                                    <span className="materiasadeudadas-alerta-edt" title={`${cantidadActivas} materias activas`}>
                                      Requiere EDT
                                    </span>
                                    <button
                                      className="materiasadeudadas-marcar-edt"
                                      onClick={() => marcarDecididoPorEDT(deuda.id, true)}
                                    >
                                      Marcar decidido
                                    </button>
                                  </span>
                                ) : null}
                              </td>
                              <td>
                                {accionEnCurso?.deudaId === deuda.id ? (
                                  accionEnCurso.tipo === 'pasar' ? (
                                    <span className="materiasadeudadas-accion-inline">
                                      <select value={modalidadPasarInput} onChange={(e) => setModalidadPasarInput(e.target.value)}>
                                        <option value="INTENSIFICA">Intensifica</option>
                                        <option value="RECURSA">Recursa</option>
                                        {deuda.modalidad === 'PENDIENTE' && (
                                          <option value="PENDIENTE">Pendiente (1° vez)</option>
                                        )}
                                      </select>
                                      <button className="materiasadeudadas-pasar-ciclo" onClick={() => confirmarPasarCiclo(deuda.id)}>
                                        Confirmar
                                      </button>
                                      <button onClick={cancelarAccion}>Cancelar</button>
                                    </span>
                                  ) : accionEnCurso.tipo === 'revertir' ? (
                                    <span className="materiasadeudadas-accion-inline">
                                      <span className="materiasadeudadas-confirmar-texto">¿Revertir a estado sin resolver?</span>
                                      <button onClick={() => confirmarRevertir(deuda.id)}>Sí, revertir</button>
                                      <button onClick={cancelarAccion}>Cancelar</button>
                                    </span>
                                  ) : accionEnCurso.tipo === 'eliminar' ? (
                                    <span className="materiasadeudadas-accion-inline">
                                      <span className="materiasadeudadas-confirmar-texto">¿Eliminar? No se puede deshacer.</span>
                                      <button className="materiasadeudadas-eliminar" onClick={() => confirmarEliminar(deuda.id)}>
                                        Sí, eliminar
                                      </button>
                                      <button onClick={cancelarAccion}>Cancelar</button>
                                    </span>
                                  ) : accionEnCurso.tipo === 'cambiarModalidad' ? (
                                    <span className="materiasadeudadas-accion-inline">
                                      <select value={modalidadCambioInput} onChange={(e) => setModalidadCambioInput(e.target.value)}>
                                        <option value="INTENSIFICA">Intensifica</option>
                                        <option value="RECURSA">Recursa</option>
                                        {deuda.modalidad === 'PENDIENTE' && (
                                          <option value="PENDIENTE">Pendiente (1° vez)</option>
                                        )}
                                      </select>
                                      <span className="materiasadeudadas-confirmar-texto">Se van a borrar las notas cargadas</span>
                                      <button onClick={() => confirmarCambioModalidad(deuda.id)}>Confirmar</button>
                                      <button onClick={cancelarAccion}>Cancelar</button>
                                    </span>
                                  ) : accionEnCurso.tipo === 'asignarProfesor' ? (
                                    <span className="materiasadeudadas-accion-inline">
                                      <select value={cargoResponsableInput} onChange={(e) => setCargoResponsableInput(e.target.value)}>
                                        <option value="">Sin asignar</option>
                                        {cargosParaAccion.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.persona.apellido}, {c.persona.nombre}{c.division ? ` — ${c.division.nombre}` : ''}
                                          </option>
                                        ))}
                                      </select>
                                      <button onClick={() => confirmarAsignarProfesor(deuda.id)}>Confirmar</button>
                                      <button onClick={cancelarAccion}>Cancelar</button>
                                    </span>
                                  ) : (
                                    <span className="materiasadeudadas-confirmar-texto">Completando notas abajo…</span>
                                  )
                                ) : deuda.estado === 'APROBADA' ? (
                                  <span className="materiasadeudadas-acciones">
                                    <button onClick={() => iniciarRevertir(deuda.id)}>Revertir</button>
                                  </span>
                                ) : deuda.estado === 'TRASLADADA' ? (
                                  <span className="materiasadeudadas-acciones">
                                    <button onClick={() => iniciarRevertir(deuda.id)}>Revertir</button>
                                  </span>
                                ) : deuda._proximoCiclo ? (
                                  // Todavía no arrancó el ciclo {deuda.cicloActual}: no tiene sentido
                                  // cargarle notas, cambiarle la modalidad ni pasarla de ciclo — lo
                                  // único que se puede hacer ahora es deshacer la postergación.
                                  <span className="materiasadeudadas-acciones">
                                    <button className="materiasadeudadas-eliminar" onClick={() => iniciarEliminar(deuda.id)}>
                                      Eliminar
                                    </button>
                                  </span>
                                ) : (
                                  <span className="materiasadeudadas-acciones">
                                    <button onClick={() => iniciarNotas(deuda)}>Cargar notas</button>
                                    <button onClick={() => iniciarCambioModalidad(deuda)}>Cambiar modalidad</button>
                                    {deuda.modalidad !== 'PENDIENTE' && (
                                      <button onClick={() => iniciarAsignarProfesor(deuda)}>Profesor</button>
                                    )}
                                    <button className="materiasadeudadas-pasar-ciclo" onClick={() => iniciarPasarCiclo(deuda)}>
                                      Pasar a {deuda.cicloActual + 1}
                                    </button>
                                    <button className="materiasadeudadas-eliminar" onClick={() => iniciarEliminar(deuda.id)}>
                                      Eliminar
                                    </button>
                                  </span>
                                )}
                              </td>
                            </tr>
                            {accionEnCurso?.tipo === 'notas' && accionEnCurso.deudaId === deuda.id && (
                              <tr className="materiasadeudadas-fila-notas">
                                <td colSpan={9}>
                                  <div className="materiasadeudadas-notas-form">
                                    {CAMPOS_NOTAS[deuda.modalidad].map(({ campo, etiqueta, tipo }) => (
                                      <label key={campo}>
                                        {etiqueta}
                                        {tipo === 'valoracion' ? (
                                          <select
                                            value={notasInput[campo] ?? ''}
                                            onChange={(e) => setNotasInput({ ...notasInput, [campo]: e.target.value })}
                                          >
                                            <option value="">-</option>
                                            <option value="TEA">TEA</option>
                                            <option value="TEP">TEP</option>
                                            <option value="TED">TED</option>
                                          </select>
                                        ) : (
                                          <input
                                            type="number"
                                            min="1"
                                            max="10"
                                            step="0.5"
                                            value={notasInput[campo] ?? ''}
                                            onChange={(e) => setNotasInput({ ...notasInput, [campo]: e.target.value })}
                                          />
                                        )}
                                      </label>
                                    ))}
                                    <button className="materiasadeudadas-aprobar" onClick={() => confirmarNotas(deuda)}>
                                      Guardar notas
                                    </button>
                                    <button onClick={cancelarAccion}>Cancelar</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

export default MateriasAdeudadas;
