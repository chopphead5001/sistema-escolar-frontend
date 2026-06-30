import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';

function Alumnos() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [alumnos, setAlumnos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoAlumno, setNuevoAlumno] = useState({
    dni: '', nombre: '', apellido: '', division: '', cicloLectivo
  });
  const [guardando, setGuardando] = useState(false);

  const [promoviendoId, setPromoviendoId] = useState(null);
  const [divisionDestino, setDivisionDestino] = useState('');

  async function cargarAlumnos() {
    setCargando(true);
    setError('');
    try {
      const respuesta = await cliente.get('/alumnos');
      setAlumnos(respuesta.data);
    } catch (err) {
      setError('No se pudo cargar el listado de alumnos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarAlumnos();
  }, []);

  useEffect(() => {
    setNuevoAlumno((anterior) => ({ ...anterior, cicloLectivo }));
  }, [cicloLectivo]);

  async function manejarAlta(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await cliente.post('/alumnos', nuevoAlumno);
      setNuevoAlumno({ dni: '', nombre: '', apellido: '', division: '', cicloLectivo });
      setMostrarFormulario(false);
      cargarAlumnos();
    } catch (err) {
      setError('No se pudo dar de alta al alumno. Revisá los datos.');
    } finally {
      setGuardando(false);
    }
  }

  const alumnosDelCiclo = alumnos.filter((alumno) =>
    alumno.matriculas.some((m) => m.cicloLectivo === cicloLectivo)
  );

  const alumnosParaPromover = alumnos.filter((alumno) => {
    const yaTieneEsteCiclo = alumno.matriculas.some((m) => m.cicloLectivo === cicloLectivo);
    const teniaCicloAnterior = alumno.matriculas.some((m) => m.cicloLectivo === cicloLectivo - 1);
    return !yaTieneEsteCiclo && teniaCicloAnterior;
  });

  const todasLasDivisionesConocidas = [...new Set(
    alumnos.flatMap((a) => a.matriculas.map((m) => m.division))
  )].sort();

  async function promoverAlumno(alumnoId) {
    if (!divisionDestino) {
      setError('Elegí la división de destino antes de confirmar');
      return;
    }
    try {
      await cliente.post(`/alumnos/${alumnoId}/promover`, {
        cicloLectivo,
        division: divisionDestino
      });
      setMensajeExito('Alumno promovido correctamente');
      setPromoviendoId(null);
      setDivisionDestino('');
      cargarAlumnos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo promover al alumno');
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Alumnos — Ciclo {cicloLectivo}</h1>
        {esSecretaria && (
          <button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
            {mostrarFormulario ? 'Cancelar' : '+ Nuevo alumno'}
          </button>
        )}
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {mostrarFormulario && (
        <form onSubmit={manejarAlta} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
              <label>DNI</label>
              <input
                type="text"
                value={nuevoAlumno.dni}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, dni: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Nombre</label>
              <input
                type="text"
                value={nuevoAlumno.nombre}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, nombre: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Apellido</label>
              <input
                type="text"
                value={nuevoAlumno.apellido}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, apellido: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="alumnos-formulario-fila">
            <div>
              <label>División</label>
              <input
                type="text"
                placeholder="Ej: 4to EDFI"
                value={nuevoAlumno.division}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, division: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Ciclo lectivo</label>
              <input
                type="number"
                value={nuevoAlumno.cicloLectivo}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, cicloLectivo: parseInt(e.target.value) })}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar alumno'}
          </button>
        </form>
      )}

      {esSecretaria && alumnosParaPromover.length > 0 && (
        <div className="alumnos-panel-promover">
          <p className="alumnos-panel-promover-titulo">
            {alumnosParaPromover.length} alumno(s) del ciclo {cicloLectivo - 1} todavía no fueron promovidos a {cicloLectivo}:
          </p>
          <ul className="alumnos-lista-promover">
            {alumnosParaPromover.map((alumno) => {
              const matriculaAnterior = alumno.matriculas.find((m) => m.cicloLectivo === cicloLectivo - 1);
              return (
                <li key={alumno.id}>
                  <span>
                    {alumno.apellido}, {alumno.nombre} — venía de {matriculaAnterior?.division}
                  </span>
                  {promoviendoId === alumno.id ? (
                    <span className="alumnos-promover-acciones">
                      <select value={divisionDestino} onChange={(e) => setDivisionDestino(e.target.value)}>
                        <option value="">Nueva división...</option>
                        {todasLasDivisionesConocidas.map((division) => (
                          <option key={division} value={division}>{division}</option>
                        ))}
                      </select>
                      <button onClick={() => promoverAlumno(alumno.id)}>Confirmar</button>
                      <button onClick={() => { setPromoviendoId(null); setDivisionDestino(''); }}>Cancelar</button>
                    </span>
                  ) : (
                    <button onClick={() => setPromoviendoId(alumno.id)}>Promover</button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {cargando ? (
        <p>Cargando alumnos...</p>
      ) : alumnosDelCiclo.length === 0 ? (
        <p className="alumnos-vacio">No hay alumnos matriculados en el ciclo {cicloLectivo}.</p>
      ) : (
        <table className="alumnos-tabla">
          <thead>
            <tr>
              <th>DNI</th>
              <th>Apellido y nombre</th>
              <th>División</th>
              <th>Ciclo</th>
            </tr>
          </thead>
          <tbody>
            {alumnosDelCiclo.map((alumno) => {
              const matriculaDelCiclo = alumno.matriculas.find((m) => m.cicloLectivo === cicloLectivo);
              return (
                <tr key={alumno.id}>
                  <td>{alumno.dni}</td>
                  <td>{alumno.apellido}, {alumno.nombre}</td>
                  <td>{matriculaDelCiclo?.division || '-'}</td>
                  <td>{matriculaDelCiclo?.cicloLectivo || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Alumnos;