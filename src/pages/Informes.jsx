import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './MateriasAdeudadas.css';
import './Informes.css';

// Mismo criterio de ponderación que usa Inasistencias.jsx (Resumen): 1 día
// completo, 0.25 llegada tarde, 0.5 ausente ed. física — se repite acá porque
// no hay un módulo compartido de utilidades en este proyecto.
function pesoEvento(evento) {
  if (evento.ausenteTodoElDia) return 1;
  let peso = 0;
  if (evento.llegadaTarde) peso += 0.25;
  if (evento.ausenteEducFisica) peso += 0.5;
  return peso;
}

const etiquetaModalidadFicha = { INTENSIFICA: 'Intensifica', RECURSA: 'Recursa', PENDIENTE: 'Pendiente (1° vez)' };

function Informes() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [general, setGeneral] = useState(null);
  const [porDivision, setPorDivision] = useState([]);
  const [personal, setPersonal] = useState(null);
  const [boletines, setBoletines] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [alumnos, setAlumnos] = useState([]);
  const [busquedaFicha, setBusquedaFicha] = useState('');
  const [alumnoFichaId, setAlumnoFichaId] = useState(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [ficha, setFicha] = useState(null);

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaGeneral, respuestaPorDivision, respuestaPersonal, respuestaBoletines, respuestaAlumnos] = await Promise.all([
        cliente.get('/informes/general', { params: { cicloLectivo } }),
        cliente.get('/informes/por-division', { params: { cicloLectivo } }),
        cliente.get('/informes/personal', { params: { cicloLectivo } }),
        cliente.get('/informes/boletines', { params: { cicloLectivo } }),
        cliente.get('/alumnos')
      ]);
      setGeneral(respuestaGeneral.data);
      setPorDivision(respuestaPorDivision.data);
      setPersonal(respuestaPersonal.data);
      setBoletines(respuestaBoletines.data);
      setAlumnos(respuestaAlumnos.data);
    } catch (err) {
      setError('No se pudo cargar la información de informes');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (esSecretaria) cargarDatos();
  }, [cicloLectivo, esSecretaria]);

  async function abrirFicha(alumnoId) {
    setAlumnoFichaId(alumnoId);
    setCargandoFicha(true);
    setFicha(null);
    try {
      const [respuestaCalificaciones, respuestaAdeudadas, respuestaInasistencias] = await Promise.all([
        cliente.get('/boletines/calificaciones', { params: { alumnoId, cicloLectivo } }),
        cliente.get('/materias-adeudadas', { params: { alumnoId } }),
        cliente.get('/inasistencias', { params: { alumnoId, cicloLectivo } })
      ]);
      setFicha({
        calificaciones: respuestaCalificaciones.data,
        adeudadas: respuestaAdeudadas.data,
        eventos: respuestaInasistencias.data
      });
    } catch (err) {
      setError('No se pudo cargar la ficha del alumno');
    } finally {
      setCargandoFicha(false);
    }
  }

  function cerrarFicha() {
    setAlumnoFichaId(null);
    setFicha(null);
    setBusquedaFicha('');
  }

  function matriculaActivaDe(alumno) {
    return alumno?.matriculas?.find((m) => m.cicloLectivo === cicloLectivo && m.activa);
  }

  const alumnoFicha = alumnos.find((a) => a.id === alumnoFichaId);
  const matriculaFicha = matriculaActivaDe(alumnoFicha);

  const alumnosFiltradosFicha = busquedaFicha.trim()
    ? alumnos.filter((a) => `${a.apellido} ${a.nombre}`.toLowerCase().includes(busquedaFicha.trim().toLowerCase()))
    : [];

  const calificacionesPorMateria = {};
  if (ficha) {
    for (const c of ficha.calificaciones) {
      if (!calificacionesPorMateria[c.materiaId]) {
        calificacionesPorMateria[c.materiaId] = { materia: c.materia.nombre, c1: null, c2: null, condicion: c.condicion };
      }
      if (c.cuatrimestre === 1) calificacionesPorMateria[c.materiaId].c1 = c.notaCuatrimestre;
      if (c.cuatrimestre === 2) calificacionesPorMateria[c.materiaId].c2 = c.notaCuatrimestre;
    }
  }
  const filasCalificaciones = Object.values(calificacionesPorMateria).sort((a, b) => a.materia.localeCompare(b.materia));

  const adeudadasActivasFicha = ficha?.adeudadas.filter((d) => d.estado === 'CCA' || d.estado === 'CSA') || [];
  const adeudadasHistorialFicha = ficha?.adeudadas.filter((d) => d.estado === 'APROBADA' || d.estado === 'TRASLADADA') || [];

  const totalInasistenciasFicha = ficha ? ficha.eventos.reduce((acc, e) => acc + pesoEvento(e), 0) : 0;
  const justificadasFicha = ficha ? ficha.eventos.reduce((acc, e) => acc + (e.justificada ? pesoEvento(e) : 0), 0) : 0;

  if (!esSecretaria) {
    return (
      <div className="alumnos-pagina">
        <h1>Informes</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="alumnos-pagina informes-pagina">
      <div className="alumnos-encabezado">
        <h1>Informes — Ciclo {cicloLectivo}</h1>
      </div>

      {error && <div className="alumnos-error">{error}</div>}

      {cargando ? (
        <p>Cargando informes...</p>
      ) : (
        <>
          <div className="informes-kpis">
            <div className="informes-kpi-tile">
              <span className="informes-kpi-valor">{general?.alumnosMatriculados ?? 0}</span>
              <span className="informes-kpi-etiqueta">Alumnos matriculados</span>
            </div>
            <div className="informes-kpi-tile">
              <span className="informes-kpi-valor">{general?.divisionesActivas ?? 0}</span>
              <span className="informes-kpi-etiqueta">Divisiones activas</span>
            </div>
            <div className="informes-kpi-tile">
              <span className="informes-kpi-valor">{general?.personalActivo ?? 0}</span>
              <span className="informes-kpi-etiqueta">Personal activo</span>
            </div>
            <div className="informes-kpi-tile">
              <span className="informes-kpi-valor">{general?.cargosVigentes ?? 0}</span>
              <span className="informes-kpi-etiqueta">Cargos vigentes</span>
            </div>
            <div className="informes-kpi-tile">
              <span className="informes-kpi-valor">{general?.licenciasActivasHoy ?? 0}</span>
              <span className="informes-kpi-etiqueta">Licencias activas hoy</span>
            </div>
            <div className="informes-kpi-tile informes-kpi-alerta">
              <span className="informes-kpi-valor">{general?.alumnosEnRiesgo ?? 0}</span>
              <span className="informes-kpi-etiqueta">Alumnos en riesgo</span>
            </div>
          </div>

          <section className="informes-seccion">
            <h2>Resumen por división</h2>
            {porDivision.length === 0 ? (
              <p className="alumnos-vacio">No hay divisiones activas.</p>
            ) : (
              <table className="alumnos-tabla">
                <thead>
                  <tr>
                    <th>División</th>
                    <th>Alumnos</th>
                    <th>Cargos asignados</th>
                    <th>Alumnos en riesgo</th>
                    <th>Inasistencias ponderadas</th>
                    <th>Promedio por alumno</th>
                  </tr>
                </thead>
                <tbody>
                  {porDivision.map((d) => (
                    <tr key={d.divisionId}>
                      <td>{d.division}</td>
                      <td>{d.alumnosMatriculados}</td>
                      <td>{d.cargosAsignados}</td>
                      <td>
                        {d.alumnosEnRiesgo > 0
                          ? <span className="materiasadeudadas-alerta-edt">{d.alumnosEnRiesgo}</span>
                          : 0}
                      </td>
                      <td>{d.inasistenciasPonderadasTotal}</td>
                      <td>{d.inasistenciasPonderadasPromedio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="informes-seccion">
            <h2>Personal y licencias</h2>
            <div className="informes-tarjetas">
              {personal?.personalPorTipo.map((p) => (
                <div key={p.tipo} className="informes-tarjeta">
                  <span className="informes-tarjeta-valor">{p.cantidad}</span>
                  <span className="informes-tarjeta-etiqueta">{p.tipo}</span>
                </div>
              ))}
            </div>
            <p className="informes-subtitulo">
              {personal?.cargosVigentes} cargos vigentes — {personal?.licenciasDelCiclo} licencias registradas en el ciclo
            </p>

            <h3>Licencias activas hoy</h3>
            {personal?.licenciasActivasHoy.length === 0 ? (
              <p className="alumnos-vacio">No hay licencias activas hoy.</p>
            ) : (
              <table className="alumnos-tabla">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Tipo</th>
                    <th>División</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Suplente</th>
                  </tr>
                </thead>
                <tbody>
                  {personal?.licenciasActivasHoy.map((l) => (
                    <tr key={l.id}>
                      <td>{l.persona}</td>
                      <td>{l.tipoLicencia}</td>
                      <td>{l.division || '—'}</td>
                      <td>{new Date(l.fechaInicio).toLocaleDateString()}</td>
                      <td>{l.fechaFin ? new Date(l.fechaFin).toLocaleDateString() : 'En curso'}</td>
                      <td>{l.suplente || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3>Partes diarios del ciclo</h3>
            <p className="informes-subtitulo">
              {personal?.partesDiarios.total} partes cargados — {personal?.partesDiarios.conFalta} generaron falta
            </p>
            <ul className="informes-lista-simple">
              {personal?.partesDiarios.porCubierta.map((p) => (
                <li key={p.cubierta}>{p.cubierta || 'Sin especificar'}: {p.cantidad}</li>
              ))}
            </ul>
          </section>

          <section className="informes-seccion">
            <h2>Boletín y rendimiento académico</h2>
            {boletines?.porMateriaYDivision.length === 0 ? (
              <p className="alumnos-vacio">No hay calificaciones cargadas para este ciclo.</p>
            ) : (
              <table className="alumnos-tabla">
                <thead>
                  <tr>
                    <th>División</th>
                    <th>Materia</th>
                    <th>Promedio</th>
                    <th>Calificaciones cargadas</th>
                  </tr>
                </thead>
                <tbody>
                  {boletines?.porMateriaYDivision.map((m) => (
                    <tr key={`${m.divisionId}-${m.materiaId}`}>
                      <td>{m.division}</td>
                      <td>{m.materia}</td>
                      <td>{m.promedio ?? '—'}</td>
                      <td>{m.cantidadCalificaciones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3>Alumnos en riesgo por división (más de 4 materias adeudadas)</h3>
            <ul className="informes-lista-simple">
              {boletines?.alumnosEnRiesgoPorDivision.map((d) => (
                <li key={d.divisionId}>{d.division}: {d.cantidad}</li>
              ))}
            </ul>
          </section>

          <section className="informes-seccion">
            <h2>Ficha del alumno</h2>
            <p className="informes-subtitulo">
              Boletín, materias adeudadas e inasistencias del ciclo {cicloLectivo}, todo junto.
            </p>

            {!alumnoFichaId && (
              <div className="alumnos-formulario">
                <label>Buscar alumno</label>
                <input
                  type="text"
                  placeholder="Buscar por apellido o nombre..."
                  value={busquedaFicha}
                  onChange={(e) => setBusquedaFicha(e.target.value)}
                />
                {alumnosFiltradosFicha.length > 0 && (
                  <ul className="informes-lista-simple">
                    {alumnosFiltradosFicha.slice(0, 10).map((a) => (
                      <li key={a.id}>
                        <button onClick={() => abrirFicha(a.id)}>
                          {a.apellido}, {a.nombre}
                          {matriculaActivaDe(a) ? ` — ${matriculaActivaDe(a).division.nombre}` : ' — sin matrícula este ciclo'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {alumnoFichaId && (
              <div>
                <div className="alumnos-encabezado">
                  <h3>
                    {alumnoFicha ? `${alumnoFicha.apellido}, ${alumnoFicha.nombre}` : '...'}
                    {matriculaFicha && ` — ${matriculaFicha.division.nombre}`}
                  </h3>
                  <button onClick={cerrarFicha}>Cerrar ficha</button>
                </div>

                {cargandoFicha ? (
                  <p>Cargando ficha...</p>
                ) : ficha && (
                  <>
                    <h4>Boletín</h4>
                    {filasCalificaciones.length === 0 ? (
                      <p className="alumnos-vacio">No hay calificaciones cargadas este ciclo.</p>
                    ) : (
                      <table className="alumnos-tabla">
                        <thead>
                          <tr>
                            <th>Materia</th>
                            <th>Condición</th>
                            <th>1° cuatrimestre</th>
                            <th>2° cuatrimestre</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filasCalificaciones.map((f) => (
                            <tr key={f.materia}>
                              <td>{f.materia}</td>
                              <td>{f.condicion || '—'}</td>
                              <td>{f.c1 ?? '—'}</td>
                              <td>{f.c2 ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    <h4>Materias adeudadas activas</h4>
                    {adeudadasActivasFicha.length === 0 ? (
                      <p className="alumnos-vacio">No tiene materias adeudadas activas.</p>
                    ) : (
                      <table className="alumnos-tabla">
                        <thead>
                          <tr>
                            <th>Materia</th>
                            <th>Origen</th>
                            <th>Ciclo actual</th>
                            <th>Modalidad</th>
                            <th>Profesor a cargo</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adeudadasActivasFicha.map((d) => (
                            <tr key={d.id}>
                              <td>{d.materia.nombre}</td>
                              <td>{d.cicloOrigen} — {d.divisionOrigen?.nombre || '—'}</td>
                              <td>{d.cicloActual}</td>
                              <td>{etiquetaModalidadFicha[d.modalidad]}</td>
                              <td>
                                {d.cargoResponsable
                                  ? `${d.cargoResponsable.persona.apellido}, ${d.cargoResponsable.persona.nombre}`
                                  : '—'}
                              </td>
                              <td>
                                <span className={`materiasadeudadas-estado materiasadeudadas-estado-${d.estado.toLowerCase()}`}>
                                  {d.estado}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {adeudadasHistorialFicha.length > 0 && (
                      <>
                        <h4>Historial de materias adeudadas</h4>
                        <table className="alumnos-tabla">
                          <thead>
                            <tr>
                              <th>Materia</th>
                              <th>Origen</th>
                              <th>Ciclo actual</th>
                              <th>Modalidad</th>
                              <th>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adeudadasHistorialFicha.map((d) => (
                              <tr key={d.id}>
                                <td>{d.materia.nombre}</td>
                                <td>{d.cicloOrigen} — {d.divisionOrigen?.nombre || '—'}</td>
                                <td>{d.cicloActual}</td>
                                <td>{etiquetaModalidadFicha[d.modalidad]}</td>
                                <td>
                                  <span className={`materiasadeudadas-estado materiasadeudadas-estado-${d.estado.toLowerCase()}`}>
                                    {d.estado}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    <h4>Inasistencias</h4>
                    <p className="informes-subtitulo">
                      Total: {Math.round(totalInasistenciasFicha * 100) / 100} — Justificadas: {Math.round(justificadasFicha * 100) / 100} —
                      {' '}Sin justificar: {Math.round((totalInasistenciasFicha - justificadasFicha) * 100) / 100}
                    </p>
                    {ficha.eventos.length === 0 ? (
                      <p className="alumnos-vacio">No tiene eventos de inasistencia cargados este ciclo.</p>
                    ) : (
                      <table className="alumnos-tabla">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Detalle</th>
                            <th>Justificada</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...ficha.eventos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((e) => (
                            <tr key={e.id}>
                              <td>{e.fecha.slice(0, 10)}</td>
                              <td>
                                {e.ausenteTodoElDia ? 'Ausente (día completo)' : [
                                  e.llegadaTarde && 'Llegada tarde',
                                  e.ausenteEducFisica && 'Ausente Ed. Física'
                                ].filter(Boolean).join(', ') || '—'}
                              </td>
                              <td>{e.justificada ? 'Sí' : 'No'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default Informes;
