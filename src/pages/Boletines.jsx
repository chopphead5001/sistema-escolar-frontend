import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Boletines.css';

function Boletines() {
  const { usuario } = useAuth();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [alumnos, setAlumnos] = useState([]);
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
      const [respuestaAlumnos, respuestaMaterias] = await Promise.all([
        cliente.get('/alumnos'),
        cliente.get('/boletines/materias')
      ]);
      setAlumnos(respuestaAlumnos.data);
      setMaterias(respuestaMaterias.data);
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
        const respuesta = await cliente.get(`/boletines/plan-materias/${divisionSeleccionada}/2026`);
        setPlanDeMaterias(respuesta.data);
      } catch (err) {
        setPlanDeMaterias([]);
      }
    }
    cargarPlan();
    setMateriaSeleccionada('');
  }, [divisionSeleccionada]);

  useEffect(() => {
    async function cargarCalificaciones() {
      if (!divisionSeleccionada || !materiaSeleccionada) {
        setCalificaciones([]);
        return;
      }
      try {
        const respuesta = await cliente.get('/boletines/calificaciones', {
          params: { division: divisionSeleccionada, materiaId: materiaSeleccionada, cicloLectivo: 2026, cuatrimestre }
        });
        setCalificaciones(respuesta.data);
      } catch (err) {
        setCalificaciones([]);
      }
    }
    cargarCalificaciones();
  }, [divisionSeleccionada, materiaSeleccionada, cuatrimestre]);

  const divisiones = [...new Set(
    alumnos.map(a => a.matriculas[a.matriculas.length - 1]?.division).filter(Boolean)
  )].sort();

  const alumnosDelCurso = alumnos.filter(a => {
    const division = a.matriculas[a.matriculas.length - 1]?.division;
    return division === divisionSeleccionada;
  });

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

    try {
      for (const alumnoId of alumnosConCambios) {
        const nota = notas[alumnoId];
        const existente = obtenerCalificacionExistente(parseInt(alumnoId));

        const datos = {
          alumnoId: parseInt(alumnoId),
          materiaId: parseInt(materiaSeleccionada),
          division: divisionSeleccionada,
          cicloLectivo: 2026,
          cuatrimestre,
          condicion: nota.condicion || 'CURSA',
          valoracionPreliminar: nota.valoracionPreliminar || null,
          notaCuatrimestre: nota.notaCuatrimestre === '' ? null : parseFloat(nota.notaCuatrimestre)
        };

        if (existente) {
          await cliente.put(`/boletines/calificaciones/${existente.id}`, datos);
        } else {
          await cliente.post('/boletines/calificaciones', datos);
        }
      }

      setMensajeExito(`Se guardaron las notas de ${alumnosConCambios.length} alumnos`);
      setNotas({});

      const respuesta = await cliente.get('/boletines/calificaciones', {
        params: { division: divisionSeleccionada, materiaId: materiaSeleccionada, cicloLectivo: 2026, cuatrimestre }
      });
      setCalificaciones(respuesta.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar las notas');
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
        division: divisionSeleccionada,
        cicloLectivo: 2026,
        materiaId: parseInt(materiaParaAgregarAlPlan)
      });
      setMateriaParaAgregarAlPlan('');
      const respuesta = await cliente.get(`/boletines/plan-materias/${divisionSeleccionada}/2026`);
      setPlanDeMaterias(respuesta.data);
    } catch (err) {
      setError('No se pudo agregar la materia al plan');
    }
  }

  async function quitarMateriaDelPlan(idDelPlan) {
    try {
      await cliente.delete(`/boletines/plan-materias/${idDelPlan}`);
      const respuesta = await cliente.get(`/boletines/plan-materias/${divisionSeleccionada}/2026`);
      setPlanDeMaterias(respuesta.data);
    } catch (err) {
      setError('No se pudo quitar la materia del plan');
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Boletines</h1>
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
              {divisiones.map((division) => (
                <option key={division} value={division}>{division}</option>
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
            {mostrarPlan ? 'Ocultar' : 'Configurar'} plan de materias de {divisionSeleccionada}
          </button>
        )}

        {mostrarPlan && divisionSeleccionada && (
          <div className="boletines-panel-plan">
            <p className="boletines-panel-plan-titulo">Materias que cursa {divisionSeleccionada}:</p>
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
        <p className="alumnos-vacio">No hay alumnos cargados en esa división.</p>
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