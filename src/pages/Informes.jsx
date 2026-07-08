import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './MateriasAdeudadas.css';
import './Informes.css';

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

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaGeneral, respuestaPorDivision, respuestaPersonal, respuestaBoletines] = await Promise.all([
        cliente.get('/informes/general', { params: { cicloLectivo } }),
        cliente.get('/informes/por-division', { params: { cicloLectivo } }),
        cliente.get('/informes/personal', { params: { cicloLectivo } }),
        cliente.get('/informes/boletines', { params: { cicloLectivo } })
      ]);
      setGeneral(respuestaGeneral.data);
      setPorDivision(respuestaPorDivision.data);
      setPersonal(respuestaPersonal.data);
      setBoletines(respuestaBoletines.data);
    } catch (err) {
      setError('No se pudo cargar la información de informes');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (esSecretaria) cargarDatos();
  }, [cicloLectivo, esSecretaria]);

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
        </>
      )}
    </div>
  );
}

export default Informes;
