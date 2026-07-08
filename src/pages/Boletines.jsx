import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Boletines.css';

function Boletines() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [alumnos, setAlumnos] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [planDeMaterias, setPlanDeMaterias] = useState([]);
  const [calificaciones, setCalificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [divisionSeleccionada, setDivisionSeleccionada] = useState('');
  const [materiaSeleccionada, setMateriaSeleccionada] = useState('');
  const [cuatrimestre, setCuatrimestre] = useState(1);

  const [notas, setNotas] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormularioMateria, setMostrarFormularioMateria] = useState(false);
  const [nombreMateriaNueva, setNombreMateriaNueva] = useState('');

  const [mostrarPlan, setMostrarPlan] = useState(false);
  const [materiaParaAgregarAlPlan, setMateriaParaAgregarAlPlan] = useState('');

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaAlumnos, respuestaMaterias, respuestaDivisiones] = await Promise.all([
        cliente.get('/alumnos'),
        cliente.get('/boletines/materias'),
        cliente.get('/divisiones')
      ]);
      setAlumnos(respuestaAlumnos.data);
      setMaterias(respuestaMaterias.data);
      setDivisiones(respuestaDivisiones.data);
    } catch (err) {
      setError('No se pudo cargar la información');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    async function cargarPlan() {
      if (!divisionSeleccionada) {
        setPlanDeMaterias([]);
        return;
      }
      try {
        const respuesta = await cliente.get(`/boletines/plan-materias/${divisionSeleccionada}/${cicloLectivo}`);
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
  }, [divisionSeleccionada, cicloLectivo]);

  useEffect(() => {
    async function cargarCalificaciones() {
      if (!divisionSeleccionada || !materiaSeleccionada) {
        setCalificaciones([]);
        return;
      }
      try {
        const respuesta = await cliente.get('/boletines/calificaciones', {
          params: { divisionId: divisionSeleccionada, materiaId: materiaSeleccionada, cicloLectivo, cuatrimestre }
        });
        setCalificaciones(respuesta.data);
      } catch (err) {
        setCalificaciones([]);
      }
    }
    cargarCalificaciones();
  }, [divisionSeleccionada, materiaSeleccionada, cuatrimestre, cicloLectivo]);

  const divisionesOrdenadas = [...divisiones]
    .filter((d) => d.activa)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const nombreDivisionSeleccionada = divisiones.find((d) => d.id === parseInt(divisionSeleccionada))?.nombre || '';

  const alumnosDelCurso = alumnos.filter(a =>
    a.matriculas.some(m => m.cicloLectivo === cicloLectivo && m.divisionId === parseInt(divisionSeleccionada))
  );

  const materiasDisponiblesParaAgregar = materias.filter(
    m => !planDeMaterias.some(p => p.materiaId === m.id)
  );

  function obtenerCalificacionExistente(alumnoId) {
    return calificaciones.find(c => c.alumnoId === alumnoId);
  }

  function actualizarNota(alumnoId, campo, valor) {
    setNotas((anterior) => {
      const existente = obtenerCalificacionExistente(alumnoId);
      const notaActual = anterior[alumnoId] || {
        condicion: existente?.condicion || 'CURSA',
        valoracionPreliminar: existente?.valoracionPreliminar || '',
        notaCuatrimestre: existente?.notaCuatrimestre ?? ''
      };
      return { ...anterior, [alumnoId]: { ...notaActual, [campo]: valor } };
    });
  }

  function valorActual(alumnoId, campo) {
    if (notas[alumnoId] && notas[alumnoId][campo] !== undefined) {
      return notas[alumnoId][campo];
    }
    const existente = obtenerCalificacionExistente(alumnoId);
    if (campo === 'condicion') return existente?.condicion || 'CURSA';
    if (campo === 'valoracionPreliminar') return existente?.valoracionPreliminar || '';
    if (campo === 'notaCuatrimestre') return existente?.notaCuatrimestre ?? '';
    return '';
  }

  async function guardarNotas() {
    setGuardando(true);
    setError('');
    setMensajeExito('');

    const alumnosConCambios = Object.keys(notas);

    if (alumnosConCambios.length === 0) {
      setError('No hiciste ningún cambio para guardar');
      setGuardando(false);
      return;
    }

    // Copia local de las calificaciones, que se va actualizando a medida que se guarda
    // cada alumno: así, si el guardado falla a mitad de camino, un reintento hace PUT
    // (no vuelve a crear un registro) sobre los que ya se guardaron en este mismo intento.
    let calificacionesLocales = calificaciones;
    const notasRestantes = { ...notas };
    let guardados = 0;

    try {
      for (const alumnoId of alumnosConCambios) {
        const nota = notasRestantes[alumnoId];
        const existente = calificacionesLocales.find(c => c.alumnoId === parseInt(alumnoId));

        const datos = {
          alumnoId: parseInt(alumnoId),
          materiaId: parseInt(materiaSeleccionada),
          divisionId: parseInt(divisionSeleccionada),
          cicloLectivo,
          cuatrimestre,
          condicion: nota.condicion || 'CURSA',
          valoracionPreliminar: nota.valoracionPreliminar || null,
          notaCuatrimestre: nota.notaCuatrimestre === '' ? null : parseFloat(nota.notaCuatrimestre)
        };

        const respuesta = existente
          ? await cliente.put(`/boletines/calificaciones/${existente.id}`, datos)
          : await cliente.post('/boletines/calificaciones', datos);

        calificacionesLocales = existente
          ? calificacionesLocales.map((c) => (c.id === existente.id ? respuesta.data : c))
          : [...calificacionesLocales, respuesta.data];
        guardados++;

        delete notasRestantes[alumnoId];
        setCalificaciones(calificacionesLocales);
        setNotas({ ...notasRestantes });
      }

      setMensajeExito(`Se guardaron las notas de ${guardados} alumnos`);
    } catch (err) {
      if (guardados > 0) {
        setError(
          `${err.response?.data?.error || 'Falló el guardado de un alumno'} — se guardaron ${guardados} de ${alumnosConCambios.length}. ` +
          'Los que fallaron siguen editables arriba: podés reintentar sin duplicar los que ya se guardaron.'
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
      await cliente.post('/boletines/materias', { nombre: nombreMateriaNueva });
      setNombreMateriaNueva('');
      setMostrarFormularioMateria(false);
      cargarDatos();
    } catch (err) {
      setError('No se pudo crear la materia');
    }
  }

  async function agregarMateriaAlPlan() {
    if (!materiaParaAgregarAlPlan) return;
    try {
      await cliente.post('/boletines/plan-materias', {
        divisionId: parseInt(divisionSeleccionada),
        cicloLectivo,
        materiaId: parseInt(materiaParaAgregarAlPlan)
      });
      setMateriaParaAgregarAlPlan('');
      const respuesta = await cliente.get(`/boletines/plan-materias/${divisionSeleccionada}/${cicloLectivo}`);
      setPlanDeMaterias(respuesta.data);
    } catch (err) {
      setError('No se pudo agregar la materia al plan');
    }
  }

  async function quitarMateriaDelPlan(idDelPlan) {
    try {
      await cliente.delete(`/boletines/plan-materias/${idDelPlan}`);
      const respuesta = await cliente.get(`/boletines/plan-materias/${divisionSeleccionada}/${cicloLectivo}`);
      setPlanDeMaterias(respuesta.data);
    } catch (err) {
      setError('No se pudo quitar la materia del plan');
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Boletines — Ciclo {cicloLectivo}</h1>
        {esSecretaria && (
          <button onClick={() => setMostrarFormularioMateria(!mostrarFormularioMateria)}>
            {mostrarFormularioMateria ? 'Cancelar' : '+ Nueva materia'}
          </button>
        )}
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {mostrarFormularioMateria && (
        <form onSubmit={manejarAltaMateria} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
              <label>Nombre completo de la materia (catálogo general)</label>
              <input
                type="text"
                placeholder="Ej: Matemática CS, Construcción de Ciudadanía"
                value={nombreMateriaNueva}
                onChange={(e) => setNombreMateriaNueva(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit">Guardar materia</button>
        </form>
      )}

      <div className="alumnos-formulario">
        <div className="alumnos-formulario-fila">
          <div>
            <label>División</label>
            <select value={divisionSeleccionada} onChange={(e) => { setDivisionSeleccionada(e.target.value); setNotas({}); }}>
              <option value="">Seleccioná una división</option>
              {divisionesOrdenadas.map((division) => (
                <option key={division.id} value={division.id}>{division.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Materia</label>
            <select
              value={materiaSeleccionada}
              onChange={(e) => { setMateriaSeleccionada(e.target.value); setNotas({}); }}
              disabled={!divisionSeleccionada}
            >
              <option value="">
                {divisionSeleccionada ? 'Seleccioná una materia' : 'Elegí primero una división'}
              </option>
              {planDeMaterias.map((item) => (
                <option key={item.materiaId} value={item.materiaId}>{item.materia.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Cuatrimestre</label>
            <select value={cuatrimestre} onChange={(e) => { setCuatrimestre(parseInt(e.target.value)); setNotas({}); }}>
              <option value={1}>1° cuatrimestre</option>
              <option value={2}>2° cuatrimestre</option>
            </select>
          </div>
        </div>

        {divisionSeleccionada && esSecretaria && (
          <button
            type="button"
            className="boletines-link-plan"
            onClick={() => setMostrarPlan(!mostrarPlan)}
          >
            {mostrarPlan ? 'Ocultar' : 'Configurar'} plan de materias de {nombreDivisionSeleccionada}
          </button>
        )}

        {mostrarPlan && divisionSeleccionada && (
          <div className="boletines-panel-plan">
            <p className="boletines-panel-plan-titulo">Materias que cursa {nombreDivisionSeleccionada}:</p>
            <ul className="boletines-lista-plan">
              {planDeMaterias.length === 0 && <li className="boletines-vacio-plan">Todavía no hay materias asignadas a esta división.</li>}
              {planDeMaterias.map((item) => (
                <li key={item.id}>
                  {item.materia.nombre}
                  <button onClick={() => quitarMateriaDelPlan(item.id)}>Quitar</button>
                </li>
              ))}
            </ul>
            <div className="boletines-agregar-plan">
              <select value={materiaParaAgregarAlPlan} onChange={(e) => setMateriaParaAgregarAlPlan(e.target.value)}>
                <option value="">Agregar materia al plan...</option>
                {materiasDisponiblesParaAgregar.map((materia) => (
                  <option key={materia.id} value={materia.id}>{materia.nombre}</option>
                ))}
              </select>
              <button onClick={agregarMateriaAlPlan}>Agregar</button>
            </div>
          </div>
        )}
      </div>

      {cargando ? (
        <p>Cargando...</p>
      ) : !divisionSeleccionada || !materiaSeleccionada ? (
        <p className="alumnos-vacio">Elegí una división y una materia para cargar las notas.</p>
      ) : alumnosDelCurso.length === 0 ? (
        <p className="alumnos-vacio">No hay alumnos cargados en esa división para este ciclo.</p>
      ) : (
        <>
          <table className="alumnos-tabla boletines-tabla">
            <thead>
              <tr>
                <th>Alumno</th>
                <th>C/R</th>
                <th>Valoración preliminar</th>
                <th>Nota cuatrimestre</th>
              </tr>
            </thead>
            <tbody>
              {alumnosDelCurso.map((alumno) => (
                <tr key={alumno.id}>
                  <td>{alumno.apellido}, {alumno.nombre}</td>
                  <td>
                    <select
                      value={valorActual(alumno.id, 'condicion')}
                      onChange={(e) => actualizarNota(alumno.id, 'condicion', e.target.value)}
                    >
                      <option value="CURSA">Cursa</option>
                      <option value="RECURSA">Recursa</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={valorActual(alumno.id, 'valoracionPreliminar')}
                      onChange={(e) => actualizarNota(alumno.id, 'valoracionPreliminar', e.target.value)}
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
                      value={valorActual(alumno.id, 'notaCuatrimestre')}
                      onChange={(e) => actualizarNota(alumno.id, 'notaCuatrimestre', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button className="inasistencias-boton-guardar" onClick={guardarNotas} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar notas'}
          </button>
        </>
      )}
    </div>
  );
}

export default Boletines;