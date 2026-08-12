import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './MateriasAdeudadas.css';
import './Cargos.css';
import { ETIQUETA_TURNO } from '../constants/horarios';

const ANIO_MINIMO_MODALIDAD = 4;
const ORDINAL_ANIO = { 1: '1ro', 2: '2do', 3: '3ro', 4: '4to', 5: '5to', 6: '6to' };
const SECCIONES = ['1ra', '2da', '3ra'];

function Divisiones() {
  const { usuario } = useAuth();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [vista, setVista] = useState('divisiones');

  const [divisiones, setDivisiones] = useState([]);
  const [modalidades, setModalidades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [divisionEnEdicion, setDivisionEnEdicion] = useState(null);
  const [formulario, setFormulario] = useState({ seccion: '', anio: '1', turno: 'TARDE', modalidadId: '' });
  const [guardando, setGuardando] = useState(false);

  const [mostrarFormularioModalidad, setMostrarFormularioModalidad] = useState(false);
  const [nombreModalidadNuevo, setNombreModalidadNuevo] = useState('');
  const [modalidadEnEdicionId, setModalidadEnEdicionId] = useState(null);
  const [nombreModalidadEdicion, setNombreModalidadEdicion] = useState('');

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaDivisiones, respuestaModalidades] = await Promise.all([
        cliente.get('/divisiones'),
        cliente.get('/divisiones/modalidades')
      ]);
      setDivisiones(respuestaDivisiones.data);
      setModalidades(respuestaModalidades.data);
    } catch (err) {
      setError('No se pudo cargar la información de divisiones');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (esSecretaria) cargarDatos();
  }, [esSecretaria]);

  const divisionesOrdenadas = [...divisiones].sort((a, b) => {
    if (a.anio !== b.anio) return a.anio - b.anio;
    return a.nombre.localeCompare(b.nombre);
  });

  const modalidadesActivas = modalidades.filter((m) => m.activa);
  const puedeElegirModalidad = parseInt(formulario.anio) >= ANIO_MINIMO_MODALIDAD;

  function abrirFormularioNuevo() {
    setDivisionEnEdicion(null);
    setFormulario({ seccion: '', anio: '1', turno: 'TARDE', modalidadId: '' });
    setMostrarFormulario(true);
  }

  function abrirFormularioEdicion(division) {
    setDivisionEnEdicion(division.id);
    setFormulario({
      seccion: division.seccion,
      anio: String(division.anio),
      turno: division.turno,
      modalidadId: division.modalidadId ? String(division.modalidadId) : ''
    });
    setMostrarFormulario(true);
  }

  function actualizarAnio(anio) {
    const yaNoAplicaModalidad = parseInt(anio) < ANIO_MINIMO_MODALIDAD;
    setFormulario((previo) => ({ ...previo, anio, modalidadId: yaNoAplicaModalidad ? '' : previo.modalidadId }));
  }

  async function manejarGuardar(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    setMensajeExito('');
    try {
      const datos = {
        seccion: formulario.seccion,
        anio: parseInt(formulario.anio),
        turno: formulario.turno,
        modalidadId: formulario.modalidadId ? parseInt(formulario.modalidadId) : null
      };
      if (divisionEnEdicion) {
        await cliente.put(`/divisiones/${divisionEnEdicion}`, datos);
        setMensajeExito('División actualizada correctamente');
      } else {
        await cliente.post('/divisiones', datos);
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

  async function manejarAltaModalidad(evento) {
    evento.preventDefault();
    try {
      await cliente.post('/divisiones/modalidades', { nombre: nombreModalidadNuevo });
      setNombreModalidadNuevo('');
      setMostrarFormularioModalidad(false);
      setMensajeExito('Modalidad creada correctamente');
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la modalidad');
    }
  }

  function abrirEdicionModalidad(modalidad) {
    setModalidadEnEdicionId(modalidad.id);
    setNombreModalidadEdicion(modalidad.nombre);
    setError('');
    setMensajeExito('');
  }

  function cancelarEdicionModalidad() {
    setModalidadEnEdicionId(null);
    setNombreModalidadEdicion('');
  }

  async function guardarEdicionModalidad(evento) {
    evento.preventDefault();
    try {
      await cliente.put(`/divisiones/modalidades/${modalidadEnEdicionId}`, { nombre: nombreModalidadEdicion });
      setMensajeExito('Modalidad actualizada correctamente');
      cancelarEdicionModalidad();
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar los cambios');
    }
  }

  async function alternarActivaModalidad(modalidad) {
    const accion = modalidad.activa ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Confirmás que querés ${accion} la modalidad "${modalidad.nombre}"?`)) return;
    try {
      await cliente.put(`/divisiones/modalidades/${modalidad.id}`, { activa: !modalidad.activa });
      cargarDatos();
    } catch (err) {
      setError(`No se pudo ${accion} la modalidad`);
    }
  }

  if (!esSecretaria) {
    return (
      <div className="alumnos-pagina">
        <h1>Divisiones</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Divisiones</h1>
        {vista === 'divisiones' ? (
          <button onClick={() => mostrarFormulario ? setMostrarFormulario(false) : abrirFormularioNuevo()}>
            {mostrarFormulario ? 'Cancelar' : '+ Nueva división'}
          </button>
        ) : (
          <button onClick={() => setMostrarFormularioModalidad(!mostrarFormularioModalidad)}>
            {mostrarFormularioModalidad ? 'Cancelar' : '+ Modalidad'}
          </button>
        )}
      </div>

      <div className="cargos-tabs">
        <button
          className={vista === 'divisiones' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('divisiones')}
        >
          Divisiones
        </button>
        <button
          className={vista === 'modalidades' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('modalidades')}
        >
          Modalidades
        </button>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {vista === 'modalidades' ? (
        <>
          {mostrarFormularioModalidad && (
            <form onSubmit={manejarAltaModalidad} className="alumnos-formulario">
              <div className="alumnos-formulario-fila">
                <div>
                  <label>Modalidad nueva (para 4to a 6to año)</label>
                  <input
                    type="text"
                    placeholder="Ej: Economía y Administración, Ciencias Naturales"
                    value={nombreModalidadNuevo}
                    onChange={(e) => setNombreModalidadNuevo(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button type="submit">Guardar modalidad</button>
            </form>
          )}

          {modalidades.length === 0 ? (
            <p className="alumnos-vacio">No hay modalidades cargadas todavía.</p>
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
                {[...modalidades].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((modalidad) => (
                  modalidadEnEdicionId === modalidad.id ? (
                    <tr key={modalidad.id}>
                      <td colSpan={3}>
                        <form onSubmit={guardarEdicionModalidad} className="alumnos-formulario">
                          <div className="alumnos-formulario-fila">
                            <div>
                              <label>Nombre</label>
                              <input
                                type="text"
                                value={nombreModalidadEdicion}
                                onChange={(e) => setNombreModalidadEdicion(e.target.value)}
                                required
                              />
                            </div>
                          </div>
                          <span className="alumnos-promover-acciones">
                            <button type="submit">Guardar cambios</button>
                            <button type="button" onClick={cancelarEdicionModalidad}>Cancelar</button>
                          </span>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={modalidad.id}>
                      <td>{modalidad.nombre}</td>
                      <td>
                        <span className={`materiasadeudadas-estado ${modalidad.activa ? 'materiasadeudadas-estado-aprobada' : 'materiasadeudadas-estado-trasladada'}`}>
                          {modalidad.activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <span className="materiasadeudadas-acciones">
                          <button onClick={() => abrirEdicionModalidad(modalidad)}>Renombrar</button>
                          <button onClick={() => alternarActivaModalidad(modalidad)}>
                            {modalidad.activa ? 'Desactivar' : 'Activar'}
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <>
          {mostrarFormulario && (
            <form onSubmit={manejarGuardar} className="alumnos-formulario">
              <div className="alumnos-formulario-fila">
                <div>
                  <label>Año</label>
                  <select value={formulario.anio} onChange={(e) => actualizarAnio(e.target.value)}>
                    {[1, 2, 3, 4, 5, 6].map((anio) => (
                      <option key={anio} value={anio}>{anio}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>División</label>
                  <select
                    value={formulario.seccion}
                    onChange={(e) => setFormulario({ ...formulario, seccion: e.target.value })}
                    required
                  >
                    <option value="">Seleccioná una división</option>
                    {SECCIONES.map((seccion) => (
                      <option key={seccion} value={seccion}>{seccion}</option>
                    ))}
                    {formulario.seccion && !SECCIONES.includes(formulario.seccion) && (
                      <option value={formulario.seccion}>{formulario.seccion} (actual)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label>Turno</label>
                  <select value={formulario.turno} onChange={(e) => setFormulario({ ...formulario, turno: e.target.value })}>
                    <option value="MANANA">Mañana</option>
                    <option value="TARDE">Tarde</option>
                  </select>
                </div>
              </div>
              {formulario.seccion.trim() && (
                <p className="alumnos-vacio">
                  Nombre: <strong>{ORDINAL_ANIO[parseInt(formulario.anio)]} {formulario.seccion.trim()}</strong>
                </p>
              )}
              {puedeElegirModalidad && (
                <div className="alumnos-formulario-fila">
                  <div>
                    <label>Modalidad</label>
                    <select
                      value={formulario.modalidadId}
                      onChange={(e) => setFormulario({ ...formulario, modalidadId: e.target.value })}
                    >
                      <option value="">Sin modalidad todavía</option>
                      {modalidadesActivas.map((modalidad) => (
                        <option key={modalidad.id} value={modalidad.id}>{modalidad.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
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
                  <th>Año</th>
                  <th>División</th>
                  <th>Turno</th>
                  <th>Modalidad</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {divisionesOrdenadas.map((division) => (
                  <tr key={division.id}>
                    <td>{division.anio}</td>
                    <td>{division.seccion}</td>
                    <td>{ETIQUETA_TURNO[division.turno]}</td>
                    <td>{division.modalidad?.nombre || '-'}</td>
                    <td>
                      <span className={`materiasadeudadas-estado ${division.activa ? 'materiasadeudadas-estado-aprobada' : 'materiasadeudadas-estado-trasladada'}`}>
                        {division.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <span className="materiasadeudadas-acciones">
                        <button onClick={() => abrirFormularioEdicion(division)}>Editar</button>
                        <button onClick={() => alternarActiva(division)}>
                          {division.activa ? 'Desactivar' : 'Activar'}
                        </button>
                      </span>
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

export default Divisiones;
