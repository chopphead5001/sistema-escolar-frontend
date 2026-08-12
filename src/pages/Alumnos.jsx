import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';

function Alumnos() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [alumnos, setAlumnos] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoAlumno, setNuevoAlumno] = useState({
    dni: '', nombre: '', apellido: '', divisionId: '', cicloLectivo
  });
  const [guardando, setGuardando] = useState(false);

  const [promoviendoId, setPromoviendoId] = useState(null);
  const [divisionDestino, setDivisionDestino] = useState('');
  const [divisionDestinoPorGrupo, setDivisionDestinoPorGrupo] = useState({});

  const [dandoDeBajaId, setDandoDeBajaId] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState('');

  const [grupoSobreArrastre, setGrupoSobreArrastre] = useState(null);

  async function cargarAlumnos() {
    setCargando(true);
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
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarAlumnos();
  }, []);

  useEffect(() => {
    setNuevoAlumno((anterior) => ({ ...anterior, cicloLectivo }));
  }, [cicloLectivo]);

  async function manejarAlta(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await cliente.post('/alumnos', nuevoAlumno);
      setNuevoAlumno({ dni: '', nombre: '', apellido: '', divisionId: '', cicloLectivo });
      setMostrarFormulario(false);
      cargarAlumnos();
    } catch (err) {
      setError('No se pudo dar de alta al alumno. Revisá los datos.');
    } finally {
      setGuardando(false);
    }
  }

  function matriculaActivaDelCiclo(alumno) {
    return alumno.matriculas.find(
      (m) => m.cicloLectivo === cicloLectivo && m.activa !== false
    );
  }

  const alumnosDelCiclo = alumnos.filter((alumno) => !!matriculaActivaDelCiclo(alumno));

  // Agrupado por divisionId (no por nombre): el drag and drop necesita el id y el
  // año de cada división para saber a dónde se puede soltar un alumno.
  const gruposDelCiclo = {};
  // Sembrado con TODAS las divisiones activas primero: aunque una división esté
  // vacía (0 alumnos todavía), tiene que aparecer igual como destino válido para
  // arrastrar un alumno ahí — si no, nunca se podría mover a alguien a un salón
  // que no tuviera ya al menos un alumno cargado.
  divisiones.filter((d) => d.activa).forEach((division) => {
    gruposDelCiclo[division.id] = { division, alumnos: [] };
  });
  alumnosDelCiclo.forEach((alumno) => {
    const matricula = matriculaActivaDelCiclo(alumno);
    const divisionId = matricula?.divisionId;
    if (divisionId == null) return;
    // Puede ser una división ya inactiva (el alumno sigue matriculado ahí igual):
    // se muestra su grupo aunque no haya sido sembrado arriba.
    if (!gruposDelCiclo[divisionId]) gruposDelCiclo[divisionId] = { division: matricula.division || null, alumnos: [] };
    gruposDelCiclo[divisionId].alumnos.push(alumno);
  });
  const idsDivisionesDelCicloOrdenados = Object.keys(gruposDelCiclo).sort((a, b) => {
    const divisionA = gruposDelCiclo[a].division;
    const divisionB = gruposDelCiclo[b].division;
    if (!divisionA || !divisionB) return 0;
    return divisionA.anio !== divisionB.anio ? divisionA.anio - divisionB.anio : divisionA.nombre.localeCompare(divisionB.nombre);
  });

  const alumnosParaPromover = alumnos.filter((alumno) => {
    const yaTieneEsteCiclo = alumno.matriculas.some((m) => m.cicloLectivo === cicloLectivo);
    const teniaCicloAnteriorActivo = alumno.matriculas.some(
      (m) => m.cicloLectivo === cicloLectivo - 1 && m.activa !== false
    );
    return !yaTieneEsteCiclo && teniaCicloAnteriorActivo;
  });

  const divisionesOrdenadas = [...divisiones]
    .filter((d) => d.activa)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const gruposParaPromover = {};
  alumnosParaPromover.forEach((alumno) => {
    const matriculaAnterior = alumno.matriculas.find((m) => m.cicloLectivo === cicloLectivo - 1);
    const divisionOrigen = matriculaAnterior?.division?.nombre || 'Sin división';
    if (!gruposParaPromover[divisionOrigen]) gruposParaPromover[divisionOrigen] = [];
    gruposParaPromover[divisionOrigen].push(alumno);
  });
  const divisionesOrigenOrdenadas = Object.keys(gruposParaPromover).sort();

  async function promoverAlumno(alumnoId) {
    if (!divisionDestino) {
      setError('Elegí la división de destino antes de confirmar');
      return;
    }
    try {
      await cliente.post(`/alumnos/${alumnoId}/promover`, {
        cicloLectivo,
        divisionId: divisionDestino
      });
      setMensajeExito('Alumno promovido correctamente');
      setPromoviendoId(null);
      setDivisionDestino('');
      cargarAlumnos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo promover al alumno');
    }
  }

  async function promoverGrupoCompleto(divisionOrigen) {
    const destino = divisionDestinoPorGrupo[divisionOrigen];
    if (!destino) {
      setError('Elegí la división de destino para este grupo antes de confirmar');
      return;
    }
    const alumnosDelGrupo = gruposParaPromover[divisionOrigen];
    const nombreDestino = divisiones.find((d) => d.id === parseInt(destino))?.nombre || destino;
    setError('');
    let promovidos = 0;
    try {
      for (const alumno of alumnosDelGrupo) {
        await cliente.post(`/alumnos/${alumno.id}/promover`, {
          cicloLectivo,
          divisionId: destino
        });
        promovidos++;
      }
      setMensajeExito(`Se promovieron ${alumnosDelGrupo.length} alumnos de ${divisionOrigen} a ${nombreDestino}`);
    } catch (err) {
      if (promovidos > 0) {
        setError(
          `Se promovieron ${promovidos} de ${alumnosDelGrupo.length} alumnos de ${divisionOrigen} antes de que fallara uno. ` +
          'Revisá el listado (los que ya se promovieron van a desaparecer de este panel) antes de reintentar con el resto.'
        );
      } else {
        setError(err.response?.data?.error || 'No se pudo promover al grupo completo');
      }
    } finally {
      cargarAlumnos();
    }
  }

  async function confirmarBaja(alumnoId, motivo) {
    const motivoFinal = motivo || motivoBaja;
    if (!motivoFinal || !motivoFinal.trim()) {
      setError('Indicá un motivo de baja (egreso, cambio de escuela, etc.)');
      return;
    }
    try {
      await cliente.put(`/alumnos/${alumnoId}/baja`, { motivo: motivoFinal });
      setMensajeExito('Alumno dado de baja correctamente');
      setDandoDeBajaId(null);
      setMotivoBaja('');
      cargarAlumnos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo dar de baja al alumno');
    }
  }

  function manejarDragStartAlumno(evento, alumno, divisionOrigenId) {
    evento.dataTransfer.effectAllowed = 'move';
    evento.dataTransfer.setData('application/json', JSON.stringify({
      alumnoId: alumno.id,
      nombreAlumno: `${alumno.apellido}, ${alumno.nombre}`,
      divisionOrigenId
    }));
  }

  async function manejarDropEnGrupo(evento, divisionDestinoId) {
    evento.preventDefault();
    setGrupoSobreArrastre(null);
    const datos = evento.dataTransfer.getData('application/json');
    if (!datos) return;
    const { alumnoId, nombreAlumno, divisionOrigenId } = JSON.parse(datos);
    if (divisionOrigenId === divisionDestinoId) return;

    const divisionOrigen = gruposDelCiclo[divisionOrigenId]?.division;
    const divisionDestino = gruposDelCiclo[divisionDestinoId]?.division;
    if (!divisionOrigen || !divisionDestino) return;

    if (divisionOrigen.anio !== divisionDestino.anio) {
      window.alert('Solo se puede cambiar de división dentro del mismo año.');
      return;
    }

    if (!window.confirm(
      `¿Confirmás que querés pasar a ${nombreAlumno} de ${divisionOrigen.nombre} a ${divisionDestino.nombre}?\n\n` +
      `Sus notas y asistencias ya cargadas en ${divisionOrigen.nombre} quedan intactas ahí (no se borran ni se mueven); ` +
      `de ahora en más va a aparecer en ${divisionDestino.nombre}.`
    )) return;

    setError('');
    try {
      await cliente.put(`/alumnos/${alumnoId}/cambiar-division`, { divisionId: divisionDestinoId, cicloLectivo });
      setMensajeExito(`${nombreAlumno} pasó a ${divisionDestino.nombre}`);
      cargarAlumnos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar de división al alumno');
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Alumnos — Ciclo {cicloLectivo}</h1>
        {esSecretaria && (
          <button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
            {mostrarFormulario ? 'Cancelar' : '+ Nuevo alumno'}
          </button>
        )}
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
                value={nuevoAlumno.dni}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, dni: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Nombre</label>
              <input
                type="text"
                value={nuevoAlumno.nombre}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, nombre: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Apellido</label>
              <input
                type="text"
                value={nuevoAlumno.apellido}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, apellido: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="alumnos-formulario-fila">
            <div>
              <label>División</label>
              <select
                value={nuevoAlumno.divisionId}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, divisionId: e.target.value })}
                required
              >
                <option value="">Seleccioná una división</option>
                {divisionesOrdenadas.map((division) => (
                  <option key={division.id} value={division.id}>{division.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Ciclo lectivo</label>
              <input
                type="number"
                value={nuevoAlumno.cicloLectivo}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, cicloLectivo: parseInt(e.target.value) })}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar alumno'}
          </button>
        </form>
      )}

      {esSecretaria && alumnosParaPromover.length > 0 && (
        <div className="alumnos-panel-promover">
          <p className="alumnos-panel-promover-titulo">
            {alumnosParaPromover.length} alumno(s) del ciclo {cicloLectivo - 1} todavía no fueron promovidos a {cicloLectivo}:
          </p>

          {divisionesOrigenOrdenadas.map((divisionOrigen) => (
            <div key={divisionOrigen} className="alumnos-grupo-promover">
              <div className="alumnos-grupo-promover-encabezado">
                <h3>{divisionOrigen} ({gruposParaPromover[divisionOrigen].length} alumnos)</h3>
                <div className="alumnos-promover-acciones">
                  <select
                    value={divisionDestinoPorGrupo[divisionOrigen] || ''}
                    onChange={(e) => setDivisionDestinoPorGrupo({
                      ...divisionDestinoPorGrupo,
                      [divisionOrigen]: e.target.value
                    })}
                  >
                    <option value="">Nueva división para todos...</option>
                    {divisionesOrdenadas.map((division) => (
                      <option key={division.id} value={division.id}>{division.nombre}</option>
                    ))}
                  </select>
                  <button onClick={() => promoverGrupoCompleto(divisionOrigen)}>
                    Promover grupo completo
                  </button>
                </div>
              </div>

              <ul className="alumnos-lista-promover">
                {gruposParaPromover[divisionOrigen].map((alumno) => (
                  <li key={alumno.id}>
                    <span>{alumno.apellido}, {alumno.nombre}</span>
                    {promoviendoId === alumno.id ? (
                      <span className="alumnos-promover-acciones">
                        <select value={divisionDestino} onChange={(e) => setDivisionDestino(e.target.value)}>
                          <option value="">Nueva división...</option>
                          {divisionesOrdenadas.map((division) => (
                            <option key={division.id} value={division.id}>{division.nombre}</option>
                          ))}
                        </select>
                        <button onClick={() => promoverAlumno(alumno.id)}>Confirmar</button>
                        <button onClick={() => { setPromoviendoId(null); setDivisionDestino(''); }}>Cancelar</button>
                      </span>
                    ) : (
                      <span className="alumnos-promover-acciones">
                        <button onClick={() => { setPromoviendoId(alumno.id); setDivisionDestino(''); }}>Promover</button>
                        <button onClick={() => {
                          const motivo = window.prompt('Motivo de baja (egreso, cambio de escuela, etc.):');
                          if (motivo) confirmarBaja(alumno.id, motivo);
                        }}>
                          Dar de baja
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {esSecretaria && alumnosDelCiclo.length > 0 && (
        <p className="alumnos-aviso-arrastre">
          Arrastrá un alumno a otra división para cambiarlo de salón (solo dentro del mismo año).
        </p>
      )}

      {cargando ? (
        <p>Cargando alumnos...</p>
      ) : alumnosDelCiclo.length === 0 ? (
        <p className="alumnos-vacio">No hay alumnos matriculados en el ciclo {cicloLectivo}.</p>
      ) : (
        idsDivisionesDelCicloOrdenados.map((divisionId) => {
          const grupo = gruposDelCiclo[divisionId];
          return (
            <div
              key={divisionId}
              className={`alumnos-grupo-listado ${grupoSobreArrastre === divisionId ? 'alumnos-grupo-listado-sobre-arrastre' : ''}`}
              onDragOver={(e) => { if (esSecretaria) e.preventDefault(); }}
              onDragEnter={() => { if (esSecretaria) setGrupoSobreArrastre(divisionId); }}
              onDragLeave={(e) => {
                if (!esSecretaria) return;
                if (e.currentTarget.contains(e.relatedTarget)) return;
                setGrupoSobreArrastre((actual) => (actual === divisionId ? null : actual));
              }}
              onDrop={(e) => { if (esSecretaria) manejarDropEnGrupo(e, divisionId); }}
            >
              <h3 className="alumnos-grupo-listado-titulo">
                {grupo.division?.nombre || 'Sin división'} ({grupo.alumnos.length} alumnos)
              </h3>
              {grupo.alumnos.length === 0 ? (
                <p className="alumnos-vacio">Sin alumnos todavía — se puede soltar uno acá.</p>
              ) : (
              <table className="alumnos-tabla">
                <thead>
                  <tr>
                    <th>DNI</th>
                    <th>Apellido y nombre</th>
                    <th>Ciclo</th>
                    {esSecretaria && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {grupo.alumnos.map((alumno) => (
                    <tr
                      key={alumno.id}
                      className={esSecretaria ? 'alumnos-fila-arrastrable' : undefined}
                      draggable={esSecretaria}
                      onDragStart={(e) => manejarDragStartAlumno(e, alumno, divisionId)}
                    >
                      <td>{alumno.dni}</td>
                      <td>{alumno.apellido}, {alumno.nombre}</td>
                      <td>{cicloLectivo}</td>
                      {esSecretaria && (
                        <td>
                          {dandoDeBajaId === alumno.id ? (
                            <span className="alumnos-promover-acciones">
                              <input
                                type="text"
                                placeholder="Motivo (egreso, cambio de escuela...)"
                                value={motivoBaja}
                                onChange={(e) => setMotivoBaja(e.target.value)}
                              />
                              <button onClick={() => confirmarBaja(alumno.id)}>Confirmar baja</button>
                              <button onClick={() => { setDandoDeBajaId(null); setMotivoBaja(''); }}>Cancelar</button>
                            </span>
                          ) : (
                            <button onClick={() => { setDandoDeBajaId(alumno.id); setMotivoBaja(''); }}>Dar de baja</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default Alumnos;