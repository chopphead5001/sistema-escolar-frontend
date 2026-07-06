import { useState, useEffect } from 'react';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Inasistencias.css';
import './MateriasAdeudadas.css';

function PartesDiarios() {
  const { cicloLectivo } = useCicloLectivo();

  const [cargosDisponibles, setCargosDisponibles] = useState([]);
  const [partes, setPartes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [fecha, setFecha] = useState('');
  const [turnoFiltro, setTurnoFiltro] = useState('');

  const [busquedaPersona, setBusquedaPersona] = useState('');
  const [formulario, setFormulario] = useState({ turno: 'Mañana', cargoId: '', horasAfectadas: '', cubierta: '' });
  const [licenciaVigente, setLicenciaVigente] = useState(null);

  async function cargarCargos() {
    try {
      const respuesta = await cliente.get('/partes-diarios/cargos-disponibles', { params: { cicloLectivo } });
      setCargosDisponibles(respuesta.data);
    } catch (err) {
      setError('No se pudo cargar el listado de cargos');
    }
  }

  useEffect(() => {
    cargarCargos();
  }, [cicloLectivo]);

  async function cargarPartes() {
    if (!fecha) {
      setPartes([]);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const respuesta = await cliente.get('/partes-diarios', {
        params: { fecha, turno: turnoFiltro || undefined }
      });
      setPartes(respuesta.data);
    } catch (err) {
      setError('No se pudo cargar el parte diario');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarPartes();
  }, [fecha, turnoFiltro]);

  useEffect(() => {
    async function verificarLicencia() {
      const cargo = cargosDisponibles.find((c) => c.id === parseInt(formulario.cargoId));
      if (!cargo || !fecha) {
        setLicenciaVigente(null);
        return;
      }
      try {
        const respuesta = await cliente.get('/partes-diarios/verificar-licencia', {
          params: { personaId: cargo.personaId, fecha }
        });
        setLicenciaVigente(respuesta.data.tieneLicencia ? respuesta.data.licencia : null);
      } catch (err) {
        setLicenciaVigente(null);
      }
    }
    verificarLicencia();
  }, [formulario.cargoId, fecha, cargosDisponibles]);

  const cargosFiltrados = busquedaPersona
    ? cargosDisponibles.filter((c) =>
        `${c.persona.apellido} ${c.persona.nombre}`.toLowerCase().includes(busquedaPersona.toLowerCase())
      )
    : cargosDisponibles;

  async function manejarAlta(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    setMensajeExito('');
    try {
      await cliente.post('/partes-diarios', {
        fecha,
        turno: formulario.turno,
        cargoId: parseInt(formulario.cargoId),
        horasAfectadas: formulario.horasAfectadas ? parseInt(formulario.horasAfectadas) : null,
        cubierta: formulario.cubierta
      });
      setMensajeExito('Falta registrada correctamente');
      setFormulario({ turno: formulario.turno, cargoId: '', horasAfectadas: '', cubierta: '' });
      setBusquedaPersona('');
      cargarPartes();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar la falta');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarParte(parteId) {
    if (!window.confirm('¿Confirmás que querés eliminar este registro?')) return;
    try {
      await cliente.delete(`/partes-diarios/${parteId}`);
      cargarPartes();
    } catch (err) {
      setError('No se pudo eliminar el registro');
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Partes diarios — Ciclo {cicloLectivo}</h1>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      <div className="alumnos-formulario-fila">
        <div>
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label>Turno</label>
          <select value={turnoFiltro} onChange={(e) => setTurnoFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="Mañana">Mañana</option>
            <option value="Tarde">Tarde</option>
          </select>
        </div>
      </div>

      {!fecha ? (
        <p className="alumnos-vacio">Elegí una fecha para ver y cargar el parte diario.</p>
      ) : (
        <>
          <form onSubmit={manejarAlta} className="alumnos-formulario">
            <div className="alumnos-formulario-fila">
              <div>
                <label>Turno</label>
                <select
                  value={formulario.turno}
                  onChange={(e) => setFormulario({ ...formulario, turno: e.target.value })}
                >
                  <option value="Mañana">Mañana</option>
                  <option value="Tarde">Tarde</option>
                </select>
              </div>
              <div>
                <label>Persona / cargo</label>
                <input
                  type="text"
                  placeholder="Buscar por apellido..."
                  value={busquedaPersona}
                  onChange={(e) => setBusquedaPersona(e.target.value)}
                  style={{ marginBottom: '6px' }}
                />
                <select
                  value={formulario.cargoId}
                  onChange={(e) => setFormulario({ ...formulario, cargoId: e.target.value })}
                  required
                >
                  <option value="">Seleccioná un cargo</option>
                  {cargosFiltrados.map((cargo) => (
                    <option key={cargo.id} value={cargo.id}>
                      {cargo.persona.apellido}, {cargo.persona.nombre} — {cargo.nombreCargo}
                      {cargo.division ? ` (${cargo.division.nombre})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Horas afectadas</label>
                <input
                  type="number"
                  min="1"
                  value={formulario.horasAfectadas}
                  onChange={(e) => setFormulario({ ...formulario, horasAfectadas: e.target.value })}
                  required
                />
              </div>
              <div>
                <label>Cómo se cubrió (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: suplente, libre..."
                  value={formulario.cubierta}
                  onChange={(e) => setFormulario({ ...formulario, cubierta: e.target.value })}
                />
              </div>
            </div>

            {licenciaVigente && (
              <p className="inasistencias-aviso-ya-cargado">
                ⚠️ Esta persona tiene una licencia vigente ({licenciaVigente.tipoLicencia.nombre}) desde el{' '}
                {new Date(licenciaVigente.fechaInicio).toLocaleDateString('es-AR')}
                {licenciaVigente.fechaFin
                  ? ` hasta el ${new Date(licenciaVigente.fechaFin).toLocaleDateString('es-AR')}`
                  : ' sin fecha de fin'}.
              </p>
            )}

            <button type="submit" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Registrar falta'}
            </button>
          </form>

          {cargando ? (
            <p>Cargando...</p>
          ) : partes.length === 0 ? (
            <p className="alumnos-vacio">No hay partes cargados para este día.</p>
          ) : (
            <table className="alumnos-tabla">
              <thead>
                <tr>
                  <th>Turno</th>
                  <th>Persona</th>
                  <th>Cargo</th>
                  <th>División</th>
                  <th>Horas afectadas</th>
                  <th>Cómo se cubrió</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {partes.map((parte) => (
                  <tr key={parte.id}>
                    <td>{parte.turno}</td>
                    <td>{parte.cargo.persona.apellido}, {parte.cargo.persona.nombre}</td>
                    <td>{parte.cargo.nombreCargo}</td>
                    <td>{parte.cargo.division?.nombre || '-'}</td>
                    <td>{parte.horasAfectadas || '-'}</td>
                    <td>{parte.cubierta || '-'}</td>
                    <td className="materiasadeudadas-acciones">
                      <button onClick={() => eliminarParte(parte.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default PartesDiarios;
