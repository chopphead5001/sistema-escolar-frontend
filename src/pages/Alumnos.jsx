import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import cliente from '../api/cliente';
import './Alumnos.css';

function Alumnos() {
  const { usuario } = useAuth();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [alumnos, setAlumnos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoAlumno, setNuevoAlumno] = useState({
    dni: '', nombre: '', apellido: '', division: '', cicloLectivo: 2026
  });
  const [guardando, setGuardando] = useState(false);

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

  async function manejarAlta(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await cliente.post('/alumnos', nuevoAlumno);
      setNuevoAlumno({ dni: '', nombre: '', apellido: '', division: '', cicloLectivo: 2026 });
      setMostrarFormulario(false);
      cargarAlumnos();
    } catch (err) {
      setError('No se pudo dar de alta al alumno. Revisá los datos.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Alumnos</h1>
        {esSecretaria && (
          <button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
            {mostrarFormulario ? 'Cancelar' : '+ Nuevo alumno'}
          </button>
        )}
      </div>

      {error && <div className="alumnos-error">{error}</div>}

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

      {cargando ? (
        <p>Cargando alumnos...</p>
      ) : alumnos.length === 0 ? (
        <p className="alumnos-vacio">No hay alumnos para mostrar.</p>
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
            {alumnos.map((alumno) => {
              const matriculaActual = alumno.matriculas[alumno.matriculas.length - 1];
              return (
                <tr key={alumno.id}>
                  <td>{alumno.dni}</td>
                  <td>{alumno.apellido}, {alumno.nombre}</td>
                  <td>{matriculaActual?.division || '-'}</td>
                  <td>{matriculaActual?.cicloLectivo || '-'}</td>
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