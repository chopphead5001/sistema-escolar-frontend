import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './MateriasAdeudadas.css';

function Licencias() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [personas, setPersonas] = useState([]);
  const [tiposLicencia, setTiposLicencia] = useState([]);
  const [licencias, setLicencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [mostrarFormularioTipo, setMostrarFormularioTipo] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState({
    nombre: '', generaFalta: true, requiereCertificado: false, habilitaSuplente: true
  });

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [licenciaEnEdicion, setLicenciaEnEdicion] = useState(null);
  const [busquedaPersona, setBusquedaPersona] = useState('');
  const [busquedaSuplente, setBusquedaSuplente] = useState('');
  const [formulario, setFormulario] = useState({
    personaId: '', cargoIds: [], tipoLicenciaId: '', fechaInicio: '', fechaFin: '',
    certificadoUrl: '', suplentePersonaId: ''
  });

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaPersonal, respuestaTipos, respuestaLicencias] = await Promise.all([
        cliente.get('/personal'),
        cliente.get('/licencias/tipos'),
        cliente.get('/licencias', { params: { cicloLectivo } })
      ]);
      setPersonas(respuestaPersonal.data);
      setTiposLicencia(respuestaTipos.data);
      setLicencias(respuestaLicencias.data);
    } catch (err) {
      setError('No se pudo cargar la información de licencias');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (esSecretaria) cargarDatos();
  }, [cicloLectivo, esSecretaria]);

  // El personal deshabilitado no puede tomar una licencia nueva ni cubrir como suplente.
  const personasActivas = personas.filter((p) => p.activo);

  const personasFiltradas = busquedaPersona
    ? personasActivas.filter((p) => `${p.apellido} ${p.nombre}`.toLowerCase().includes(busquedaPersona.toLowerCase()))
    : personasActivas;

  const personasParaSuplente = busquedaSuplente
    ? personasActivas.filter((p) => `${p.apellido} ${p.nombre}`.toLowerCase().includes(busquedaSuplente.toLowerCase()))
    : personasActivas;

  const personaSeleccionada = personas.find((p) => p.id === parseInt(formulario.personaId));
  const cargosDeLaPersona = personaSeleccionada
    ? personaSeleccionada.cargos.filter((c) => c.vigente && c.cicloLectivo === cicloLectivo)
    : [];

  const tipoSeleccionado = tiposLicencia.find((t) => t.id === parseInt(formulario.tipoLicenciaId));

  function abrirFormularioNuevo() {
    setLicenciaEnEdicion(null);
    setFormulario({
      personaId: '', cargoIds: [], tipoLicenciaId: '', fechaInicio: '', fechaFin: '',
      certificadoUrl: '', suplentePersonaId: ''
    });
    setBusquedaPersona('');
    setBusquedaSuplente('');
    setMostrarFormulario(true);
  }

  function abrirFormularioEdicion(licencia) {
    setLicenciaEnEdicion(licencia);
    setFormulario({
      personaId: '', cargoIds: [],
      tipoLicenciaId: licencia.tipoLicenciaId,
      fechaInicio: licencia.fechaInicio.slice(0, 10),
      fechaFin: licencia.fechaFin ? licencia.fechaFin.slice(0, 10) : '',
      certificadoUrl: licencia.certificadoUrl || '',
      suplentePersonaId: licencia.suplentePersonaId || ''
    });
    setBusquedaSuplente('');
    setMostrarFormulario(true);
  }

  function cerrarFormulario() {
    setMostrarFormulario(false);
    setLicenciaEnEdicion(null);
  }

  function alternarCargo(cargoId) {
    setFormulario((anterior) => {
      const yaSeleccionado = anterior.cargoIds.includes(cargoId);
      return {
        ...anterior,
        cargoIds: yaSeleccionado
          ? anterior.cargoIds.filter((id) => id !== cargoId)
          : [...anterior.cargoIds, cargoId]
      };
    });
  }

  async function manejarAltaTipo(evento) {
    evento.preventDefault();
    try {
      await cliente.post('/licencias/tipos', nuevoTipo);
      setNuevoTipo({ nombre: '', generaFalta: true, requiereCertificado: false, habilitaSuplente: true });
      setMostrarFormularioTipo(false);
      cargarDatos();
    } catch (err) {
      setError('No se pudo crear el tipo de licencia');
    }
  }

  async function manejarAlta(evento) {
    evento.preventDefault();
    setError('');
    setMensajeExito('');

    if (licenciaEnEdicion) {
      setGuardando(true);
      try {
        await cliente.put(`/licencias/${licenciaEnEdicion.id}`, {
          tipoLicenciaId: parseInt(formulario.tipoLicenciaId),
          fechaInicio: formulario.fechaInicio,
          fechaFin: formulario.fechaFin || null,
          certificadoUrl: tipoSeleccionado?.requiereCertificado ? formulario.certificadoUrl : null,
          suplentePersonaId: tipoSeleccionado?.habilitaSuplente && formulario.suplentePersonaId
            ? parseInt(formulario.suplentePersonaId)
            : null
        });
        setMensajeExito('Licencia actualizada correctamente');
        cerrarFormulario();
        cargarDatos();
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudo actualizar la licencia');
      } finally {
        setGuardando(false);
      }
      return;
    }

    if (formulario.cargoIds.length === 0) {
      setError('Seleccioná al menos un cargo afectado');
      return;
    }
    setGuardando(true);
    const cargoIdsOriginales = formulario.cargoIds;
    const cargoIdsRestantes = [...cargoIdsOriginales];
    try {
      while (cargoIdsRestantes.length > 0) {
        const cargoId = cargoIdsRestantes[0];
        await cliente.post('/licencias', {
          personaId: parseInt(formulario.personaId),
          cargoId,
          tipoLicenciaId: parseInt(formulario.tipoLicenciaId),
          fechaInicio: formulario.fechaInicio,
          fechaFin: formulario.fechaFin || null,
          certificadoUrl: tipoSeleccionado?.requiereCertificado ? formulario.certificadoUrl : null,
          suplentePersonaId: tipoSeleccionado?.habilitaSuplente && formulario.suplentePersonaId
            ? parseInt(formulario.suplentePersonaId)
            : null,
          cicloLectivo
        });
        // Se saca de la lista de pendientes recién después de que el POST confirmó éxito,
        // así un reintento tras un fallo parcial no vuelve a crear los que ya se guardaron.
        cargoIdsRestantes.shift();
      }
      setMensajeExito(
        cargoIdsOriginales.length === 1
          ? 'Licencia registrada correctamente'
          : `Se registraron ${cargoIdsOriginales.length} licencias (una por cada cargo seleccionado)`
      );
      cerrarFormulario();
    } catch (err) {
      const guardados = cargoIdsOriginales.length - cargoIdsRestantes.length;
      setFormulario((anterior) => ({ ...anterior, cargoIds: cargoIdsRestantes }));
      if (guardados > 0) {
        setError(
          `${err.response?.data?.error || 'Falló el registro de uno de los cargos'} — ` +
          `se guardaron ${guardados} de ${cargoIdsOriginales.length} licencias. ` +
          'Los cargos restantes quedaron seleccionados: podés reintentar sin duplicar los que ya se guardaron.'
        );
      } else {
        setError(err.response?.data?.error || 'No se pudo registrar la licencia');
      }
    } finally {
      setGuardando(false);
      cargarDatos();
    }
  }

  if (!esSecretaria) {
    return (
      <div className="alumnos-pagina">
        <h1>Licencias</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Licencias — Ciclo {cicloLectivo}</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setMostrarFormularioTipo(!mostrarFormularioTipo)}>
            {mostrarFormularioTipo ? 'Cancelar' : '+ Tipo de licencia'}
          </button>
          <button onClick={() => mostrarFormulario ? cerrarFormulario() : abrirFormularioNuevo()}>
            {mostrarFormulario ? 'Cancelar' : '+ Nueva licencia'}
          </button>
        </div>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {mostrarFormularioTipo && (
        <form onSubmit={manejarAltaTipo} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
              <label>Nombre del tipo de licencia</label>
              <input
                type="text"
                placeholder="Ej: Enfermedad, Vacaciones, Maternidad"
                value={nuevoTipo.nombre}
                onChange={(e) => setNuevoTipo({ ...nuevoTipo, nombre: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="alumnos-formulario-fila">
            <label className="inasistencias-checkbox">
              <input
                type="checkbox"
                checked={nuevoTipo.generaFalta}
                onChange={(e) => setNuevoTipo({ ...nuevoTipo, generaFalta: e.target.checked })}
              />
              Genera falta
            </label>
            <label className="inasistencias-checkbox">
              <input
                type="checkbox"
                checked={nuevoTipo.requiereCertificado}
                onChange={(e) => setNuevoTipo({ ...nuevoTipo, requiereCertificado: e.target.checked })}
              />
              Requiere certificado
            </label>
            <label className="inasistencias-checkbox">
              <input
                type="checkbox"
                checked={nuevoTipo.habilitaSuplente}
                onChange={(e) => setNuevoTipo({ ...nuevoTipo, habilitaSuplente: e.target.checked })}
              />
              Habilita suplente
            </label>
          </div>
          <button type="submit">Guardar tipo de licencia</button>
        </form>
      )}

      {mostrarFormulario && (
        <form onSubmit={manejarAlta} className="alumnos-formulario">
          {licenciaEnEdicion ? (
            <div className="alumnos-formulario-fila">
              <div>
                <label>Persona</label>
                <p>{licenciaEnEdicion.persona.apellido}, {licenciaEnEdicion.persona.nombre}</p>
              </div>
              <div>
                <label>Cargo afectado</label>
                <p>
                  {licenciaEnEdicion.cargo.nombreCargo}
                  {licenciaEnEdicion.cargo.division ? ` (${licenciaEnEdicion.cargo.division.nombre})` : ''}
                </p>
              </div>
              <div>
                <label>Tipo de licencia</label>
                <select
                  value={formulario.tipoLicenciaId}
                  onChange={(e) => setFormulario({ ...formulario, tipoLicenciaId: e.target.value })}
                  required
                >
                  <option value="">Seleccioná un tipo</option>
                  {tiposLicencia.map((tipo) => (
                    <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <>
              <div className="alumnos-formulario-fila">
                <div>
                  <label>Persona</label>
                  <input
                    type="text"
                    placeholder="Buscar por apellido..."
                    value={busquedaPersona}
                    onChange={(e) => setBusquedaPersona(e.target.value)}
                    style={{ marginBottom: '6px' }}
                  />
                  <select
                    value={formulario.personaId}
                    onChange={(e) => setFormulario({ ...formulario, personaId: e.target.value, cargoIds: [] })}
                    required
                  >
                    <option value="">Seleccioná una persona</option>
                    {personasFiltradas.map((persona) => (
                      <option key={persona.id} value={persona.id}>{persona.apellido}, {persona.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Tipo de licencia</label>
                  <select
                    value={formulario.tipoLicenciaId}
                    onChange={(e) => setFormulario({ ...formulario, tipoLicenciaId: e.target.value })}
                    required
                  >
                    <option value="">Seleccioná un tipo</option>
                    {tiposLicencia.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label>
                  Cargos afectados
                  {cargosDeLaPersona.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFormulario({
                        ...formulario,
                        cargoIds: formulario.cargoIds.length === cargosDeLaPersona.length
                          ? []
                          : cargosDeLaPersona.map((c) => c.id)
                      })}
                      style={{ marginLeft: '10px' }}
                    >
                      {formulario.cargoIds.length === cargosDeLaPersona.length ? 'Ninguno' : 'Seleccionar todos'}
                    </button>
                  )}
                </label>
                {!formulario.personaId ? (
                  <p className="alumnos-vacio">Elegí primero una persona</p>
                ) : cargosDeLaPersona.length === 0 ? (
                  <p className="alumnos-vacio">Esta persona no tiene cargos vigentes en el ciclo {cicloLectivo}</p>
                ) : (
                  cargosDeLaPersona.map((cargo) => (
                    <label key={cargo.id} className="inasistencias-checkbox">
                      <input
                        type="checkbox"
                        checked={formulario.cargoIds.includes(cargo.id)}
                        onChange={() => alternarCargo(cargo.id)}
                      />
                      {cargo.nombreCargo}{cargo.division ? ` (${cargo.division.nombre})` : ''}
                    </label>
                  ))
                )}
              </div>
            </>
          )}

          <div className="alumnos-formulario-fila">
            <div>
              <label>Fecha de inicio</label>
              <input
                type="date"
                value={formulario.fechaInicio}
                onChange={(e) => setFormulario({ ...formulario, fechaInicio: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Fecha de fin (si ya se sabe)</label>
              <input
                type="date"
                value={formulario.fechaFin}
                onChange={(e) => setFormulario({ ...formulario, fechaFin: e.target.value })}
              />
            </div>
          </div>
          {tipoSeleccionado?.requiereCertificado && (
            <div className="alumnos-formulario-fila">
              <div>
                <label>Certificado (URL)</label>
                <input
                  type="text"
                  value={formulario.certificadoUrl}
                  onChange={(e) => setFormulario({ ...formulario, certificadoUrl: e.target.value })}
                />
              </div>
            </div>
          )}
          {tipoSeleccionado?.habilitaSuplente && (
            <div className="alumnos-formulario-fila">
              <div>
                <label>Suplente (opcional)</label>
                <input
                  type="text"
                  placeholder="Buscar por apellido..."
                  value={busquedaSuplente}
                  onChange={(e) => setBusquedaSuplente(e.target.value)}
                  style={{ marginBottom: '6px' }}
                />
                <select
                  value={formulario.suplentePersonaId}
                  onChange={(e) => setFormulario({ ...formulario, suplentePersonaId: e.target.value })}
                >
                  <option value="">Sin suplente asignado todavía</option>
                  {personasParaSuplente.map((persona) => (
                    <option key={persona.id} value={persona.id}>{persona.apellido}, {persona.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : licenciaEnEdicion ? 'Guardar cambios' : 'Registrar licencia'}
          </button>
        </form>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : licencias.length === 0 ? (
        <p className="alumnos-vacio">No hay licencias registradas para el ciclo {cicloLectivo}.</p>
      ) : (
        <table className="alumnos-tabla">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Cargo</th>
              <th>Tipo</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Suplente</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {licencias.map((licencia) => (
              <tr key={licencia.id}>
                <td>{licencia.persona.apellido}, {licencia.persona.nombre}</td>
                <td>
                  {licencia.cargo.nombreCargo}{licencia.cargo.division ? ` (${licencia.cargo.division.nombre})` : ''}
                </td>
                <td>{licencia.tipoLicencia.nombre}</td>
                <td>{new Date(licencia.fechaInicio).toLocaleDateString('es-AR')}</td>
                <td>
                  {licencia.fechaFin ? (
                    new Date(licencia.fechaFin).toLocaleDateString('es-AR')
                  ) : (
                    <span className="materiasadeudadas-estado materiasadeudadas-estado-csa">Vigente</span>
                  )}
                </td>
                <td>{licencia.suplente ? `${licencia.suplente.apellido}, ${licencia.suplente.nombre}` : '-'}</td>
                <td className="materiasadeudadas-acciones">
                  <button onClick={() => abrirFormularioEdicion(licencia)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Licencias;
