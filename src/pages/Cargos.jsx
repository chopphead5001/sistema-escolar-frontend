import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';

function Cargos() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();

  if (usuario.rol !== 'SECRETARIA') {
    return (
      <div className="alumnos-pagina">
        <h1>Cargos</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  const [personas, setPersonas] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [nombresCargo, setNombresCargo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cargoEnEdicion, setCargoEnEdicion] = useState(null);
  const [formulario, setFormulario] = useState({
    personaId: '', nombreCargo: '', division: '', horasCatedra: ''
  });
  const [guardando, setGuardando] = useState(false);

  const [mostrarFormularioNombreCargo, setMostrarFormularioNombreCargo] = useState(false);
  const [nombreCargoNuevo, setNombreCargoNuevo] = useState('');
  const [busquedaPersona, setBusquedaPersona] = useState('');

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaPersonal, respuestaCargos, respuestaAlumnos, respuestaNombres] = await Promise.all([
        cliente.get('/personal'),
        cliente.get('/cargos', { params: { cicloLectivo } }),
        cliente.get('/alumnos'),
        cliente.get('/cargos/nombres-cargo')
      ]);
      setPersonas(respuestaPersonal.data);
      setCargos(respuestaCargos.data);
      setAlumnos(respuestaAlumnos.data);
      setNombresCargo(respuestaNombres.data);
    } catch (err) {
      setError('No se pudo cargar la información de cargos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, [cicloLectivo]);

  const divisiones = [...new Set(
    alumnos
      .flatMap(a => a.matriculas)
      .filter(m => m.cicloLectivo === cicloLectivo)
      .map(m => m.division)
  )].sort();

  const personasFiltradas = busquedaPersona
  ? personas.filter((p) =>
      `${p.apellido} ${p.nombre}`.toLowerCase().includes(busquedaPersona.toLowerCase())
    )
  : personas;

  function abrirFormularioNuevo() {
    setCargoEnEdicion(null);
    setFormulario({ personaId: '', nombreCargo: '', division: '', horasCatedra: '' });
    setMostrarFormulario(true);
  }

  function abrirFormularioEdicion(cargo) {
    setCargoEnEdicion(cargo.id);
    setFormulario({
      personaId: cargo.personaId,
      nombreCargo: cargo.nombreCargo,
      division: cargo.division || '',
      horasCatedra: cargo.horasCatedra || ''
    });
    setMostrarFormulario(true);
  }

  async function manejarGuardar(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    setMensajeExito('');
    try {
      const datos = {
        nombreCargo: formulario.nombreCargo,
        division: formulario.division || null,
        horasCatedra: formulario.horasCatedra ? parseInt(formulario.horasCatedra) : null
      };

      if (cargoEnEdicion) {
        await cliente.put(`/cargos/${cargoEnEdicion}`, datos);
        setMensajeExito('Cargo actualizado correctamente');
      } else {
        await cliente.post('/cargos', {
          ...datos,
          personaId: parseInt(formulario.personaId),
          cicloLectivo
        });
        setMensajeExito('Cargo registrado correctamente');
      }

      setMostrarFormulario(false);
      setCargoEnEdicion(null);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el cargo');
    } finally {
      setGuardando(false);
    }
  }

  async function finalizarCargo(cargoId) {
    if (!window.confirm('¿Confirmás que esta persona deja este cargo?')) return;
    try {
      await cliente.put(`/cargos/${cargoId}/finalizar`);
      cargarDatos();
    } catch (err) {
      setError('No se pudo finalizar el cargo');
    }
  }

  async function manejarAltaNombreCargo(evento) {
    evento.preventDefault();
    try {
      await cliente.post('/cargos/nombres-cargo', { nombre: nombreCargoNuevo });
      setNombreCargoNuevo('');
      setMostrarFormularioNombreCargo(false);
      cargarDatos();
    } catch (err) {
      setError('No se pudo crear el nombre de cargo');
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Cargos — Ciclo {cicloLectivo}</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setMostrarFormularioNombreCargo(!mostrarFormularioNombreCargo)}>
            {mostrarFormularioNombreCargo ? 'Cancelar' : '+ Nombre de cargo'}
          </button>
          <button onClick={() => mostrarFormulario ? setMostrarFormulario(false) : abrirFormularioNuevo()}>
            {mostrarFormulario ? 'Cancelar' : '+ Nuevo cargo'}
          </button>
        </div>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {mostrarFormularioNombreCargo && (
        <form onSubmit={manejarAltaNombreCargo} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
              <label>Nombre de cargo nuevo (catálogo general)</label>
              <input
                type="text"
                placeholder="Ej: Profesora de Literatura, Secretario, Preceptor"
                value={nombreCargoNuevo}
                onChange={(e) => setNombreCargoNuevo(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit">Guardar nombre de cargo</button>
        </form>
      )}

      {mostrarFormulario && (
        <form onSubmit={manejarGuardar} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
                <label>Persona</label>
                {!cargoEnEdicion && (
                    <input
                    type="text"
                    placeholder="Buscar por apellido..."
                    value={busquedaPersona}
                    onChange={(e) => setBusquedaPersona(e.target.value)}
                    style={{ marginBottom: '6px' }}
                    />
                )}
                <select
                    value={formulario.personaId}
                    onChange={(e) => setFormulario({ ...formulario, personaId: e.target.value })}
                    disabled={!!cargoEnEdicion}
                    required
                >
                    <option value="">Seleccioná una persona</option>
                    {personasFiltradas.map((persona) => (
                    <option key={persona.id} value={persona.id}>{persona.apellido}, {persona.nombre}</option>
                    ))}
                </select>
            </div>
            <div>
              <label>Nombre del cargo / materia</label>
              <select
                value={formulario.nombreCargo}
                onChange={(e) => setFormulario({ ...formulario, nombreCargo: e.target.value })}
                required
              >
                <option value="">Seleccioná un cargo</option>
                {nombresCargo.map((nc) => (
                  <option key={nc.id} value={nc.nombre}>{nc.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="alumnos-formulario-fila">
            <div>
              <label>División (si aplica)</label>
              <select
                value={formulario.division}
                onChange={(e) => setFormulario({ ...formulario, division: e.target.value })}
              >
                <option value="">Sin división (cargo administrativo)</option>
                {divisiones.map((division) => (
                  <option key={division} value={division}>{division}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Módulos (opcional)</label>
              <input
                type="number"
                value={formulario.horasCatedra}
                onChange={(e) => setFormulario({ ...formulario, horasCatedra: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : cargoEnEdicion ? 'Guardar cambios' : 'Registrar cargo'}
          </button>
        </form>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : cargos.length === 0 ? (
        <p className="alumnos-vacio">No hay cargos registrados para el ciclo {cicloLectivo}.</p>
      ) : (
        <table className="alumnos-tabla">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Cargo</th>
              <th>División</th>
              <th>Módulos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargos.map((cargo) => (
              <tr key={cargo.id}>
                <td>{cargo.persona.apellido}, {cargo.persona.nombre}</td>
                <td>{cargo.nombreCargo}</td>
                <td>{cargo.division || '-'}</td>
                <td>{cargo.horasCatedra || '-'}</td>
                <td>{cargo.vigente ? 'Vigente' : 'Finalizado'}</td>
                <td className="materiasadeudadas-acciones">
                  {cargo.vigente && (
                    <>
                      <button onClick={() => abrirFormularioEdicion(cargo)}>Editar</button>
                      <button onClick={() => finalizarCargo(cargo.id)}>Finalizar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Cargos;