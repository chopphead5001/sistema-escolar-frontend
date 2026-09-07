import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Cargos.css';
import './MateriasAdeudadas.css';
import './Horarios.css';
import { MODULOS_DOCENTE, DIAS_SEMANA, ETIQUETA_TURNO, bloqueEsModuloFijo, bloqueEsContraturno, resumenHorario, colorMateria, colorMateriaEnAnio, construirMapaColoresPorAnio, licenciaVigenteEn } from '../constants/horarios';

// Resuelve, para un cargo "real" (no generado por otra licencia), quién lo
// ocupa en este momento: si tiene una licencia vigente hoy y existe un cargo
// de cobertura todavía vigente para ella, se baja a ese cargo — y se repite
// (por si ese cargo de cobertura a su vez tiene su propia licencia activa con
// su propio suplente, ver 2026-08-21 en CLAUDE.md). Si nadie lo cubre ahora,
// se queda en el cargo original. Así la grilla muestra un solo ocupante por
// cargo (el que realmente está hoy), no el historial completo de coberturas.
function cargoActivoAhora(cargoBase, todosLosCargos) {
  let actual = cargoBase;
  for (let profundidad = 0; profundidad < 10; profundidad++) {
    const licenciaActiva = (actual.licencias || []).find((l) => licenciaVigenteEn(l));
    if (!licenciaActiva) return actual;
    const cobertura = todosLosCargos.find((c) => c.origenLicenciaId === licenciaActiva.id && c.vigente);
    if (!cobertura) return actual;
    actual = cobertura;
  }
  return actual;
}

// Desde cualquier cargo de la cadena (el real, o cualquier nivel de
// cobertura), sube hasta encontrar el cargo real de origen — el que no fue
// generado por ninguna licencia.
function cargoBaseDeCadena(cargo, todosLosCargos) {
  let actual = cargo;
  for (let profundidad = 0; profundidad < 10 && actual.origenLicencia; profundidad++) {
    const base = todosLosCargos.find((c) => c.id === actual.origenLicencia.cargoId);
    if (!base) return actual;
    actual = base;
  }
  return actual;
}

// Toda la cadena actualmente activa a partir de un cargo cualquiera de esa
// cadena: el cargo real, más cada nivel de cobertura vigente (suplente,
// suplente del suplente, etc.). Un cambio de horario arrastrado sobre
// cualquiera de estos cargos representa un cambio de horario de "la clase" en
// sí — se aplica a todos por igual, titular incluido, para que no queden
// desincronizados entre sí.
function cadenaCompletaDe(cargoCualquiera, todosLosCargos) {
  const base = cargoBaseDeCadena(cargoCualquiera, todosLosCargos);
  const cadena = [base];
  let actual = base;
  for (let profundidad = 0; profundidad < 10; profundidad++) {
    const licenciaActiva = (actual.licencias || []).find((l) => licenciaVigenteEn(l));
    if (!licenciaActiva) break;
    const cobertura = todosLosCargos.find((c) => c.origenLicenciaId === licenciaActiva.id && c.vigente);
    if (!cobertura) break;
    cadena.push(cobertura);
    actual = cobertura;
  }
  return cadena;
}

// Un bloque entra a la grilla de módulos fijos solo si además de calzar con un
// módulo, cae en el turno propio de la división: uno que calce con un módulo
// pero del turno contrario sigue siendo contraturno (ver bloqueEsContraturno).
function bloquesAlineados(cargo, turnoDivision) {
  return (cargo.bloquesHorario || []).filter((b) => bloqueEsModuloFijo(b) && !bloqueEsContraturno(b, turnoDivision));
}

function bloquesSueltos(cargo, turnoDivision) {
  return (cargo.bloquesHorario || []).filter((b) => bloqueEsContraturno(b, turnoDivision));
}

function cargosEnCelda(listaCargos, dia, modulo, turnoDivision) {
  return listaCargos.filter((cargo) =>
    bloquesAlineados(cargo, turnoDivision).some((b) => b.diaSemana === dia && b.horaInicio === modulo.inicio && b.horaFin === modulo.fin)
  );
}

function modulosConDatosDe(listaCargos, turnoDivision) {
  return MODULOS_DOCENTE.filter((modulo) =>
    DIAS_SEMANA.some((dia) => cargosEnCelda(listaCargos, dia.valor, modulo, turnoDivision).length > 0)
  );
}

// Cargos/materias a contraturno: su horario cae en el turno contrario al de la
// división (esté o no alineado a un módulo fijo), así que no pueden compartir
// fila con los demás. Se agregan como filas propias al fondo de la misma
// grilla, una fila por cargo (no por bloque) para que un cargo con contraturno
// en varios días no ocupe varias filas: el horario de cada día se muestra
// dentro del mismo recuadro de profesor y materia, en la columna que le toca.
function filasSueltasDe(listaCargos, turnoDivision) {
  return listaCargos
    .filter((cargo) => bloquesSueltos(cargo, turnoDivision).length > 0)
    .map((cargo) => ({
      cargo,
      bloquesPorDia: Object.fromEntries(bloquesSueltos(cargo, turnoDivision).map((b) => [b.diaSemana, b]))
    }))
    .sort((a, b) => a.cargo.nombreCargo.localeCompare(b.cargo.nombreCargo));
}

function GrillaDivision({ division, cargos, onSoltar, bloqueada, mapaColores }) {
  const cargosBase = cargos.filter((c) => c.vigente && c.divisionId === division.id && !c.origenLicenciaId);
  const listaCargos = cargosBase.map((c) => cargoActivoAhora(c, cargos));
  const modulosConDatos = modulosConDatosDe(listaCargos, division.turno);
  const filasSueltas = filasSueltasDe(listaCargos, division.turno);
  const hayGrilla = modulosConDatos.length > 0 || filasSueltas.length > 0;
  const [celdaSobreArrastre, setCeldaSobreArrastre] = useState(null);

  function claveCelda(dia, modulo) {
    return `${dia}-${modulo.numero}`;
  }

  function manejarDragStart(evento, cargo, dia, modulo) {
    if (bloqueada) {
      evento.preventDefault();
      return;
    }
    evento.dataTransfer.effectAllowed = 'move';
    evento.dataTransfer.setData('application/json', JSON.stringify({
      cargoId: cargo.id,
      diaSemana: dia,
      horaInicio: modulo.inicio,
      horaFin: modulo.fin
    }));
  }

  function manejarDrop(evento, dia, modulo) {
    evento.preventDefault();
    setCeldaSobreArrastre(null);
    if (bloqueada) return;
    const datos = evento.dataTransfer.getData('application/json');
    if (!datos) return;
    const origen = JSON.parse(datos);
    const ocupantes = cargosEnCelda(listaCargos, dia, modulo, division.turno);
    if (ocupantes.length > 1) return; // celda con más de un cargo: ambiguo, no se arrastra
    onSoltar({
      origen,
      destino: {
        cargoId: ocupantes[0]?.id || null,
        diaSemana: dia,
        horaInicio: modulo.inicio,
        horaFin: modulo.fin
      }
    });
  }

  return (
    <div className="horarios-seccion">
      <h2 className="horarios-titulo-seccion">
        {division.nombre} <span className="horarios-turno-etiqueta">({ETIQUETA_TURNO[division.turno]})</span>
      </h2>
      {listaCargos.length === 0 ? (
        <p className="alumnos-vacio">Sin cargos asignados.</p>
      ) : !hayGrilla ? (
        <p className="alumnos-vacio">Ningún cargo tiene horario cargado.</p>
      ) : (
        <table className="cargos-grilla-horario">
          <thead>
            <tr>
              <th>Horario</th>
              {DIAS_SEMANA.map((d) => <th key={d.valor}>{d.etiqueta}</th>)}
            </tr>
          </thead>
          <tbody>
            {modulosConDatos.map((modulo) => (
              <tr key={modulo.numero}>
                <td>{modulo.inicio}-{modulo.fin}</td>
                {DIAS_SEMANA.map((d) => {
                  const cargosCelda = cargosEnCelda(listaCargos, d.valor, modulo, division.turno);
                  const esSobreArrastre = celdaSobreArrastre === claveCelda(d.valor, modulo);
                  return (
                    <td
                      key={d.valor}
                      className={esSobreArrastre ? 'horarios-celda-sobre-arrastre' : undefined}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setCeldaSobreArrastre(claveCelda(d.valor, modulo))}
                      onDragLeave={(e) => {
                        // El chip adentro de la celda es un hijo: al pasar el mouse sobre
                        // él el navegador dispara dragLeave de la celda igual (relatedTarget
                        // pasa a ser ese hijo). Si el destino del "leave" sigue dentro de la
                        // celda, no es una salida real: no apagar el resaltado.
                        if (e.currentTarget.contains(e.relatedTarget)) return;
                        setCeldaSobreArrastre((actual) => (actual === claveCelda(d.valor, modulo) ? null : actual));
                      }}
                      onDrop={(e) => manejarDrop(e, d.valor, modulo)}
                    >
                      {cargosCelda.length === 0
                        ? '-'
                        : cargosCelda.map((c) => (
                            <span
                              key={c.id}
                              className={`horarios-chip ${colorMateriaEnAnio(mapaColores, division.anio, c.nombreCargo)}${esSobreArrastre ? ' horarios-chip-intercambio' : ''}`}
                              draggable
                              onDragStart={(e) => manejarDragStart(e, c, d.valor, modulo)}
                              title={c.origenLicenciaId
                                ? `Suplencia — cubre a ${c.origenLicencia.persona.apellido}, ${c.origenLicencia.persona.nombre}. Arrastrá para cambiar el horario de esta clase (afecta también al titular y a otros niveles de suplencia).`
                                : 'Arrastrá para cambiar el horario de esta clase (afecta también a quien la esté cubriendo)'}
                            >
                              {esSobreArrastre && <span className="horarios-chip-icono-intercambio">⇄ </span>}
                              {c.nombreCargo} ({c.persona.apellido}){c.origenLicenciaId && ' · suplencia'}
                            </span>
                          ))}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filasSueltas.map(({ cargo, bloquesPorDia }) => (
              <tr key={`contraturno-${cargo.id}`}>
                <td className="horarios-etiqueta-contraturno">Contraturno</td>
                {DIAS_SEMANA.map((d) => {
                  const bloque = bloquesPorDia[d.valor];
                  return (
                    <td key={d.valor}>
                      {bloque ? (
                        <span className={`horarios-chip ${colorMateriaEnAnio(mapaColores, division.anio, cargo.nombreCargo)}`} title="Contraturno">
                          {cargo.nombreCargo} ({cargo.persona.apellido}){cargo.origenLicenciaId && ' · suplencia'}
                          <span className="horarios-chip-horario">Contraturno {bloque.horaInicio}-{bloque.horaFin}</span>
                        </span>
                      ) : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TablaCargosAdministrativos({ cargos }) {
  const cargosBase = cargos.filter((c) => c.vigente && !c.divisionId && !c.origenLicenciaId);
  const listaCargos = cargosBase.map((c) => cargoActivoAhora(c, cargos));
  return (
    <div className="horarios-seccion">
      <h2 className="horarios-titulo-seccion">Cargos (sin división)</h2>
      {listaCargos.length === 0 ? (
        <p className="alumnos-vacio">No hay cargos sin división cargados.</p>
      ) : (
        <table className="alumnos-tabla">
          <thead>
            <tr>
              <th>Cargo</th>
              <th>Persona</th>
              <th>Horario</th>
            </tr>
          </thead>
          <tbody>
            {listaCargos.map((cargo) => (
              <tr key={cargo.id}>
                <td>{cargo.nombreCargo}</td>
                <td>
                  {cargo.persona.apellido}, {cargo.persona.nombre}
                  {cargo.origenLicenciaId && (
                    <span
                      className="materiasadeudadas-estado materiasadeudadas-estado-csa"
                      style={{ marginLeft: '8px' }}
                      title={`Cubre a ${cargo.origenLicencia.persona.apellido}, ${cargo.origenLicencia.persona.nombre}`}
                    >
                      Suplencia
                    </span>
                  )}
                </td>
                <td>{resumenHorario(cargo.bloquesHorario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Horarios() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [divisiones, setDivisiones] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [vista, setVista] = useState('');
  const [moviendoHorario, setMoviendoHorario] = useState(false);

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaDivisiones, respuestaCargos] = await Promise.all([
        cliente.get('/divisiones'),
        cliente.get('/cargos', { params: { cicloLectivo } })
      ]);
      setDivisiones(respuestaDivisiones.data);
      setCargos(respuestaCargos.data);
    } catch (err) {
      setError('No se pudo cargar la información de horarios');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (esSecretaria) cargarDatos();
  }, [cicloLectivo, esSecretaria]);

  function reemplazarBloque(cargo, viejo, nuevo) {
    const bloques = (cargo.bloquesHorario || []).map((b) => ({ diaSemana: b.diaSemana, horaInicio: b.horaInicio, horaFin: b.horaFin }));
    const indice = bloques.findIndex((b) =>
      b.diaSemana === viejo.diaSemana && b.horaInicio === viejo.horaInicio && b.horaFin === viejo.horaFin
    );
    if (indice === -1) return bloques;
    bloques[indice] = nuevo;
    return bloques;
  }

  async function guardarBloques(cargo, bloques) {
    await cliente.put(`/cargos/${cargo.id}`, {
      nombreCargo: cargo.nombreCargo,
      divisionId: cargo.divisionId,
      horasCatedra: cargo.horasCatedra,
      bloques
    });
  }

  // Arrastrar un cargo de una celda a otra cambia su horario; si la celda de destino ya
  // tenía otro cargo, ambos intercambian sus horarios entre sí (ninguno se pisa).
  async function manejarSoltar({ origen, destino }) {
    if (
      origen.cargoId === destino.cargoId &&
      origen.diaSemana === destino.diaSemana &&
      origen.horaInicio === destino.horaInicio &&
      origen.horaFin === destino.horaFin
    ) {
      return;
    }

    // Un intercambio son 2 PUT separados (uno por cargo), no una transacción única.
    // Si se dispara un segundo arrastre mientras el primero todavía está guardando,
    // el segundo trabajaría sobre datos de "cargos" desactualizados y podía terminar
    // duplicando bloques en vez de reemplazarlos. Se bloquea hasta que termine y se
    // recarguen los datos.
    if (moviendoHorario) return;

    const cargoOrigen = cargos.find((c) => c.id === origen.cargoId);
    if (!cargoOrigen) return;

    // Un cambio de horario es un cambio de "la clase", no de una persona en
    // particular: se aplica al cargo real y a cada nivel de cobertura vigente
    // sobre él (titular, suplente, suplente del suplente...), arrastrando
    // cualquiera de ellos — así no quedan desincronizados entre sí.
    const cadenaOrigen = cadenaCompletaDe(cargoOrigen, cargos);

    setError('');
    setMoviendoHorario(true);
    try {
      if (destino.cargoId && destino.cargoId === origen.cargoId) {
        for (const cargoDeCadena of cadenaOrigen) {
          let bloques = (cargoDeCadena.bloquesHorario || []).map((b) => ({ diaSemana: b.diaSemana, horaInicio: b.horaInicio, horaFin: b.horaFin }));
          bloques = bloques.map((b) => {
            if (b.diaSemana === origen.diaSemana && b.horaInicio === origen.horaInicio && b.horaFin === origen.horaFin) {
              return { diaSemana: destino.diaSemana, horaInicio: destino.horaInicio, horaFin: destino.horaFin };
            }
            if (b.diaSemana === destino.diaSemana && b.horaInicio === destino.horaInicio && b.horaFin === destino.horaFin) {
              return { diaSemana: origen.diaSemana, horaInicio: origen.horaInicio, horaFin: origen.horaFin };
            }
            return b;
          });
          await guardarBloques(cargoDeCadena, bloques);
        }
      } else {
        for (const cargoDeCadena of cadenaOrigen) {
          const bloquesActualizados = reemplazarBloque(
            cargoDeCadena, origen,
            { diaSemana: destino.diaSemana, horaInicio: destino.horaInicio, horaFin: destino.horaFin }
          );
          await guardarBloques(cargoDeCadena, bloquesActualizados);
        }

        if (destino.cargoId) {
          const cargoDestino = cargos.find((c) => c.id === destino.cargoId);
          if (cargoDestino) {
            const cadenaDestino = cadenaCompletaDe(cargoDestino, cargos);
            for (const cargoDeCadena of cadenaDestino) {
              const bloquesActualizados = reemplazarBloque(
                cargoDeCadena, destino,
                { diaSemana: origen.diaSemana, horaInicio: origen.horaInicio, horaFin: origen.horaFin }
              );
              await guardarBloques(cargoDeCadena, bloquesActualizados);
            }
          }
        }
      }
      await cargarDatos();
    } catch (err) {
      setError('No se pudo actualizar el horario');
    } finally {
      setMoviendoHorario(false);
    }
  }

  const divisionesOrdenadas = [...divisiones]
    .filter((d) => d.activa)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const mapaColores = construirMapaColoresPorAnio(cargos);

  const divisionSeleccionada = vista && vista !== 'CARGOS'
    ? divisionesOrdenadas.find((d) => d.id === parseInt(vista))
    : null;

  if (!esSecretaria) {
    return (
      <div className="alumnos-pagina">
        <h1>Horarios</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="alumnos-pagina horarios-pagina">
      <div className="alumnos-encabezado">
        <h1>Horarios — Ciclo {cicloLectivo}</h1>
      </div>

      {error && <div className="alumnos-error">{error}</div>}

      <div className="alumnos-formulario">
        <div className="alumnos-formulario-fila">
          <div>
            <label>Ver</label>
            <select value={vista} onChange={(e) => setVista(e.target.value)}>
              <option value="">Todas las divisiones</option>
              {divisionesOrdenadas.map((division) => (
                <option key={division.id} value={division.id}>{division.nombre}</option>
              ))}
              <option value="CARGOS">Cargos (sin división)</option>
            </select>
          </div>
        </div>
      </div>

      {cargando ? (
        <p>Cargando...</p>
      ) : vista === 'CARGOS' ? (
        <TablaCargosAdministrativos cargos={cargos} />
      ) : divisionSeleccionada ? (
        <GrillaDivision division={divisionSeleccionada} cargos={cargos} onSoltar={manejarSoltar} bloqueada={moviendoHorario} mapaColores={mapaColores} />
      ) : (
        <>
          {divisionesOrdenadas.map((division) => (
            <GrillaDivision key={division.id} division={division} cargos={cargos} onSoltar={manejarSoltar} bloqueada={moviendoHorario} mapaColores={mapaColores} />
          ))}
          <TablaCargosAdministrativos cargos={cargos} />
        </>
      )}
    </div>
  );
}

export default Horarios;
