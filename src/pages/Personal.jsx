import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import cliente from '../api/cliente';
import './Alumnos.css'; // reutilizamos los mismos estilos de tabla y formulario

function Personal() {
  const { usuario } = useAuth();

  if (usuario.rol !== 'SECRETARIA') {
    return (
      <div className="alumnos-pagina">
        <h1>Personal</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  const [personas, setPersonas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevaPersona, setNuevaPersona] = useState({
    dni: '', nombre: '', apellido: '', tipo: 'DOCENTE'
  });
  const [guardando, setGuardando] = useState(false);

  async function cargarPersonal() {
    setCargando(true);
    setError('');
    try {
      const respuesta = await cliente.get('/personal');
      setPersonas(respuesta.data);
    } catch (err) {
      setError('No se pudo cargar el listado de personal');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarPersonal();
  }, []);

  async function manejarAlta(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await cliente.post('/personal', nuevaPersona);
      setNuevaPersona({ dni: '', nombre: '', apellido: '', tipo: 'DOCENTE' });
      setMostrarFormulario(false);
      cargarPersonal();
    } catch (err) {
      setError('No se pudo dar de alta a la persona. Revisá los datos.');
    } finally {
      setGuardando(false);
    }
  }

  const etiquetaTipo = {
    DOCENTE: 'Docente',
    ADMINISTRATIVO: 'Administrativo',
    AUXILIAR: 'Auxiliar'
  };

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Personal</h1>
        <button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
          {mostrarFormulario ? 'Cancelar' : '+ Nueva persona'}
        </button>
      </div>

      {error && <div className="alumnos-error">{error}</div>}

      {mostrarFormulario && (
        <form onSubmit={manejarAlta} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
              <label>DNI</label>
              <input
                type="text"
                value={nuevaPersona.dni}
                onChange={(e) => setNuevaPersona({ ...nuevaPersona, dni: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Nombre</label>
              <input
                type="text"
                value={nuevaPersona.nombre}
                onChange={(e) => setNuevaPersona({ ...nuevaPersona, nombre: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Apellido</label>
              <input
                type="text"
                value={nuevaPersona.apellido}
                onChange={(e) => setNuevaPersona({ ...nuevaPersona, apellido: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="alumnos-formulario-fila">
            <div>
              <label>Tipo</label>
              <select
                value={nuevaPersona.tipo}
                onChange={(e) => setNuevaPersona({ ...nuevaPersona, tipo: e.target.value })}
              >
                <option value="DOCENTE">Docente</option>
                <option value="ADMINISTRATIVO">Administrativo</option>
                <option value="AUXILIAR">Auxiliar</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar persona'}
          </button>
        </form>
      )}

      {cargando ? (
        <p>Cargando personal...</p>
      ) : personas.length === 0 ? (
        <p className="alumnos-vacio">No hay personal para mostrar.</p>
      ) : (
        <table className="alumnos-tabla">
          <thead>
            <tr>
              <th>DNI</th>
              <th>Apellido y nombre</th>
              <th>Tipo</th>
              <th>Cargos vigentes</th>
            </tr>
          </thead>
          <tbody>
            {personas.map((persona) => (
              <tr key={persona.id}>
                <td>{persona.dni}</td>
                <td>{persona.apellido}, {persona.nombre}</td>
                <td>{etiquetaTipo[persona.tipo]}</td>
                <td>{persona.cargos.filter(c => c.vigente).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Personal;