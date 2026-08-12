import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Personal.css';

const TIPOS_DISPONIBLES = ['DOCENTE', 'ADMINISTRATIVO', 'AUXILIAR'];

const etiquetaTipo = {
  DOCENTE: 'Docente',
  ADMINISTRATIVO: 'Administrativo',
  AUXILIAR: 'Auxiliar'
};

function alternarTipo(tipos, tipo) {
  return tipos.includes(tipo) ? tipos.filter((t) => t !== tipo) : [...tipos, tipo];
}

function SelectorDeTipos({ tipos, onChange }) {
  return (
    <div className="personal-selector-tipos">
      {TIPOS_DISPONIBLES.map((tipo) => (
        <label key={tipo} className="personal-tipo-opcion">
          <input
            type="checkbox"
            checked={tipos.includes(tipo)}
            onChange={() => onChange(alternarTipo(tipos, tipo))}
          />
          {etiquetaTipo[tipo]}
        </label>
      ))}
    </div>
  );
}

function Personal() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [personas, setPersonas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevaPersona, setNuevaPersona] = useState({
    dni: '', nombre: '', apellido: '', tipos: ['DOCENTE']
  });
  const [guardando, setGuardando] = useState(false);

  const [personaEnEdicionId, setPersonaEnEdicionId] = useState(null);
  const [formularioEdicion, setFormularioEdicion] = useState(null);

  const [deshabilitandoId, setDeshabilitandoId] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState('');

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
    if (esSecretaria) cargarPersonal();
  }, [esSecretaria]);

  async function manejarAlta(evento) {
    evento.preventDefault();
    if (nuevaPersona.tipos.length === 0) {
      setError('Elegí al menos un tipo para la persona');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await cliente.post('/personal', nuevaPersona);
      setNuevaPersona({ dni: '', nombre: '', apellido: '', tipos: ['DOCENTE'] });
      setMostrarFormulario(false);
      cargarPersonal();
    } catch (err) {
      setError('No se pudo dar de alta a la persona. Revisá los datos.');
    } finally {
      setGuardando(false);
    }
  }

  function abrirEdicion(persona) {
    setPersonaEnEdicionId(persona.id);
    setFormularioEdicion({
      dni: persona.dni,
      nombre: persona.nombre,
      apellido: persona.apellido,
      tipos: [...persona.tipos]
    });
    setMensajeExito('');
    setError('');
  }

  function cancelarEdicion() {
    setPersonaEnEdicionId(null);
    setFormularioEdicion(null);
  }

  async function guardarEdicion(evento) {
    evento.preventDefault();
    if (formularioEdicion.tipos.length === 0) {
      setError('Elegí al menos un tipo para la persona');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await cliente.put(`/personal/${personaEnEdicionId}`, formularioEdicion);
      setMensajeExito('Datos actualizados correctamente');
      cancelarEdicion();
      cargarPersonal();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar los cambios');
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarDeshabilitacion(personaId) {
    if (!motivoBaja.trim()) {
      setError('Indicá un motivo (renuncia, jubilación, fin de contrato, etc.)');
      return;
    }
    try {
      await cliente.put(`/personal/${personaId}/baja`, { motivo: motivoBaja });
      setMensajeExito('Persona deshabilitada correctamente');
      setDeshabilitandoId(null);
      setMotivoBaja('');
      cargarPersonal();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo deshabilitar a la persona');
    }
  }

  async function habilitarPersona(persona) {
    if (!window.confirm(`¿Confirmás que ${persona.apellido}, ${persona.nombre} vuelve a trabajar en la escuela?`)) return;
    setError('');
    try {
      await cliente.put(`/personal/${persona.id}/habilitar`);
      setMensajeExito('Persona habilitada correctamente');
      cargarPersonal();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo habilitar a la persona');
    }
  }

  if (!esSecretaria) {
    return (
      <div className="alumnos-pagina">
        <h1>Personal</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Personal — Ciclo {cicloLectivo}</h1>
        <button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
          {mostrarFormulario ? 'Cancelar' : '+ Nueva persona'}
        </button>
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
              <label>Tipo (podés elegir más de uno)</label>
              <SelectorDeTipos
                tipos={nuevaPersona.tipos}
                onChange={(tipos) => setNuevaPersona({ ...nuevaPersona, tipos })}
              />
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
              <th>Estado</th>
              <th>Cargos vigentes en {cicloLectivo}</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {personas.map((persona) => {
              const cargosDelCiclo = persona.cargos.filter(
                (c) => c.vigente && c.cicloLectivo === cicloLectivo
              );

              if (personaEnEdicionId === persona.id) {
                return (
                  <tr key={persona.id}>
                    <td colSpan={6}>
                      <form onSubmit={guardarEdicion} className="alumnos-formulario">
                        <div className="alumnos-formulario-fila">
                          <div>
                            <label>DNI</label>
                            <input
                              type="text"
                              value={formularioEdicion.dni}
                              onChange={(e) => setFormularioEdicion({ ...formularioEdicion, dni: e.target.value })}
                              required
                            />
                          </div>
                          <div>
                            <label>Nombre</label>
                            <input
                              type="text"
                              value={formularioEdicion.nombre}
                              onChange={(e) => setFormularioEdicion({ ...formularioEdicion, nombre: e.target.value })}
                              required
                            />
                          </div>
                          <div>
                            <label>Apellido</label>
                            <input
                              type="text"
                              value={formularioEdicion.apellido}
                              onChange={(e) => setFormularioEdicion({ ...formularioEdicion, apellido: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                        <div className="alumnos-formulario-fila">
                          <div>
                            <label>Tipo (podés elegir más de uno)</label>
                            <SelectorDeTipos
                              tipos={formularioEdicion.tipos}
                              onChange={(tipos) => setFormularioEdicion({ ...formularioEdicion, tipos })}
                            />
                          </div>
                        </div>
                        <span className="alumnos-promover-acciones">
                          <button type="submit" disabled={guardando}>
                            {guardando ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                          <button type="button" onClick={cancelarEdicion}>Cancelar</button>
                        </span>
                      </form>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={persona.id}>
                  <td>{persona.dni}</td>
                  <td>{persona.apellido}, {persona.nombre}</td>
                  <td>{persona.tipos.map((t) => etiquetaTipo[t]).join(', ')}</td>
                  <td>
                    <span className={`personal-estado ${persona.activo ? 'personal-estado-activo' : 'personal-estado-inactivo'}`}>
                      {persona.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    {!persona.activo && persona.movimientos?.[0] && (
                      <div className="personal-estado-detalle">
                        {new Date(persona.movimientos[0].fecha).toLocaleDateString('es-AR')}: {persona.movimientos[0].motivo}
                      </div>
                    )}
                  </td>
                  <td>
                    {cargosDelCiclo.length === 0
                      ? '-'
                      : cargosDelCiclo
                          .map((c) => c.division ? `${c.nombreCargo} (${c.division.nombre})` : c.nombreCargo)
                          .join(', ')}
                  </td>
                  <td>
                    {deshabilitandoId === persona.id ? (
                      <span className="alumnos-promover-acciones">
                        <input
                          type="text"
                          placeholder="Motivo (renuncia, jubilación...)"
                          value={motivoBaja}
                          onChange={(e) => setMotivoBaja(e.target.value)}
                        />
                        <button onClick={() => confirmarDeshabilitacion(persona.id)}>Confirmar</button>
                        <button onClick={() => { setDeshabilitandoId(null); setMotivoBaja(''); }}>Cancelar</button>
                      </span>
                    ) : (
                      <span className="alumnos-promover-acciones">
                        <button onClick={() => abrirEdicion(persona)}>Editar</button>
                        {persona.activo ? (
                          <button onClick={() => { setDeshabilitandoId(persona.id); setMotivoBaja(''); }}>Deshabilitar</button>
                        ) : (
                          <button onClick={() => habilitarPersona(persona)}>Habilitar</button>
                        )}
                      </span>
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

export default Personal;
