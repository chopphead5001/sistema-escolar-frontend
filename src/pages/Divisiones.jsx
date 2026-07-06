import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './MateriasAdeudadas.css';

function Divisiones() {
  const { usuario } = useAuth();

  if (usuario.rol !== 'SECRETARIA') {
    return (
      <div className="alumnos-pagina">
        <h1>Divisiones</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  const [divisiones, setDivisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [divisionEnEdicion, setDivisionEnEdicion] = useState(null);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const respuesta = await cliente.get('/divisiones');
      setDivisiones(respuesta.data);
    } catch (err) {
      setError('No se pudo cargar la información de divisiones');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  const divisionesOrdenadas = [...divisiones].sort((a, b) => a.nombre.localeCompare(b.nombre));

  function abrirFormularioNuevo() {
    setDivisionEnEdicion(null);
    setNombre('');
    setMostrarFormulario(true);
  }

  function abrirFormularioEdicion(division) {
    setDivisionEnEdicion(division.id);
    setNombre(division.nombre);
    setMostrarFormulario(true);
  }

  async function manejarGuardar(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    setMensajeExito('');
    try {
      if (divisionEnEdicion) {
        await cliente.put(`/divisiones/${divisionEnEdicion}`, { nombre });
        setMensajeExito('División actualizada correctamente');
      } else {
        await cliente.post('/divisiones', { nombre });
        setMensajeExito('División creada correctamente');
      }
      setMostrarFormulario(false);
      setDivisionEnEdicion(null);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la división');
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActiva(division) {
    const accion = division.activa ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Confirmás que querés ${accion} la división "${division.nombre}"?`)) return;
    try {
      await cliente.put(`/divisiones/${division.id}`, { activa: !division.activa });
      cargarDatos();
    } catch (err) {
      setError(`No se pudo ${accion} la división`);
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Divisiones</h1>
        <button onClick={() => mostrarFormulario ? setMostrarFormulario(false) : abrirFormularioNuevo()}>
          {mostrarFormulario ? 'Cancelar' : '+ Nueva división'}
        </button>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {mostrarFormulario && (
        <form onSubmit={manejarGuardar} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
              <label>Nombre</label>
              <input
                type="text"
                placeholder="Ej: 1ro A"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : divisionEnEdicion ? 'Guardar cambios' : 'Crear división'}
          </button>
        </form>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : divisiones.length === 0 ? (
        <p className="alumnos-vacio">No hay divisiones registradas.</p>
      ) : (
        <table className="alumnos-tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {divisionesOrdenadas.map((division) => (
              <tr key={division.id}>
                <td>{division.nombre}</td>
                <td>
                  <span className={`materiasadeudadas-estado ${division.activa ? 'materiasadeudadas-estado-aprobada' : 'materiasadeudadas-estado-trasladada'}`}>
                    {division.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="materiasadeudadas-acciones">
                  <button onClick={() => abrirFormularioEdicion(division)}>Renombrar</button>
                  <button onClick={() => alternarActiva(division)}>
                    {division.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Divisiones;
