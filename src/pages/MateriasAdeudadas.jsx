import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './MateriasAdeudadas.css';
import { useCicloLectivo } from '../context/CicloLectivoContext';

function MateriasAdeudadas() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();

  if (usuario.rol !== 'SECRETARIA') {
    return (
      <div className="alumnos-pagina">
        <h1>Materias adeudadas</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  const [alumnos, setAlumnos] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [deudas, setDeudas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [divisionFiltro, setDivisionFiltro] = useState('');
  const [planDeMateriasFiltro, setPlanDeMateriasFiltro] = useState([]);
  const [nuevaDeuda, setNuevaDeuda] = useState({
    alumnoId: '', materiaId: '', cicloOrigen: 2025, modalidad: 'INTENSIFICA'
  });
  const [guardando, setGuardando] = useState(false);

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaAlumnos, respuestaMaterias, respuestaDeudas, respuestaDivisiones] = await Promise.all([
        cliente.get('/alumnos'),
        cliente.get('/boletines/materias'),
        cliente.get('/materias-adeudadas', { params: { cicloActual: cicloLectivo } }),
        cliente.get('/divisiones')
      ]);
      setAlumnos(respuestaAlumnos.data);
      setMaterias(respuestaMaterias.data);
      setDeudas(respuestaDeudas.data);
      setDivisiones(respuestaDivisiones.data);
    } catch (err) {
      setError('No se pudo cargar la información');
    } finally {
      setCargando(false);
    }
  }

    useEffect(() => {
        cargarDatos();
    }, [cicloLectivo]);

  useEffect(() => {
    async function cargarPlan() {
      if (!divisionFiltro) {
        setPlanDeMateriasFiltro([]);
        return;
      }
      try {
        const respuesta = await cliente.get(`/boletines/plan-materias/${divisionFiltro}/${cicloLectivo}`);
        setPlanDeMateriasFiltro(respuesta.data);
      } catch (err) {
        setPlanDeMateriasFiltro([]);
      }
    }
    cargarPlan();
    setNuevaDeuda((anterior) => ({ ...anterior, alumnoId: '', materiaId: '' }));
  }, [divisionFiltro]);

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
        modalidad: nuevaDeuda.modalidad
      });
      setMensajeExito('Materia adeudada registrada correctamente');
      setNuevaDeuda({ alumnoId: '', materiaId: '', cicloOrigen: 2025, modalidad: 'INTENSIFICA' });
      setMostrarFormulario(false);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar la materia adeudada');
    } finally {
      setGuardando(false);
    }
  }

  async function actualizarEstado(deudaId, nuevoEstado, notaFinal) {
    try {
      await cliente.put(`/materias-adeudadas/${deudaId}`, {
        estado: nuevoEstado,
        notaFinal: notaFinal !== undefined ? notaFinal : undefined
      });
      cargarDatos();
    } catch (err) {
      setError('No se pudo actualizar el estado');
    }
  }

  async function pasarAlCicloSiguiente(deudaId) {
    const modalidad = window.prompt('¿Cómo continúa el año que viene? Escribí "intensifica" o "recursa":');
    if (!modalidad) return;

    const modalidadNormalizada = modalidad.trim().toUpperCase();
    if (modalidadNormalizada !== 'INTENSIFICA' && modalidadNormalizada !== 'RECURSA') {
      setError('Tenés que escribir exactamente "intensifica" o "recursa"');
      return;
    }

    try {
      await cliente.post(`/materias-adeudadas/${deudaId}/pasar-al-siguiente-ciclo`, {
        modalidad: modalidadNormalizada
      });
      setMensajeExito('La materia se pasó al ciclo siguiente correctamente');
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo pasar la materia al ciclo siguiente');
    }
  }

  const conteoActivasPorAlumno = {};
  deudas.forEach((d) => {
    if (d.estado !== 'APROBADA') {
      conteoActivasPorAlumno[d.alumnoId] = (conteoActivasPorAlumno[d.alumnoId] || 0) + 1;
    }
  });

  const divisionesOrdenadas = [...divisiones].sort((a, b) => a.nombre.localeCompare(b.nombre));

  const alumnosFiltrados = divisionFiltro
    ? alumnos.filter(a => a.matriculas[a.matriculas.length - 1]?.divisionId === parseInt(divisionFiltro))
    : [];

  const etiquetaModalidad = { INTENSIFICA: 'Intensifica', RECURSA: 'Recursa' };
  const etiquetaEstado = { CCA: 'CCA', CSA: 'CSA', APROBADA: 'Aprobada', TRASLADADA: 'Trasladada' };

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Materias adeudadas — Ciclo {cicloLectivo}</h1>
        <button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
          {mostrarFormulario ? 'Cancelar' : '+ Registrar materia adeudada'}
        </button>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {mostrarFormulario && (
        <form onSubmit={manejarAlta} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
              <label>División</label>
              <select
                value={divisionFiltro}
                onChange={(e) => setDivisionFiltro(e.target.value)}
              >
                <option value="">Seleccioná una división</option>
                {divisionesOrdenadas.map((division) => (
                  <option key={division.id} value={division.id}>{division.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Alumno</label>
              <select
                value={nuevaDeuda.alumnoId}
                onChange={(e) => setNuevaDeuda({ ...nuevaDeuda, alumnoId: e.target.value })}
                disabled={!divisionFiltro}
                required
              >
                <option value="">
                  {divisionFiltro ? 'Seleccioná un alumno' : 'Elegí primero una división'}
                </option>
                {alumnosFiltrados.map((alumno) => (
                  <option key={alumno.id} value={alumno.id}>{alumno.apellido}, {alumno.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Materia</label>
              <select
                value={nuevaDeuda.materiaId}
                onChange={(e) => setNuevaDeuda({ ...nuevaDeuda, materiaId: e.target.value })}
                disabled={!divisionFiltro}
                required
              >
                <option value="">
                  {divisionFiltro ? 'Seleccioná una materia' : 'Elegí primero una división'}
                </option>
                {planDeMateriasFiltro.map((item) => (
                  <option key={item.materiaId} value={item.materiaId}>{item.materia.nombre}</option>
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
              </select>
            </div>
          </div>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Registrar'}
          </button>
        </form>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : deudas.length === 0 ? (
        <p className="alumnos-vacio">No hay materias adeudadas registradas para este ciclo.</p>
      ) : (
        <table className="alumnos-tabla">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Materia</th>
              <th>Origen</th>
              <th>Modalidad</th>
              <th>Estado</th>
              <th>Alerta</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {deudas.map((deuda) => {
              const cantidadActivas = conteoActivasPorAlumno[deuda.alumnoId] || 0;
              const requiereEDT = cantidadActivas > 4;
              return (
                <tr key={deuda.id}>
                  <td>{deuda.alumno.apellido}, {deuda.alumno.nombre}</td>
                  <td>{deuda.materia.nombre}</td>
                  <td>{deuda.cicloOrigen}</td>
                  <td>{etiquetaModalidad[deuda.modalidad]}</td>
                  <td>
                    <span className={`materiasadeudadas-estado materiasadeudadas-estado-${deuda.estado.toLowerCase()}`}>
                      {etiquetaEstado[deuda.estado]}
                    </span>
                  </td>
                  <td>
                    {deuda.estado !== 'APROBADA' && requiereEDT && (
                      <span className="materiasadeudadas-alerta-edt" title={`${cantidadActivas} materias activas`}>
                        Requiere EDT
                      </span>
                    )}
                  </td>
                  <td className="materiasadeudadas-acciones">
                    {deuda.estado !== 'APROBADA' && deuda.estado !== 'TRASLADADA' && (
                      <>
                        <button onClick={() => actualizarEstado(deuda.id, deuda.estado === 'CSA' ? 'CCA' : 'CSA')}>
                          Marcar {deuda.estado === 'CSA' ? 'CCA' : 'CSA'}
                        </button>
                        <button
                          className="materiasadeudadas-aprobar"
                          onClick={() => {
                            const nota = window.prompt('Nota final de aprobación (4 o más):');
                            if (nota) actualizarEstado(deuda.id, 'APROBADA', parseFloat(nota));
                          }}
                        >
                          Aprobar
                        </button>
                        <button
                          className="materiasadeudadas-pasar-ciclo"
                          onClick={() => pasarAlCicloSiguiente(deuda.id)}
                        >
                          Pasar a {deuda.cicloActual + 1}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default MateriasAdeudadas;