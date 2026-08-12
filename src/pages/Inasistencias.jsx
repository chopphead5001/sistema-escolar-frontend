import { useState, useEffect } from 'react';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Cargos.css';
import './MateriasAdeudadas.css';
import './Inasistencias.css';

function pesoEvento(evento) {
  if (evento.ausenteTodoElDia) return 1;
  let peso = 0;
  if (evento.llegadaTarde) peso += 0.25;
  if (evento.ausenteEducFisica) peso += 0.5;
  return peso;
}

function tipoEvento(evento) {
  if (evento.ausenteTodoElDia) return 'Ausente (día completo)';
  const partes = [];
  if (evento.llegadaTarde) partes.push('Llegada tarde');
  if (evento.ausenteEducFisica) partes.push('Ausente Ed. Física');
  return partes.length > 0 ? partes.join(' + ') : 'Sin novedad';
}

function formatearFecha(fechaIso) {
  return fechaIso.slice(0, 10);
}

function Inasistencias() {
  const { cicloLectivo } = useCicloLectivo();

  const [vista, setVista] = useState('parte');

  const [alumnos, setAlumnos] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [cargandoAlumnos, setCargandoAlumnos] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');

  const [divisionSeleccionada, setDivisionSeleccionada] = useState('');
  const [fecha, setFecha] = useState('');

  const [marcas, setMarcas] = useState({});

  const [diaYaConfirmado, setDiaYaConfirmado] = useState(null);
  const [verificandoDia, setVerificandoDia] = useState(false);

  // ===== Resumen =====
  const [modoResumen, setModoResumen] = useState('division');
  const [divisionResumen, setDivisionResumen] = useState('');
  const [alumnoResumen, setAlumnoResumen] = useState('');
  const [busquedaAlumnoResumen, setBusquedaAlumnoResumen] = useState('');
  const [eventosResumen, setEventosResumen] = useState([]);
  const [cargandoResumen, setCargandoResumen] = useState(false);

  const [rango, setRango] = useState({ fechaInicio: '', fechaFin: '', motivo: '' });
  const [eventoEnEdicionId, setEventoEnEdicionId] = useState(null);
  const [motivoEdicion, setMotivoEdicion] = useState('');

  async function cargarAlumnos() {
    setCargandoAlumnos(true);
    setError('');
    try {
      const [respuestaAlumnos, respuestaDivisiones] = await Promise.all([
        cliente.get('/alumnos'),
        cliente.get('/divisiones')
      ]);
      setAlumnos(respuestaAlumnos.data);
      setDivisiones(respuestaDivisiones.data);
    } catch (err) {
      setError('No se pudo cargar el listado de alumnos');
    } finally {
      setCargandoAlumnos(false);
    }
  }

  useEffect(() => {
    cargarAlumnos();
  }, []);

  useEffect(() => {
    async function verificarDia() {
      if (!divisionSeleccionada || !fecha) {
        setDiaYaConfirmado(null);
        return;
      }
      setVerificandoDia(true);
      try {
        const respuesta = await cliente.get('/inasistencias/verificar-dia', {
          params: { divisionId: divisionSeleccionada, fecha }
        });
        setDiaYaConfirmado(respuesta.data.confirmado);
      } catch (err) {
        setDiaYaConfirmado(null);
      } finally {
        setVerificandoDia(false);
      }
    }
    verificarDia();
  }, [divisionSeleccionada, fecha]);

  useEffect(() => {
    // Evita que marcas sin guardar de otro ciclo lectivo reaparezcan prellenadas
    // y terminen guardándose etiquetadas con el ciclo equivocado.
    setMarcas({});
  }, [cicloLectivo]);

  async function cargarEventosResumen() {
    if (modoResumen === 'division') {
      if (!divisionResumen) { setEventosResumen([]); return; }
      setCargandoResumen(true);
      try {
        const r = await cliente.get('/inasistencias', { params: { divisionId: divisionResumen, cicloLectivo } });
        setEventosResumen(r.data);
      } catch (err) {
        setEventosResumen([]);
      } finally {
        setCargandoResumen(false);
      }
    } else {
      if (!alumnoResumen) { setEventosResumen([]); return; }
      setCargandoResumen(true);
      try {
        const r = await cliente.get('/inasistencias', { params: { alumnoId: alumnoResumen, cicloLectivo } });
        setEventosResumen(r.data);
      } catch (err) {
        setEventosResumen([]);
      } finally {
        setCargandoResumen(false);
      }
    }
  }

  useEffect(() => {
    if (vista === 'resumen') cargarEventosResumen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, modoResumen, divisionResumen, alumnoResumen, cicloLectivo]);

  const divisionesOrdenadas = [...divisiones]
    .filter((d) => d.activa)
    .sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.nombre.localeCompare(b.nombre)));

  const alumnosDelCurso = alumnos.filter(a =>
    a.matriculas.some(m => m.cicloLectivo === cicloLectivo && m.divisionId === parseInt(divisionSeleccionada) && m.activa)
  );

  const alumnosConMatriculaVigente = alumnos.filter(a => a.matriculas.some(m => m.cicloLectivo === cicloLectivo && m.activa));
  const alumnosOrdenados = [...alumnosConMatriculaVigente].sort((a, b) =>
    `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`)
  );
  const alumnosFiltrados = busquedaAlumnoResumen
    ? alumnosOrdenados.filter((a) => `${a.apellido} ${a.nombre}`.toLowerCase().includes(busquedaAlumnoResumen.toLowerCase()))
    : alumnosOrdenados;

  const alumnoResumenObj = alumnos.find((a) => a.id === parseInt(alumnoResumen));

  const alumnosDivisionResumen = alumnos.filter(a =>
    a.matriculas.some(m => m.cicloLectivo === cicloLectivo && m.divisionId === parseInt(divisionResumen) && m.activa)
  );

  const resumenPorAlumno = alumnosDivisionResumen
    .map((a) => {
      const eventosDelAlumno = eventosResumen.filter((e) => e.alumnoId === a.id);
      const total = eventosDelAlumno.reduce((acc, e) => acc + pesoEvento(e), 0);
      const justificadas = eventosDelAlumno.reduce((acc, e) => acc + (e.justificada ? pesoEvento(e) : 0), 0);
      return { alumno: a, total, justificadas, sinJustificar: Math.round((total - justificadas) * 100) / 100 };
    })
    .sort((a, b) => b.sinJustificar - a.sinJustificar || a.alumno.apellido.localeCompare(b.alumno.apellido));

  const eventosDelAlumnoOrdenados = [...eventosResumen].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const totalAlumnoResumen = eventosDelAlumnoOrdenados.reduce((acc, e) => acc + pesoEvento(e), 0);
  const justificadasAlumnoResumen = eventosDelAlumnoOrdenados.reduce((acc, e) => acc + (e.justificada ? pesoEvento(e) : 0), 0);

  function actualizarMarca(alumnoId, campo, valor) {
    setMarcas((anterior) => {
      const marcaActual = anterior[alumnoId] || {
        ausenteTodoElDia: false, llegadaTarde: false, ausenteEducFisica: false
      };

      const nuevaMarca = { ...marcaActual, [campo]: valor };

      if (campo === 'ausenteTodoElDia' && valor) {
        nuevaMarca.llegadaTarde = false;
        nuevaMarca.ausenteEducFisica = false;
      }

      return { ...anterior, [alumnoId]: nuevaMarca };
    });
  }

  async function guardarParteDelDia() {
    setGuardando(true);
    setError('');
    setMensajeExito('');

    const alumnosConMarcas = Object.entries(marcas).filter(
      ([, marca]) => marca.ausenteTodoElDia || marca.llegadaTarde || marca.ausenteEducFisica
    );
    const marcasRestantes = { ...marcas };
    let guardados = 0;

    try {
      await cliente.post('/inasistencias/confirmar-dia', {
        divisionId: parseInt(divisionSeleccionada),
        cicloLectivo,
        fecha,
        huboClase: true
      });
      // El día ya queda confirmado en el servidor desde acá, aunque después falle
      // el guardado de algún alumno puntual — reflejarlo ya mismo evita que el aviso
      // de "todavía no fue cargado" quede desactualizado.
      setDiaYaConfirmado(true);

      for (const [alumnoId, marca] of alumnosConMarcas) {
        await cliente.post('/inasistencias', {
          alumnoId: parseInt(alumnoId),
          divisionId: parseInt(divisionSeleccionada),
          cicloLectivo,
          fecha,
          ...marca
        });
        delete marcasRestantes[alumnoId];
        guardados++;
        setMarcas({ ...marcasRestantes });
      }

      setMensajeExito(
        alumnosConMarcas.length > 0
          ? `Parte del ${fecha} guardado: ${alumnosConMarcas.length} novedades registradas`
          : `Parte del ${fecha} guardado: sin novedades, todos presentes`
      );
    } catch (err) {
      if (guardados > 0) {
        setError(
          `${err.response?.data?.error || 'Falló el guardado de un alumno'} — se guardaron ${guardados} de ${alumnosConMarcas.length} novedades. ` +
          'Las que quedaron pendientes siguen marcadas arriba: podés reintentar sin duplicar las que ya se guardaron.'
        );
      } else {
        setError(err.response?.data?.error || 'No se pudo guardar el parte del día');
      }
    } finally {
      setGuardando(false);
    }
  }

  function abrirJustificarEvento(evento) {
    setEventoEnEdicionId(evento.id);
    setMotivoEdicion(evento.motivoJustificacion || '');
    setError('');
  }

  function cancelarJustificarEvento() {
    setEventoEnEdicionId(null);
    setMotivoEdicion('');
  }

  async function guardarJustificarEvento(evento) {
    try {
      await cliente.put(`/inasistencias/${evento.id}/justificar`, { justificada: true, motivo: motivoEdicion });
      cancelarJustificarEvento();
      cargarEventosResumen();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo justificar la inasistencia');
    }
  }

  async function quitarJustificacion(evento) {
    try {
      await cliente.put(`/inasistencias/${evento.id}/justificar`, { justificada: false });
      cargarEventosResumen();
    } catch (err) {
      setError('No se pudo quitar la justificación');
    }
  }

  async function justificarRango(evento) {
    evento.preventDefault();
    if (!alumnoResumen || !rango.fechaInicio || !rango.fechaFin) {
      setError('Completá fecha de inicio y fecha de fin para justificar el rango');
      return;
    }
    setError('');
    try {
      const respuesta = await cliente.put('/inasistencias/justificar-rango', {
        alumnoId: parseInt(alumnoResumen),
        fechaInicio: rango.fechaInicio,
        fechaFin: rango.fechaFin,
        motivo: rango.motivo
      });
      setMensajeExito(`Se justificaron ${respuesta.data.actualizados} día(s) entre ${rango.fechaInicio} y ${rango.fechaFin}`);
      setRango({ fechaInicio: '', fechaFin: '', motivo: '' });
      cargarEventosResumen();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo justificar el rango');
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Inasistencias — Ciclo {cicloLectivo}</h1>
      </div>

      <div className="cargos-tabs">
        <button
          className={vista === 'parte' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('parte')}
        >
          Parte diario
        </button>
        <button
          className={vista === 'resumen' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('resumen')}
        >
          Resumen
        </button>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {vista === 'resumen' ? (
        <>
          <div className="cargos-subtabs-contenedor">
            <span className="cargos-subtabs-etiqueta">Ver</span>
            <div className="cargos-tabs cargos-tabs-secundarias">
              <button
                className={modoResumen === 'division' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
                onClick={() => { setModoResumen('division'); setEventosResumen([]); }}
              >
                Por división
              </button>
              <button
                className={modoResumen === 'alumno' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
                onClick={() => { setModoResumen('alumno'); setEventosResumen([]); }}
              >
                Por alumno
              </button>
            </div>
          </div>

          <div className="alumnos-formulario">
            {modoResumen === 'division' ? (
              <div className="alumnos-formulario-fila">
                <div>
                  <label>División</label>
                  <select value={divisionResumen} onChange={(e) => setDivisionResumen(e.target.value)}>
                    <option value="">Seleccioná una división</option>
                    {divisionesOrdenadas.map((division) => (
                      <option key={division.id} value={division.id}>{division.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="alumnos-formulario-fila">
                <div>
                  <label>Alumno</label>
                  <input
                    type="text"
                    placeholder="Buscar por apellido..."
                    value={busquedaAlumnoResumen}
                    onChange={(e) => setBusquedaAlumnoResumen(e.target.value)}
                    style={{ marginBottom: '6px' }}
                  />
                  <select value={alumnoResumen} onChange={(e) => setAlumnoResumen(e.target.value)}>
                    <option value="">Seleccioná un alumno</option>
                    {alumnosFiltrados.map((alumno) => (
                      <option key={alumno.id} value={alumno.id}>{alumno.apellido}, {alumno.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {cargandoResumen ? (
            <p>Cargando...</p>
          ) : modoResumen === 'division' ? (
            !divisionResumen ? (
              <p className="alumnos-vacio">Elegí una división para ver el resumen.</p>
            ) : alumnosDivisionResumen.length === 0 ? (
              <p className="alumnos-vacio">No hay alumnos cargados en esa división para este ciclo.</p>
            ) : (
              <table className="alumnos-tabla">
                <thead>
                  <tr>
                    <th>Alumno</th>
                    <th>Total</th>
                    <th>Justificadas</th>
                    <th>Sin justificar</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenPorAlumno.map(({ alumno, total, justificadas, sinJustificar }) => (
                    <tr key={alumno.id}>
                      <td>{alumno.apellido}, {alumno.nombre}</td>
                      <td>{total}</td>
                      <td>{justificadas}</td>
                      <td>
                        <span className={sinJustificar > 0 ? 'inasistencias-sin-justificar-alerta' : undefined}>
                          {sinJustificar}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : !alumnoResumen ? (
            <p className="alumnos-vacio">Elegí un alumno para ver su historial de inasistencias.</p>
          ) : (
            <>
              <p className="inasistencias-resumen-totales">
                <strong>{alumnoResumenObj?.apellido}, {alumnoResumenObj?.nombre}</strong> — Total: {totalAlumnoResumen} ·
                Justificadas: {justificadasAlumnoResumen} · Sin justificar: {Math.round((totalAlumnoResumen - justificadasAlumnoResumen) * 100) / 100}
              </p>

              <form onSubmit={justificarRango} className="alumnos-formulario inasistencias-form-rango">
                <p className="boletines-panel-plan-titulo">Justificar un rango de días (ej. 5 días seguidos)</p>
                <div className="alumnos-formulario-fila">
                  <div>
                    <label>Desde</label>
                    <input
                      type="date"
                      value={rango.fechaInicio}
                      onChange={(e) => setRango({ ...rango, fechaInicio: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label>Hasta</label>
                    <input
                      type="date"
                      value={rango.fechaFin}
                      onChange={(e) => setRango({ ...rango, fechaFin: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label>Motivo</label>
                    <input
                      type="text"
                      placeholder="Ej: certificado médico"
                      value={rango.motivo}
                      onChange={(e) => setRango({ ...rango, motivo: e.target.value })}
                    />
                  </div>
                </div>
                <button type="submit">Justificar rango</button>
              </form>

              {eventosDelAlumnoOrdenados.length === 0 ? (
                <p className="alumnos-vacio">Este alumno no tiene inasistencias registradas este ciclo.</p>
              ) : (
                <table className="alumnos-tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Justificada</th>
                      <th>Motivo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventosDelAlumnoOrdenados.map((evento) => (
                      eventoEnEdicionId === evento.id ? (
                        <tr key={evento.id}>
                          <td colSpan={5}>
                            <div className="alumnos-formulario-fila" style={{ alignItems: 'flex-end' }}>
                              <div>
                                <label>Motivo</label>
                                <input
                                  type="text"
                                  placeholder="Ej: certificado médico"
                                  value={motivoEdicion}
                                  onChange={(e) => setMotivoEdicion(e.target.value)}
                                />
                              </div>
                              <span className="alumnos-promover-acciones">
                                <button onClick={() => guardarJustificarEvento(evento)}>Guardar</button>
                                <button onClick={cancelarJustificarEvento}>Cancelar</button>
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={evento.id}>
                          <td>{formatearFecha(evento.fecha)}</td>
                          <td>{tipoEvento(evento)}</td>
                          <td>
                            <span className={`materiasadeudadas-estado ${evento.justificada ? 'materiasadeudadas-estado-aprobada' : 'materiasadeudadas-estado-trasladada'}`}>
                              {evento.justificada ? 'Justificada' : 'Sin justificar'}
                            </span>
                          </td>
                          <td>{evento.motivoJustificacion || '-'}</td>
                          <td>
                            <span className="materiasadeudadas-acciones">
                              {evento.justificada ? (
                                <button onClick={() => quitarJustificacion(evento)}>Quitar justificación</button>
                              ) : (
                                <button onClick={() => abrirJustificarEvento(evento)}>Justificar</button>
                              )}
                            </span>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="alumnos-formulario">
            <div className="alumnos-formulario-fila">
              <div>
                <label>División</label>
                <select
                  value={divisionSeleccionada}
                  onChange={(e) => { setDivisionSeleccionada(e.target.value); setMarcas({}); }}
                >
                  <option value="">Seleccioná una división</option>
                  {divisionesOrdenadas.map((division) => (
                    <option key={division.id} value={division.id}>{division.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
            </div>

            {verificandoDia && (
              <p className="inasistencias-aviso-verificando">Verificando si este día ya fue cargado...</p>
            )}
            {!verificandoDia && diaYaConfirmado === true && (
              <p className="inasistencias-aviso-ya-cargado">
                ⚠️ Este día ya fue cargado para esta división. Si guardás de nuevo, se actualiza lo existente.
              </p>
            )}
            {!verificandoDia && diaYaConfirmado === false && (
              <p className="inasistencias-aviso-pendiente">Este día todavía no fue cargado.</p>
            )}
          </div>

          {cargandoAlumnos ? (
            <p>Cargando alumnos...</p>
          ) : !divisionSeleccionada || !fecha ? (
            <p className="alumnos-vacio">Elegí una división y una fecha para cargar el parte del día.</p>
          ) : alumnosDelCurso.length === 0 ? (
            <p className="alumnos-vacio">No hay alumnos cargados en esa división para este ciclo.</p>
          ) : (
            <>
              <table className="alumnos-tabla inasistencias-tabla-curso">
                <thead>
                  <tr>
                    <th>Alumno</th>
                    <th>Ausente todo el día</th>
                    <th>Llegada tarde</th>
                    <th>Ausente Ed. Física</th>
                  </tr>
                </thead>
                <tbody>
                  {alumnosDelCurso.map((alumno) => {
                    const marca = marcas[alumno.id] || {
                      ausenteTodoElDia: false, llegadaTarde: false, ausenteEducFisica: false
                    };
                    return (
                      <tr key={alumno.id}>
                        <td>{alumno.apellido}, {alumno.nombre}</td>
                        <td className="inasistencias-celda-check">
                          <input
                            type="checkbox"
                            checked={marca.ausenteTodoElDia}
                            onChange={(e) => actualizarMarca(alumno.id, 'ausenteTodoElDia', e.target.checked)}
                          />
                        </td>
                        <td className="inasistencias-celda-check">
                          <input
                            type="checkbox"
                            checked={marca.llegadaTarde}
                            disabled={marca.ausenteTodoElDia}
                            onChange={(e) => actualizarMarca(alumno.id, 'llegadaTarde', e.target.checked)}
                          />
                        </td>
                        <td className="inasistencias-celda-check">
                          <input
                            type="checkbox"
                            checked={marca.ausenteEducFisica}
                            disabled={marca.ausenteTodoElDia}
                            onChange={(e) => actualizarMarca(alumno.id, 'ausenteEducFisica', e.target.checked)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <button
                className="inasistencias-boton-guardar"
                onClick={guardarParteDelDia}
                disabled={guardando}
              >
                {guardando ? 'Guardando...' : 'Guardar parte del día'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Inasistencias;
