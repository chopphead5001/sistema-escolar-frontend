import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Cargos.css';
import './MateriasAdeudadas.css';
import { MODULOS_DOCENTE, DIAS_SEMANA, bloqueEsModuloFijo, resumenHorario as resumenBloques, licenciaVigenteEn } from '../constants/horarios';

const ETIQUETA_TIPO_NOMBRE_CARGO = { DOCENTE: 'Docente', ADMINISTRATIVO: 'Administrativo' };

function resumenHorario(cargo) {
  return resumenBloques(cargo.bloquesHorario);
}

// Badges extra junto al Estado (Vigente/Finalizado) de siempre, solo cuando
// hay algo relacionado a una licencia para mostrar — no le agrega ruido a la
// mayoría de las filas, que son cargos normales sin licencias en juego. Los
// dos badges no son excluyentes: un cargo de cobertura puede a su vez tener
// su propia licencia vigente (el suplente se enfermó mientras cubría), y
// ahí corresponde mostrar "Suplencia" Y "En licencia" al mismo tiempo.
function badgeLicencia(cargo) {
  const badges = [];
  if (cargo.origenLicenciaId) {
    const titular = cargo.origenLicencia?.persona;
    badges.push(
      <span
        key="suplencia"
        className="materiasadeudadas-estado materiasadeudadas-estado-cca"
        title={titular ? `Cargo temporal: cubre a ${titular.apellido}, ${titular.nombre}` : 'Cargo temporal de suplencia'}
        style={{ marginLeft: '8px' }}
      >
        Suplencia
      </span>
    );
  }
  const licenciaVigente = (cargo.licencias || []).find((l) => licenciaVigenteEn(l));
  if (licenciaVigente) {
    badges.push(
      <span
        key="en-licencia"
        className="materiasadeudadas-estado materiasadeudadas-estado-csa"
        title={licenciaVigente.suplente ? `Cubre: ${licenciaVigente.suplente.apellido}, ${licenciaVigente.suplente.nombre}` : 'Sin suplente asignado'}
        style={{ marginLeft: '8px' }}
      >
        En licencia
      </span>
    );
  }
  return badges.length > 0 ? badges : null;
}

function Cargos() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [vista, setVista] = useState('cargos');

  const [personas, setPersonas] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [nombresCargo, setNombresCargo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cargoEnEdicion, setCargoEnEdicion] = useState(null);
  const [formulario, setFormulario] = useState({
    personaId: '', nombreCargo: '', divisionId: '', horasCatedra: ''
  });
  const [bloques, setBloques] = useState([]);
  const [horarioPersonalizado, setHorarioPersonalizado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [mostrarFormularioNombreCargo, setMostrarFormularioNombreCargo] = useState(false);
  const [nombreCargoNuevo, setNombreCargoNuevo] = useState('');
  const [tipoNombreCargoNuevo, setTipoNombreCargoNuevo] = useState('DOCENTE');
  const [nombreCargoEnEdicionId, setNombreCargoEnEdicionId] = useState(null);
  const [formularioNombreCargoEdicion, setFormularioNombreCargoEdicion] = useState(null);

  const [busquedaPersona, setBusquedaPersona] = useState('');
  const [busquedaCargos, setBusquedaCargos] = useState('');

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaPersonal, respuestaCargos, respuestaDivisiones, respuestaNombres] = await Promise.all([
        cliente.get('/personal'),
        cliente.get('/cargos', { params: { cicloLectivo } }),
        cliente.get('/divisiones'),
        cliente.get('/cargos/nombres-cargo')
      ]);
      setPersonas(respuestaPersonal.data);
      setCargos(respuestaCargos.data);
      setDivisiones(respuestaDivisiones.data);
      setNombresCargo(respuestaNombres.data);
    } catch (err) {
      setError('No se pudo cargar la información de cargos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (esSecretaria) cargarDatos();
  }, [cicloLectivo, esSecretaria]);

  const divisionesOrdenadas = [...divisiones]
    .filter((d) => d.activa)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Sólo personal activo puede recibir un cargo nuevo; si se está editando un cargo
  // cuya persona ya fue deshabilitada, igual se la deja en la lista para que el
  // select (deshabilitado en modo edición) siga mostrando su nombre correctamente.
  const personaDelCargoEnEdicion = cargoEnEdicion
    ? personas.find((p) => p.id === parseInt(formulario.personaId))
    : null;
  const personasSeleccionables = personas.filter((p) => p.activo || p.id === personaDelCargoEnEdicion?.id);

  const personasFiltradas = busquedaPersona
  ? personasSeleccionables.filter((p) =>
      `${p.apellido} ${p.nombre}`.toLowerCase().includes(busquedaPersona.toLowerCase())
    )
  : personasSeleccionables;

  // Ordenados por persona para que los cargos de una misma persona queden agrupados
  // uno debajo del otro (en vez de mezclados en el orden en que se cargaron), y
  // dentro de cada persona los vigentes primero y los finalizados al final.
  const cargosOrdenados = [...cargos].sort((a, b) => {
    const nombreA = `${a.persona.apellido} ${a.persona.nombre}`;
    const nombreB = `${b.persona.apellido} ${b.persona.nombre}`;
    if (nombreA !== nombreB) return nombreA.localeCompare(nombreB);
    return (b.vigente ? 1 : 0) - (a.vigente ? 1 : 0);
  });

  const busqueda = busquedaCargos.trim().toLowerCase();
  const cargosFiltrados = busqueda
    ? cargosOrdenados.filter((cargo) =>
        `${cargo.persona.apellido} ${cargo.persona.nombre}`.toLowerCase().includes(busqueda) ||
        cargo.nombreCargo.toLowerCase().includes(busqueda) ||
        (cargo.division?.nombre || '').toLowerCase().includes(busqueda)
      )
    : cargosOrdenados;

  const nombreCargoSeleccionado = nombresCargo.find((nc) => nc.nombre === formulario.nombreCargo);
  const tipoSeleccionado = nombreCargoSeleccionado?.tipo || null;

  function estaModuloSeleccionado(dia, modulo) {
    return bloques.some((b) => b.diaSemana === dia && b.horaInicio === modulo.inicio && b.horaFin === modulo.fin);
  }

  function alternarModulo(dia, modulo) {
    setBloques((prev) => {
      const existe = prev.some((b) => b.diaSemana === dia && b.horaInicio === modulo.inicio && b.horaFin === modulo.fin);
      if (existe) {
        return prev.filter((b) => !(b.diaSemana === dia && b.horaInicio === modulo.inicio && b.horaFin === modulo.fin));
      }
      return [...prev, { diaSemana: dia, horaInicio: modulo.inicio, horaFin: modulo.fin }];
    });
  }

  function horarioAdminDelDia(dia) {
    return bloques.find((b) => b.diaSemana === dia) || { horaInicio: '', horaFin: '' };
  }

  function actualizarHorarioAdmin(dia, campo, valor) {
    setBloques((prev) => {
      const existente = prev.find((b) => b.diaSemana === dia);
      const horaInicio = campo === 'horaInicio' ? valor : (existente?.horaInicio || '');
      const horaFin = campo === 'horaFin' ? valor : (existente?.horaFin || '');
      const sinEsteDia = prev.filter((b) => b.diaSemana !== dia);
      // Se guarda aunque falte completar el otro campo, para que no se pierda lo ya
      // tipeado mientras carga los dos horarios de un mismo día; se descarta recién
      // al enviar el formulario si quedó incompleto (ver manejarGuardar).
      if (!horaInicio && !horaFin) return sinEsteDia;
      return [...sinEsteDia, { diaSemana: dia, horaInicio, horaFin }];
    });
  }

  function abrirFormularioNuevo() {
    setCargoEnEdicion(null);
    setFormulario({ personaId: '', nombreCargo: '', divisionId: '', horasCatedra: '' });
    setBloques([]);
    setHorarioPersonalizado(false);
    setMostrarFormulario(true);
  }

  function abrirFormularioEdicion(cargo) {
    setCargoEnEdicion(cargo.id);
    setFormulario({
      personaId: cargo.personaId,
      nombreCargo: cargo.nombreCargo,
      divisionId: cargo.divisionId || '',
      horasCatedra: cargo.horasCatedra || ''
    });
    const bloquesDelCargo = (cargo.bloquesHorario || []).map((b) => ({ diaSemana: b.diaSemana, horaInicio: b.horaInicio, horaFin: b.horaFin }));
    setBloques(bloquesDelCargo);
    // Si ya tiene algún horario que no encaja en la grilla de módulos (ej. Educación
    // Física cargada como horario propio), abrir directamente en modo horario propio.
    setHorarioPersonalizado(bloquesDelCargo.some((b) => !bloqueEsModuloFijo(b)));
    setMostrarFormulario(true);
  }

  function alternarHorarioPersonalizado() {
    setBloques([]);
    setHorarioPersonalizado((previo) => !previo);
  }

  // El formulario tiene muchos campos (buscador de persona, horario por día, etc.);
  // sin esto, Enter en cualquiera de ellos dispara el submit y guarda el cargo
  // aunque el horario haya quedado a medio completar.
  function bloquearEnterFueraDeBoton(evento) {
    if (evento.key === 'Enter' && evento.target.tagName !== 'BUTTON') {
      evento.preventDefault();
    }
  }

  async function manejarGuardar(evento) {
    evento.preventDefault();
    if (formulario.nombreCargo && !tipoSeleccionado) {
      setError('Ese nombre de cargo todavía no tiene definido si es Docente o Administrativo. Completalo en la solapa "Nombres de cargo".');
      return;
    }
    setGuardando(true);
    setError('');
    setMensajeExito('');
    try {
      const datos = {
        nombreCargo: formulario.nombreCargo,
        divisionId: formulario.divisionId ? parseInt(formulario.divisionId) : null,
        horasCatedra: formulario.horasCatedra ? parseFloat(formulario.horasCatedra) : null,
        bloques: bloques.filter((b) => b.horaInicio && b.horaFin)
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
      await cliente.post('/cargos/nombres-cargo', { nombre: nombreCargoNuevo, tipo: tipoNombreCargoNuevo });
      setNombreCargoNuevo('');
      setTipoNombreCargoNuevo('DOCENTE');
      setMostrarFormularioNombreCargo(false);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el nombre de cargo');
    }
  }

  function abrirEdicionNombreCargo(nc) {
    setNombreCargoEnEdicionId(nc.id);
    setFormularioNombreCargoEdicion({ nombre: nc.nombre, tipo: nc.tipo || 'DOCENTE' });
    setMensajeExito('');
    setError('');
  }

  function cancelarEdicionNombreCargo() {
    setNombreCargoEnEdicionId(null);
    setFormularioNombreCargoEdicion(null);
  }

  async function guardarEdicionNombreCargo(evento) {
    evento.preventDefault();
    try {
      await cliente.put(`/cargos/nombres-cargo/${nombreCargoEnEdicionId}`, formularioNombreCargoEdicion);
      setMensajeExito('Nombre de cargo actualizado correctamente');
      cancelarEdicionNombreCargo();
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar los cambios');
    }
  }

  if (!esSecretaria) {
    return (
      <div className="alumnos-pagina">
        <h1>Cargos</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Cargos — Ciclo {cicloLectivo}</h1>
        {vista === 'cargos' ? (
          <button onClick={() => mostrarFormulario ? setMostrarFormulario(false) : abrirFormularioNuevo()}>
            {mostrarFormulario ? 'Cancelar' : '+ Nuevo cargo'}
          </button>
        ) : (
          <button onClick={() => setMostrarFormularioNombreCargo(!mostrarFormularioNombreCargo)}>
            {mostrarFormularioNombreCargo ? 'Cancelar' : '+ Nombre de cargo'}
          </button>
        )}
      </div>

      <div className="cargos-tabs">
        <button
          className={vista === 'cargos' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('cargos')}
        >
          Cargos asignados
        </button>
        <button
          className={vista === 'nombresCargo' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('nombresCargo')}
        >
          Nombres de cargo
        </button>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {vista === 'nombresCargo' ? (
        <>
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
                <div>
                  <label>Tipo</label>
                  <select value={tipoNombreCargoNuevo} onChange={(e) => setTipoNombreCargoNuevo(e.target.value)}>
                    <option value="DOCENTE">Docente</option>
                    <option value="ADMINISTRATIVO">Administrativo</option>
                  </select>
                </div>
              </div>
              <button type="submit">Guardar nombre de cargo</button>
            </form>
          )}

          {nombresCargo.length === 0 ? (
            <p className="alumnos-vacio">No hay nombres de cargo cargados todavía.</p>
          ) : (
            <table className="alumnos-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {[...nombresCargo].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((nc) => (
                  nombreCargoEnEdicionId === nc.id ? (
                    <tr key={nc.id}>
                      <td colSpan={3}>
                        <form onSubmit={guardarEdicionNombreCargo} className="alumnos-formulario">
                          <div className="alumnos-formulario-fila">
                            <div>
                              <label>Nombre</label>
                              <input
                                type="text"
                                value={formularioNombreCargoEdicion.nombre}
                                onChange={(e) => setFormularioNombreCargoEdicion({ ...formularioNombreCargoEdicion, nombre: e.target.value })}
                                required
                              />
                            </div>
                            <div>
                              <label>Tipo</label>
                              <select
                                value={formularioNombreCargoEdicion.tipo}
                                onChange={(e) => setFormularioNombreCargoEdicion({ ...formularioNombreCargoEdicion, tipo: e.target.value })}
                              >
                                <option value="DOCENTE">Docente</option>
                                <option value="ADMINISTRATIVO">Administrativo</option>
                              </select>
                            </div>
                          </div>
                          <span className="alumnos-promover-acciones">
                            <button type="submit">Guardar cambios</button>
                            <button type="button" onClick={cancelarEdicionNombreCargo}>Cancelar</button>
                          </span>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={nc.id}>
                      <td>{nc.nombre}</td>
                      <td>{nc.tipo ? ETIQUETA_TIPO_NOMBRE_CARGO[nc.tipo] : <em>Sin definir</em>}</td>
                      <td>
                        <span className="materiasadeudadas-acciones">
                          <button onClick={() => abrirEdicionNombreCargo(nc)}>Editar</button>
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
            <form onSubmit={manejarGuardar} onKeyDown={bloquearEnterFueraDeBoton} className="alumnos-formulario">
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
                    onChange={(e) => { setFormulario({ ...formulario, nombreCargo: e.target.value }); setBloques([]); setHorarioPersonalizado(false); }}
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
                    value={formulario.divisionId}
                    onChange={(e) => setFormulario({ ...formulario, divisionId: e.target.value })}
                  >
                    <option value="">Sin división (cargo administrativo)</option>
                    {divisionesOrdenadas.map((division) => (
                      <option key={division.id} value={division.id}>{division.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Módulo/Horas (opcional)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formulario.horasCatedra}
                    onChange={(e) => setFormulario({ ...formulario, horasCatedra: e.target.value })}
                  />
                </div>
              </div>

              {formulario.nombreCargo && !tipoSeleccionado && (
                <p className="alumnos-vacio">
                  "{formulario.nombreCargo}" todavía no tiene definido si es Docente o Administrativo.
                  Andá a la solapa "Nombres de cargo" para completarlo antes de guardar el horario.
                </p>
              )}

              {tipoSeleccionado === 'DOCENTE' && !horarioPersonalizado && (
                <div>
                  <label>Horario (tildá los módulos que ocupa este cargo)</label>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="cargos-grilla-horario">
                      <thead>
                        <tr>
                          <th>Horario</th>
                          {DIAS_SEMANA.map((d) => <th key={d.valor}>{d.etiqueta}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {MODULOS_DOCENTE.map((modulo) => (
                          <tr key={modulo.numero}>
                            <td>{modulo.inicio}-{modulo.fin}</td>
                            {DIAS_SEMANA.map((d) => (
                              <td key={d.valor}>
                                <input
                                  type="checkbox"
                                  checked={estaModuloSeleccionado(d.valor, modulo)}
                                  onChange={() => alternarModulo(d.valor, modulo)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="cargos-horario-propio-nota">
                    ¿Es una materia sin horario fijo (ej. Educación Física en contraturno)?{' '}
                    <button type="button" onClick={alternarHorarioPersonalizado}>Seleccionar horario propio</button>
                  </p>
                </div>
              )}

              {(tipoSeleccionado === 'ADMINISTRATIVO' || (tipoSeleccionado === 'DOCENTE' && horarioPersonalizado)) && (
                <div>
                  <label>Horario (por día, opcional)</label>
                  {DIAS_SEMANA.map((d) => {
                    const horario = horarioAdminDelDia(d.valor);
                    return (
                      <div key={d.valor} className="cargos-horario-admin-fila">
                        <span>{d.etiqueta}</span>
                        <input
                          type="time"
                          value={horario.horaInicio}
                          onChange={(e) => actualizarHorarioAdmin(d.valor, 'horaInicio', e.target.value)}
                        />
                        <span>a</span>
                        <input
                          type="time"
                          value={horario.horaFin}
                          onChange={(e) => actualizarHorarioAdmin(d.valor, 'horaFin', e.target.value)}
                        />
                      </div>
                    );
                  })}
                  {tipoSeleccionado === 'DOCENTE' && (
                    <p className="cargos-horario-propio-nota">
                      <button type="button" onClick={alternarHorarioPersonalizado}>Usar grilla de módulos</button>
                    </p>
                  )}
                </div>
              )}

              <button type="submit" disabled={guardando}>
                {guardando ? 'Guardando...' : cargoEnEdicion ? 'Guardar cambios' : 'Registrar cargo'}
              </button>
            </form>
          )}

          {cargos.length === 0 ? null : (
            <input
              type="text"
              placeholder="Buscar por persona, cargo o división..."
              value={busquedaCargos}
              onChange={(e) => setBusquedaCargos(e.target.value)}
              style={{ marginBottom: '10px', maxWidth: '320px' }}
            />
          )}

          {cargando ? (
            <p>Cargando...</p>
          ) : cargos.length === 0 ? (
            <p className="alumnos-vacio">No hay cargos registrados para el ciclo {cicloLectivo}.</p>
          ) : cargosFiltrados.length === 0 ? (
            <p className="alumnos-vacio">Ningún cargo coincide con la búsqueda.</p>
          ) : (
            <table className="alumnos-tabla">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Cargo</th>
                  <th>División</th>
                  <th>Módulo/Horas</th>
                  <th>Horario</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargosFiltrados.map((cargo, indice) => {
                  const mismaPersonaQueAnterior =
                    indice > 0 && cargosFiltrados[indice - 1].personaId === cargo.personaId;
                  return (
                    <tr key={cargo.id}>
                      <td>{mismaPersonaQueAnterior ? '' : `${cargo.persona.apellido}, ${cargo.persona.nombre}`}</td>
                      <td>{cargo.nombreCargo}</td>
                      <td>{cargo.division?.nombre || '-'}</td>
                      <td>{cargo.horasCatedra || '-'}</td>
                      <td className="cargos-horario-resumen">{resumenHorario(cargo)}</td>
                      <td>{cargo.vigente ? 'Vigente' : 'Finalizado'}{badgeLicencia(cargo)}</td>
                      <td>
                        {cargo.vigente && (
                          <span className="materiasadeudadas-acciones">
                            <button onClick={() => abrirFormularioEdicion(cargo)}>Editar</button>
                            <button onClick={() => finalizarCargo(cargo.id)}>Finalizar</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default Cargos;
