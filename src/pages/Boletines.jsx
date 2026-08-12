import { useState, useEffect, Fragment } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Cargos.css';
import './MateriasAdeudadas.css';
import './Boletines.css';

const ANIOS_POSIBLES = [1, 2, 3, 4, 5, 6];
const ANIO_MINIMO_MODALIDAD = 4;
const CUATRIMESTRES = [1, 2];

function claveFila(alumnoId, materiaId) {
  return `${alumnoId}:${materiaId}`;
}

// El nombre de la división (ej. "4to 1ra") no incluye la modalidad, así que 2
// divisiones del mismo año/sección numérica pero distinta orientación se
// verían igual en un <select> si no se aclara acá.
function etiquetaDivision(division) {
  return division.modalidad ? `${division.nombre} (${division.modalidad.nombre})` : division.nombre;
}

function resumenAnios(anios) {
  if (!anios || anios.length === 0) return <em>Sin años definidos</em>;
  return [...anios].sort((a, b) => a - b).join(', ');
}

function resumenModalidades(modalidadesIds, modalidades) {
  if (!modalidadesIds || modalidadesIds.length === 0) return 'Todas';
  const nombres = modalidadesIds.map((id) => modalidades.find((m) => m.id === id)?.nombre).filter(Boolean);
  return nombres.length > 0 ? nombres.join(', ') : 'Todas';
}

function SelectorAnios({ seleccionados, onCambiar }) {
  function alternar(anio) {
    onCambiar(seleccionados.includes(anio) ? seleccionados.filter((a) => a !== anio) : [...seleccionados, anio].sort((a, b) => a - b));
  }
  return (
    <div className="boletines-selector-anios">
      {ANIOS_POSIBLES.map((anio) => (
        <label key={anio} className="boletines-selector-anios-opcion">
          <input type="checkbox" checked={seleccionados.includes(anio)} onChange={() => alternar(anio)} />
          {anio}
        </label>
      ))}
    </div>
  );
}

function SelectorModalidades({ modalidades, seleccionadas, onCambiar }) {
  function alternar(id) {
    onCambiar(seleccionadas.includes(id) ? seleccionadas.filter((m) => m !== id) : [...seleccionadas, id]);
  }
  if (modalidades.length === 0) {
    return <p className="boletines-aviso-sin-plan">Todavía no hay modalidades cargadas (solapa Modalidades, en Divisiones).</p>;
  }
  return (
    <div className="boletines-selector-anios">
      {modalidades.map((modalidad) => (
        <label key={modalidad.id} className="boletines-selector-anios-opcion">
          <input type="checkbox" checked={seleccionadas.includes(modalidad.id)} onChange={() => alternar(modalidad.id)} />
          {modalidad.nombre}
        </label>
      ))}
    </div>
  );
}

function Boletines() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [vista, setVista] = useState('notas');
  const [modoVista, setModoVista] = useState('division');

  const [alumnos, setAlumnos] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [modalidades, setModalidades] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [planDeMaterias, setPlanDeMaterias] = useState([]);
  const [calificaciones, setCalificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [divisionSeleccionada, setDivisionSeleccionada] = useState('');
  const [materiaSeleccionada, setMateriaSeleccionada] = useState('');
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState('');
  const [busquedaAlumno, setBusquedaAlumno] = useState('');

  const [notas, setNotas] = useState({});
  const [condicionesEditadas, setCondicionesEditadas] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormularioMateria, setMostrarFormularioMateria] = useState(false);
  const [nuevaMateria, setNuevaMateria] = useState({ nombre: '', anios: [], modalidadesIds: [] });
  const [materiaEnEdicionId, setMateriaEnEdicionId] = useState(null);
  const [materiaEnEdicion, setMateriaEnEdicion] = useState(null);

  const [divisionParaPlan, setDivisionParaPlan] = useState('');
  const [pileteaSobreArrastre, setPileteaSobreArrastre] = useState(null);

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaAlumnos, respuestaMaterias, respuestaDivisiones, respuestaModalidades] = await Promise.all([
        cliente.get('/alumnos'),
        cliente.get('/boletines/materias'),
        cliente.get('/divisiones'),
        cliente.get('/divisiones/modalidades')
      ]);
      setAlumnos(respuestaAlumnos.data);
      setMaterias(respuestaMaterias.data);
      setDivisiones(respuestaDivisiones.data);
      setModalidades(respuestaModalidades.data);
    } catch (err) {
      setError('No se pudo cargar la información');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  const alumnoObjSeleccionado = alumnos.find((a) => a.id === parseInt(alumnoSeleccionado));
  const matriculaAlumnoSeleccionado = alumnoObjSeleccionado?.matriculas.find((m) => m.cicloLectivo === cicloLectivo && m.activa);
  const divisionIdDelAlumno = matriculaAlumnoSeleccionado?.divisionId || '';
  const divisionIdParaNotas = modoVista === 'division' ? divisionSeleccionada : divisionIdDelAlumno;

  useEffect(() => {
    async function cargarPlan() {
      if (!divisionIdParaNotas) {
        setPlanDeMaterias([]);
        return;
      }
      try {
        const respuesta = await cliente.get(`/boletines/plan-materias/${divisionIdParaNotas}/${cicloLectivo}`);
        setPlanDeMaterias(respuesta.data);
      } catch (err) {
        setPlanDeMaterias([]);
      }
    }
    cargarPlan();
    setMateriaSeleccionada('');
    // Also cubre el caso de cambiar el ciclo lectivo global mientras había notas sin guardar:
    // evita que reaparezcan prellenadas y terminen guardándose contra el ciclo equivocado.
    setNotas({});
    setCondicionesEditadas({});
  }, [divisionIdParaNotas, cicloLectivo]);

  async function cargarPlanParaAdministrar() {
    if (!divisionParaPlan) {
      setPlanDeMaterias([]);
      return;
    }
    try {
      const respuesta = await cliente.get(`/boletines/plan-materias/${divisionParaPlan}/${cicloLectivo}`);
      setPlanDeMaterias(respuesta.data);
    } catch (err) {
      setPlanDeMaterias([]);
    }
  }

  useEffect(() => {
    if (vista === 'plan') cargarPlanParaAdministrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionParaPlan, cicloLectivo, vista]);

  useEffect(() => {
    async function cargarCalificaciones() {
      if (modoVista === 'division') {
        if (!divisionSeleccionada || !materiaSeleccionada) {
          setCalificaciones([]);
          return;
        }
        try {
          // Sin filtro de división ni de cuatrimestre: se busca por materia
          // nada más, para encontrar también una nota vieja de un alumno que
          // cambió de división este ciclo (si no, se mostraría en blanco acá y
          // el guardado terminaría creando una nota nueva en vez de actualizar
          // la que ya tenía). Los 2 cuatrimestres se traen juntos para poder
          // cargarlos en la misma tabla, uno al lado del otro.
          const respuesta = await cliente.get('/boletines/calificaciones', {
            params: { materiaId: materiaSeleccionada, cicloLectivo }
          });
          setCalificaciones(respuesta.data);
        } catch (err) {
          setCalificaciones([]);
        }
      } else {
        if (!alumnoSeleccionado) {
          setCalificaciones([]);
          return;
        }
        try {
          const respuesta = await cliente.get('/boletines/calificaciones', {
            params: { alumnoId: alumnoSeleccionado, cicloLectivo }
          });
          setCalificaciones(respuesta.data);
        } catch (err) {
          setCalificaciones([]);
        }
      }
    }
    cargarCalificaciones();
  }, [modoVista, divisionSeleccionada, materiaSeleccionada, alumnoSeleccionado, cicloLectivo]);

  const divisionesOrdenadas = [...divisiones]
    .filter((d) => d.activa)
    .sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.nombre.localeCompare(b.nombre)));
  const divisionParaPlanObj = divisiones.find((d) => d.id === parseInt(divisionParaPlan));

  const alumnosDelCurso = alumnos.filter(a =>
    a.matriculas.some(m => m.cicloLectivo === cicloLectivo && m.divisionId === parseInt(divisionSeleccionada) && m.activa)
  );

  const alumnosConMatriculaVigente = alumnos.filter(a => a.matriculas.some(m => m.cicloLectivo === cicloLectivo && m.activa));
  const alumnosOrdenados = [...alumnosConMatriculaVigente].sort((a, b) =>
    `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`)
  );
  const alumnosFiltrados = busquedaAlumno
    ? alumnosOrdenados.filter((a) => `${a.apellido} ${a.nombre}`.toLowerCase().includes(busquedaAlumno.toLowerCase()))
    : alumnosOrdenados;

  const materiasAsignadas = planDeMaterias;
  const materiasDisponibles = divisionParaPlanObj
    ? materias.filter((m) => {
        if (!m.activa) return false;
        if (!m.anios.includes(divisionParaPlanObj.anio)) return false;
        if (planDeMaterias.some((p) => p.materiaId === m.id)) return false;
        if (m.modalidadesIds && m.modalidadesIds.length > 0) {
          return !!divisionParaPlanObj.modalidadId && m.modalidadesIds.includes(divisionParaPlanObj.modalidadId);
        }
        return true;
      })
    : [];

  // Filas a mostrar en la tabla de notas: por división, una por alumno (todas
  // de la misma materia); por alumno, una por materia de su plan (todas del
  // mismo alumno). Mismo shape en los 2 casos para poder compartir la tabla.
  const filasDelPlanActual = modoVista === 'division'
    ? (materiaSeleccionada
        ? alumnosDelCurso.map((a) => ({ alumnoId: a.id, materiaId: parseInt(materiaSeleccionada), etiqueta: `${a.apellido}, ${a.nombre}` }))
        : [])
    : (alumnoSeleccionado
        ? planDeMaterias.map((item) => ({ alumnoId: parseInt(alumnoSeleccionado), materiaId: item.materiaId, etiqueta: item.materia.nombre }))
        : []);

  // Si el alumno cambió de división este mismo ciclo, puede tener calificaciones
  // de materias que ya no están en el plan de su división actual (ej. una materia
  // propia de la división vieja). No se pierden ni se esconden: se agregan como
  // filas aparte, marcadas, para no dejar ninguna nota invisible.
  const materiaIdsEnPlanActual = new Set(filasDelPlanActual.map((f) => f.materiaId));
  const filasDeDivisionAnterior = modoVista === 'alumno' && alumnoSeleccionado
    ? [...new Set(
        calificaciones
          .filter((c) => !materiaIdsEnPlanActual.has(c.materiaId))
          .map((c) => c.materiaId)
      )].map((materiaId) => {
        const calificacion = calificaciones.find((c) => c.materiaId === materiaId);
        return {
          alumnoId: parseInt(alumnoSeleccionado),
          materiaId,
          etiqueta: calificacion.materia.nombre,
          deDivisionAnterior: true,
          nombreDivisionAnterior: calificacion.division.nombre
        };
      })
    : [];

  const filas = [...filasDelPlanActual, ...filasDeDivisionAnterior];

  function obtenerCalificacionExistente(alumnoId, materiaId, cuatrimestre) {
    return calificaciones.find(c => c.alumnoId === alumnoId && c.materiaId === materiaId && c.cuatrimestre === cuatrimestre);
  }

  // Cursa/Recursa es un dato del ciclo completo, no de un cuatrimestre puntual:
  // se guarda igual en las 2 calificaciones (1° y 2° cuatrimestre) de ese
  // alumno+materia, así que se edita una sola vez por fila, no por cuatrimestre.
  function obtenerCondicionExistente(alumnoId, materiaId) {
    return (
      obtenerCalificacionExistente(alumnoId, materiaId, 1)?.condicion ||
      obtenerCalificacionExistente(alumnoId, materiaId, 2)?.condicion ||
      'CURSA'
    );
  }

  function actualizarCondicion(alumnoId, materiaId, valor) {
    setCondicionesEditadas((anterior) => ({ ...anterior, [claveFila(alumnoId, materiaId)]: valor }));
  }

  function valorCondicionActual(alumnoId, materiaId) {
    const clave = claveFila(alumnoId, materiaId);
    return condicionesEditadas[clave] ?? obtenerCondicionExistente(alumnoId, materiaId);
  }

  function actualizarNota(alumnoId, materiaId, cuatrimestre, campo, valor) {
    const clave = claveFila(alumnoId, materiaId);
    setNotas((anterior) => {
      const existente = obtenerCalificacionExistente(alumnoId, materiaId, cuatrimestre);
      const notaActual = anterior[clave]?.[cuatrimestre] || {
        valoracionPreliminar: existente?.valoracionPreliminar || '',
        notaCuatrimestre: existente?.notaCuatrimestre ?? ''
      };
      return { ...anterior, [clave]: { ...anterior[clave], [cuatrimestre]: { ...notaActual, [campo]: valor } } };
    });
  }

  function valorActual(alumnoId, materiaId, cuatrimestre, campo) {
    const clave = claveFila(alumnoId, materiaId);
    const enEdicion = notas[clave]?.[cuatrimestre];
    if (enEdicion && enEdicion[campo] !== undefined) return enEdicion[campo];
    const existente = obtenerCalificacionExistente(alumnoId, materiaId, cuatrimestre);
    if (campo === 'valoracionPreliminar') return existente?.valoracionPreliminar || '';
    if (campo === 'notaCuatrimestre') return existente?.notaCuatrimestre ?? '';
    return '';
  }

  async function guardarNotas() {
    setGuardando(true);
    setError('');
    setMensajeExito('');

    const clavesAfectadas = [...new Set([...Object.keys(condicionesEditadas), ...Object.keys(notas)])];

    if (clavesAfectadas.length === 0) {
      setError('No hiciste ningún cambio para guardar');
      setGuardando(false);
      return;
    }

    // Copia local de las calificaciones, que se va actualizando a medida que se guarda
    // cada fila/cuatrimestre: así, si el guardado falla a mitad de camino, un reintento
    // hace PUT (no vuelve a crear un registro) sobre lo que ya se guardó.
    let calificacionesLocales = calificaciones;
    let notasRestantes = { ...notas };
    let condicionesRestantes = { ...condicionesEditadas };
    let guardados = 0;
    let totalPendiente = 0;
    for (const clave of clavesAfectadas) {
      totalPendiente += condicionesRestantes[clave] !== undefined
        ? CUATRIMESTRES.length
        : Object.keys(notasRestantes[clave] || {}).length;
    }

    try {
      for (const clave of clavesAfectadas) {
        const [alumnoIdStr, materiaIdStr] = clave.split(':');
        const alumnoId = parseInt(alumnoIdStr);
        const materiaId = parseInt(materiaIdStr);
        const condicionEditada = condicionesRestantes[clave];
        // Si cambió cursa/recursa, se guarda en los 2 cuatrimestres (es del año
        // completo); si no, solo en los cuatrimestres donde se tocó algo.
        const cuatrimestresAGuardar = condicionEditada !== undefined
          ? CUATRIMESTRES
          : Object.keys(notasRestantes[clave] || {}).map(Number);

        for (const cuatrimestre of cuatrimestresAGuardar) {
          const existente = calificacionesLocales.find(
            c => c.alumnoId === alumnoId && c.materiaId === materiaId && c.cuatrimestre === cuatrimestre
          );
          const notaCuatri = notasRestantes[clave]?.[cuatrimestre];

          const datos = {
            alumnoId,
            materiaId,
            // Una fila "de división anterior" ya tiene su propia divisionId (la
            // vieja) — el backend igual la ignora en un PUT, pero para un POST
            // nuevo (ej. completar el 2° cuatrimestre que faltaba) hay que
            // mandar la división a la que el alumno pertenece hoy.
            divisionId: existente ? existente.divisionId : parseInt(divisionIdParaNotas),
            cicloLectivo,
            cuatrimestre,
            condicion: condicionEditada || existente?.condicion || 'CURSA',
            valoracionPreliminar: (notaCuatri?.valoracionPreliminar ?? existente?.valoracionPreliminar) || null,
            notaCuatrimestre: (() => {
              const v = notaCuatri?.notaCuatrimestre ?? existente?.notaCuatrimestre ?? '';
              return v === '' ? null : parseFloat(v);
            })()
          };

          const respuesta = existente
            ? await cliente.put(`/boletines/calificaciones/${existente.id}`, datos)
            : await cliente.post('/boletines/calificaciones', datos);

          calificacionesLocales = existente
            ? calificacionesLocales.map((c) => (c.id === existente.id ? respuesta.data : c))
            : [...calificacionesLocales, respuesta.data];
          guardados++;

          if (notaCuatri) {
            const resto = { ...notasRestantes[clave] };
            delete resto[cuatrimestre];
            notasRestantes = { ...notasRestantes, [clave]: resto };
            if (Object.keys(notasRestantes[clave]).length === 0) delete notasRestantes[clave];
          }
          setCalificaciones(calificacionesLocales);
          setNotas({ ...notasRestantes });
        }

        if (condicionEditada !== undefined) {
          const resto = { ...condicionesRestantes };
          delete resto[clave];
          condicionesRestantes = resto;
          setCondicionesEditadas({ ...condicionesRestantes });
        }
      }

      setMensajeExito(`Se guardaron ${guardados} notas`);
    } catch (err) {
      if (guardados > 0) {
        setError(
          `${err.response?.data?.error || 'Falló el guardado de una nota'} — se guardaron ${guardados} de ${totalPendiente}. ` +
          'Las que fallaron siguen editables arriba: podés reintentar sin duplicar las que ya se guardaron.'
        );
      } else {
        setError(err.response?.data?.error || 'No se pudieron guardar las notas');
      }
    } finally {
      setGuardando(false);
    }
  }

  async function manejarAltaMateria(evento) {
    evento.preventDefault();
    try {
      await cliente.post('/boletines/materias', {
        nombre: nuevaMateria.nombre,
        anios: nuevaMateria.anios,
        modalidadesIds: nuevaMateria.modalidadesIds
      });
      setNuevaMateria({ nombre: '', anios: [], modalidadesIds: [] });
      setMostrarFormularioMateria(false);
      setMensajeExito('Materia creada correctamente');
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la materia');
    }
  }

  function abrirEdicionMateria(materia) {
    setMateriaEnEdicionId(materia.id);
    setMateriaEnEdicion({ nombre: materia.nombre, anios: [...materia.anios], modalidadesIds: [...materia.modalidadesIds] });
    setError('');
    setMensajeExito('');
  }

  function cancelarEdicionMateria() {
    setMateriaEnEdicionId(null);
    setMateriaEnEdicion(null);
  }

  async function guardarEdicionMateria(evento) {
    evento.preventDefault();
    try {
      const materiaActual = materias.find((m) => m.id === materiaEnEdicionId);
      await cliente.put(`/boletines/materias/${materiaEnEdicionId}`, {
        nombre: materiaEnEdicion.nombre,
        anios: materiaEnEdicion.anios,
        modalidadesIds: materiaEnEdicion.modalidadesIds,
        activa: materiaActual.activa
      });
      setMensajeExito('Materia actualizada correctamente');
      cancelarEdicionMateria();
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar los cambios');
    }
  }

  async function alternarActivaMateria(materia) {
    const accion = materia.activa ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Confirmás que querés ${accion} la materia "${materia.nombre}"?`)) return;
    try {
      await cliente.put(`/boletines/materias/${materia.id}`, {
        nombre: materia.nombre, anios: materia.anios, modalidadesIds: materia.modalidadesIds, activa: !materia.activa
      });
      cargarDatos();
    } catch (err) {
      setError(`No se pudo ${accion} la materia`);
    }
  }

  async function agregarMateriaAlPlan(materiaId) {
    try {
      await cliente.post('/boletines/plan-materias', {
        divisionId: parseInt(divisionParaPlan),
        cicloLectivo,
        materiaId
      });
      cargarPlanParaAdministrar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo agregar la materia al plan');
    }
  }

  async function quitarMateriaDelPlan(idDelPlan) {
    try {
      await cliente.delete(`/boletines/plan-materias/${idDelPlan}`);
      cargarPlanParaAdministrar();
    } catch (err) {
      setError('No se pudo quitar la materia del plan');
    }
  }

  function manejarDragStartMateria(evento, materiaId, origen) {
    evento.dataTransfer.effectAllowed = 'move';
    evento.dataTransfer.setData('application/json', JSON.stringify({ materiaId, origen }));
  }

  function manejarDropEnPiletea(evento, destino) {
    evento.preventDefault();
    setPileteaSobreArrastre(null);
    const datos = evento.dataTransfer.getData('application/json');
    if (!datos) return;
    const { materiaId, origen } = JSON.parse(datos);
    if (origen === destino) return;
    if (destino === 'asignadas') {
      agregarMateriaAlPlan(materiaId);
    } else {
      const item = planDeMaterias.find((p) => p.materiaId === materiaId);
      if (item) quitarMateriaDelPlan(item.id);
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Boletines — Ciclo {cicloLectivo}</h1>
        {esSecretaria && vista === 'materias' && (
          <button onClick={() => setMostrarFormularioMateria(!mostrarFormularioMateria)}>
            {mostrarFormularioMateria ? 'Cancelar' : '+ Nueva materia'}
          </button>
        )}
      </div>

      <div className="cargos-tabs">
        <button
          className={vista === 'notas' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('notas')}
        >
          Cargar notas
        </button>
        {esSecretaria && (
          <button
            className={vista === 'plan' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
            onClick={() => setVista('plan')}
          >
            Plan de materias por división
          </button>
        )}
        {esSecretaria && (
          <button
            className={vista === 'materias' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
            onClick={() => setVista('materias')}
          >
            Materias
          </button>
        )}
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {vista === 'materias' && esSecretaria ? (
        <>
          {mostrarFormularioMateria && (
            <form onSubmit={manejarAltaMateria} className="alumnos-formulario">
              <div className="alumnos-formulario-fila">
                <div>
                  <label>Nombre completo de la materia (catálogo general)</label>
                  <input
                    type="text"
                    placeholder="Ej: Matemática CS, Construcción de Ciudadanía"
                    value={nuevaMateria.nombre}
                    onChange={(e) => setNuevaMateria({ ...nuevaMateria, nombre: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="alumnos-formulario-fila">
                <div>
                  <label>Años en que se dicta</label>
                  <SelectorAnios seleccionados={nuevaMateria.anios} onCambiar={(anios) => setNuevaMateria({ ...nuevaMateria, anios })} />
                </div>
              </div>
              {nuevaMateria.anios.some((a) => a >= ANIO_MINIMO_MODALIDAD) && (
                <div className="alumnos-formulario-fila">
                  <div>
                    <label>Orientación (opcional — vacío = todas)</label>
                    <SelectorModalidades
                      modalidades={modalidades}
                      seleccionadas={nuevaMateria.modalidadesIds}
                      onCambiar={(modalidadesIds) => setNuevaMateria({ ...nuevaMateria, modalidadesIds })}
                    />
                  </div>
                </div>
              )}
              <button type="submit">Guardar materia</button>
            </form>
          )}

          {cargando ? (
            <p>Cargando...</p>
          ) : materias.length === 0 ? (
            <p className="alumnos-vacio">No hay materias cargadas todavía.</p>
          ) : (
            <table className="alumnos-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Años en que se dicta</th>
                  <th>Orientación</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {[...materias].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((materia) => (
                  materiaEnEdicionId === materia.id ? (
                    <tr key={materia.id}>
                      <td colSpan={5}>
                        <form onSubmit={guardarEdicionMateria} className="alumnos-formulario">
                          <div className="alumnos-formulario-fila">
                            <div>
                              <label>Nombre</label>
                              <input
                                type="text"
                                value={materiaEnEdicion.nombre}
                                onChange={(e) => setMateriaEnEdicion({ ...materiaEnEdicion, nombre: e.target.value })}
                                required
                              />
                            </div>
                          </div>
                          <div className="alumnos-formulario-fila">
                            <div>
                              <label>Años en que se dicta</label>
                              <SelectorAnios
                                seleccionados={materiaEnEdicion.anios}
                                onCambiar={(anios) => setMateriaEnEdicion({ ...materiaEnEdicion, anios })}
                              />
                            </div>
                          </div>
                          {materiaEnEdicion.anios.some((a) => a >= ANIO_MINIMO_MODALIDAD) && (
                            <div className="alumnos-formulario-fila">
                              <div>
                                <label>Orientación (opcional — vacío = todas)</label>
                                <SelectorModalidades
                                  modalidades={modalidades}
                                  seleccionadas={materiaEnEdicion.modalidadesIds}
                                  onCambiar={(modalidadesIds) => setMateriaEnEdicion({ ...materiaEnEdicion, modalidadesIds })}
                                />
                              </div>
                            </div>
                          )}
                          <span className="alumnos-promover-acciones">
                            <button type="submit">Guardar cambios</button>
                            <button type="button" onClick={cancelarEdicionMateria}>Cancelar</button>
                          </span>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={materia.id}>
                      <td>{materia.nombre}</td>
                      <td>{resumenAnios(materia.anios)}</td>
                      <td>{materia.anios.some((a) => a >= ANIO_MINIMO_MODALIDAD) ? resumenModalidades(materia.modalidadesIds, modalidades) : '-'}</td>
                      <td>
                        <span className={`materiasadeudadas-estado ${materia.activa ? 'materiasadeudadas-estado-aprobada' : 'materiasadeudadas-estado-trasladada'}`}>
                          {materia.activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <span className="materiasadeudadas-acciones">
                          <button onClick={() => abrirEdicionMateria(materia)}>Editar</button>
                          <button onClick={() => alternarActivaMateria(materia)}>
                            {materia.activa ? 'Desactivar' : 'Activar'}
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : vista === 'plan' && esSecretaria ? (
        <>
          <div className="alumnos-formulario">
            <div className="alumnos-formulario-fila">
              <div>
                <label>División</label>
                <select value={divisionParaPlan} onChange={(e) => setDivisionParaPlan(e.target.value)}>
                  <option value="">Seleccioná una división</option>
                  {divisionesOrdenadas.map((division) => (
                    <option key={division.id} value={division.id}>{etiquetaDivision(division)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!divisionParaPlan ? (
            <p className="alumnos-vacio">Elegí una división para ver y administrar sus materias.</p>
          ) : (
            <>
              <p className="boletines-plan-encabezado">
                Administrando: <strong>{etiquetaDivision(divisionParaPlanObj)}</strong>
              </p>
              <div className="boletines-piletas">
                <div
                  className={`boletines-pileta ${pileteaSobreArrastre === 'disponibles' ? 'boletines-pileta-sobre-arrastre' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={() => setPileteaSobreArrastre('disponibles')}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPileteaSobreArrastre(null); }}
                  onDrop={(e) => manejarDropEnPiletea(e, 'disponibles')}
                >
                  <p className="boletines-pileta-titulo">Disponibles para {divisionParaPlanObj.anio}° año{divisionParaPlanObj.modalidad ? ` (${divisionParaPlanObj.modalidad.nombre})` : ''}</p>
                  {materiasDisponibles.length === 0 ? (
                    <p className="boletines-vacio-plan">
                      No hay más materias de {divisionParaPlanObj.anio}° año para agregar. Revisá la solapa "Materias" si falta alguna.
                    </p>
                  ) : (
                    materiasDisponibles.map((materia) => (
                      <div
                        key={materia.id}
                        className="boletines-materia-card"
                        draggable
                        onDragStart={(e) => manejarDragStartMateria(e, materia.id, 'disponibles')}
                      >
                        <span>{materia.nombre}</span>
                        <button type="button" onClick={() => agregarMateriaAlPlan(materia.id)} title="Agregar al plan">→</button>
                      </div>
                    ))
                  )}
                </div>

                <div
                  className={`boletines-pileta ${pileteaSobreArrastre === 'asignadas' ? 'boletines-pileta-sobre-arrastre' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={() => setPileteaSobreArrastre('asignadas')}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPileteaSobreArrastre(null); }}
                  onDrop={(e) => manejarDropEnPiletea(e, 'asignadas')}
                >
                  <p className="boletines-pileta-titulo">Asignadas a {etiquetaDivision(divisionParaPlanObj)}</p>
                  {materiasAsignadas.length === 0 ? (
                    <p className="boletines-vacio-plan">Todavía no hay materias asignadas a esta división. Arrastrá desde la izquierda.</p>
                  ) : (
                    materiasAsignadas.map((item) => (
                      <div
                        key={item.id}
                        className="boletines-materia-card"
                        draggable
                        onDragStart={(e) => manejarDragStartMateria(e, item.materiaId, 'asignadas')}
                      >
                        <button type="button" onClick={() => quitarMateriaDelPlan(item.id)} title="Quitar del plan">←</button>
                        <span>{item.materia.nombre}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="cargos-subtabs-contenedor">
            <span className="cargos-subtabs-etiqueta">Ver</span>
            <div className="cargos-tabs cargos-tabs-secundarias">
              <button
                className={modoVista === 'division' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
                onClick={() => { setModoVista('division'); setNotas({}); setCondicionesEditadas({}); }}
              >
                Por división
              </button>
              <button
                className={modoVista === 'alumno' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
                onClick={() => { setModoVista('alumno'); setNotas({}); setCondicionesEditadas({}); }}
              >
                Por alumno
              </button>
            </div>
          </div>

          <div className="alumnos-formulario">
            {modoVista === 'division' ? (
              <div className="alumnos-formulario-fila">
                <div>
                  <label>División</label>
                  <select value={divisionSeleccionada} onChange={(e) => { setDivisionSeleccionada(e.target.value); setNotas({}); setCondicionesEditadas({}); }}>
                    <option value="">Seleccioná una división</option>
                    {divisionesOrdenadas.map((division) => (
                      <option key={division.id} value={division.id}>{etiquetaDivision(division)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Materia</label>
                  <select
                    value={materiaSeleccionada}
                    onChange={(e) => { setMateriaSeleccionada(e.target.value); setNotas({}); setCondicionesEditadas({}); }}
                    disabled={!divisionSeleccionada}
                  >
                    <option value="">
                      {divisionSeleccionada ? 'Seleccioná una materia' : 'Elegí primero una división'}
                    </option>
                    {planDeMaterias.map((item) => (
                      <option key={item.materiaId} value={item.materiaId}>{item.materia.nombre}</option>
                    ))}
                  </select>
                  {divisionSeleccionada && planDeMaterias.length === 0 && (
                    <p className="boletines-aviso-sin-plan">
                      Esta división todavía no tiene materias asignadas
                      {esSecretaria && ' — andá a la solapa "Plan de materias por división" para cargarlas'}.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="alumnos-formulario-fila">
                <div>
                  <label>Alumno</label>
                  <input
                    type="text"
                    placeholder="Buscar por apellido..."
                    value={busquedaAlumno}
                    onChange={(e) => setBusquedaAlumno(e.target.value)}
                    style={{ marginBottom: '6px' }}
                  />
                  <select
                    value={alumnoSeleccionado}
                    onChange={(e) => { setAlumnoSeleccionado(e.target.value); setNotas({}); setCondicionesEditadas({}); }}
                  >
                    <option value="">Seleccioná un alumno</option>
                    {alumnosFiltrados.map((alumno) => (
                      <option key={alumno.id} value={alumno.id}>{alumno.apellido}, {alumno.nombre}</option>
                    ))}
                  </select>
                  {alumnoSeleccionado && planDeMaterias.length === 0 && (
                    <p className="boletines-aviso-sin-plan">
                      La división de este alumno todavía no tiene materias asignadas
                      {esSecretaria && ' — andá a la solapa "Plan de materias por división" para cargarlas'}.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {cargando ? (
            <p>Cargando...</p>
          ) : filas.length === 0 ? (
            <p className="alumnos-vacio">
              {modoVista === 'division'
                ? (!divisionSeleccionada || !materiaSeleccionada ? 'Elegí una división y una materia para cargar las notas.' : 'No hay alumnos cargados en esa división para este ciclo.')
                : (!alumnoSeleccionado ? 'Elegí un alumno para ver todas sus notas.' : 'Este alumno todavía no tiene materias asignadas.')}
            </p>
          ) : (
            <>
              {filasDeDivisionAnterior.length > 0 && (
                <p className="boletines-aviso-sin-plan">
                  Este alumno cambió de división este ciclo — las filas marcadas "división anterior" son notas que ya
                  tenía cargadas ahí y no se perdieron, aunque esa materia no esté en el plan de su división actual.
                </p>
              )}
              <div className="boletines-tabla-scroll">
                <table className="alumnos-tabla boletines-tabla">
                  <thead>
                    <tr>
                      <th rowSpan={2}>{modoVista === 'division' ? 'Alumno' : 'Materia'}</th>
                      <th rowSpan={2}>C/R</th>
                      {CUATRIMESTRES.map((c) => <th key={c} colSpan={2}>{c}° cuatrimestre</th>)}
                    </tr>
                    <tr>
                      {CUATRIMESTRES.map((c) => (
                        <Fragment key={c}>
                          <th>Valoración</th>
                          <th>Nota</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(({ alumnoId, materiaId, etiqueta, deDivisionAnterior, nombreDivisionAnterior }) => (
                      <tr key={claveFila(alumnoId, materiaId)} className={deDivisionAnterior ? 'boletines-fila-division-anterior' : undefined}>
                        <td>
                          {etiqueta}
                          {deDivisionAnterior && (
                            <span className="boletines-etiqueta-division-anterior" title="No está en el plan de la división actual del alumno">
                              de {nombreDivisionAnterior}
                            </span>
                          )}
                        </td>
                        <td>
                          <select
                            value={valorCondicionActual(alumnoId, materiaId)}
                            onChange={(e) => actualizarCondicion(alumnoId, materiaId, e.target.value)}
                          >
                            <option value="CURSA">Cursa</option>
                            <option value="RECURSA">Recursa</option>
                          </select>
                        </td>
                        {CUATRIMESTRES.map((c) => (
                          <Fragment key={c}>
                            <td>
                              <select
                                value={valorActual(alumnoId, materiaId, c, 'valoracionPreliminar')}
                                onChange={(e) => actualizarNota(alumnoId, materiaId, c, 'valoracionPreliminar', e.target.value)}
                              >
                                <option value="">-</option>
                                <option value="TEA">TEA</option>
                                <option value="TEP">TEP</option>
                                <option value="TED">TED</option>
                              </select>
                            </td>
                            <td>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                step="0.5"
                                className="boletines-input-nota"
                                value={valorActual(alumnoId, materiaId, c, 'notaCuatrimestre')}
                                onChange={(e) => actualizarNota(alumnoId, materiaId, c, 'notaCuatrimestre', e.target.value)}
                              />
                            </td>
                          </Fragment>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button className="inasistencias-boton-guardar" onClick={guardarNotas} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar notas'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Boletines;
