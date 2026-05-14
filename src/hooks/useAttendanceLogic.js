import { useCallback } from 'react'
import {
  format, startOfWeek, getDay,
  differenceInMinutes, setHours, setMinutes,
  setSeconds, setMilliseconds, parseISO, isSameDay
} from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * useAttendanceLogic
 * ==================
 * Hook central con toda la lógica de negocio.
 *
 * Reglas de tiempo:
 *  - Horario base entrada:  13:00
 *  - Hora límite salida:    16:00 (4:00 PM)
 *  - Si llega tarde (> 13:00):   retrasoEntrada = minutosActual - 13:00
 *  - Si sale temprano (< 16:00): retrasoSalida  = 16:00 - minutosSalida
 *  - minutosRetraso TOTAL = retrasoEntrada + retrasoSalida
 *  - Umbral: cada 180 minutos acumulados → +1 diasExtra
 *
 * Días:
 *  - Obligatorios: Martes (2), Miércoles (3), Jueves (4)
 *  - Reposición:   Viernes (5)
 */
export function useAttendanceLogic() {
  const HORA_ENTRADA_H  = 13    // 1:00 PM — hora base de entrada
  const HORA_ENTRADA_M  = 0
  const HORA_SALIDA_H   = 16    // 4:00 PM — hora mínima de salida
  const HORA_SALIDA_M   = 0
  const MINUTOS_UMBRAL  = 180
  const DIAS_OBLIGATORIOS = [2, 3, 4]
  const DIA_REPOSICION    = 5

  // ─── Helpers de fecha ─────────────────────────────────────────────────────

  const getWeekStart = useCallback((date) =>
    startOfWeek(date, { weekStartsOn: 1 }), [])

  const getHoraEntrada = useCallback((date) =>
    setMilliseconds(setSeconds(setMinutes(setHours(new Date(date), HORA_ENTRADA_H), HORA_ENTRADA_M), 0), 0), [])

  const getHoraSalida = useCallback((date) =>
    setMilliseconds(setSeconds(setMinutes(setHours(new Date(date), HORA_SALIDA_H), HORA_SALIDA_M), 0), 0), [])

  const formatTime = useCallback((date) => {
    const d = date instanceof Date ? date : parseISO(date)
    return format(d, 'hh:mm a', { locale: es })
  }, [])

  const formatDate = useCallback((date) => {
    const d = date instanceof Date ? date : parseISO(date)
    return format(d, "EEEE d 'de' MMMM yyyy", { locale: es })
  }, [])

  const formatDateShort = useCallback((date) => {
    const d = date instanceof Date ? date : parseISO(date)
    return format(d, 'dd/MM/yyyy', { locale: es })
  }, [])

  // ─── Lógica de entrada ────────────────────────────────────────────────────

  /**
   * Calcula minutos de retraso en la ENTRADA.
   * Si llega ≤ 13:00 → 0 min.
   * Si llega > 13:00 → diferencia en minutos.
   */
  const calcularRetrasoEntrada = useCallback((horaEntrada) => {
    const base = getHoraEntrada(horaEntrada)
    return Math.max(0, differenceInMinutes(horaEntrada, base))
  }, [getHoraEntrada])

  /**
   * Calcula minutos de retraso en la SALIDA.
   * Si sale ≥ 16:00 → 0 min.
   * Si sale < 16:00 → diferencia en minutos (salida temprana penalizada).
   */
  const calcularRetrasoSalida = useCallback((horaSalida) => {
    const limite = getHoraSalida(horaSalida)
    return Math.max(0, differenceInMinutes(limite, horaSalida))
  }, [getHoraSalida])

  /**
   * Calcula el TOTAL de minutos penalizables del día.
   * = retrasoEntrada + retrasoSalida
   * Solo aplica retraso de salida si ya se registró la salida.
   */
  const calcularMinutosDia = useCallback((entrada, salida) => {
    const retrasoEnt = calcularRetrasoEntrada(entrada)
    const retrasoSal = salida ? calcularRetrasoSalida(salida) : 0
    return {
      retrasoEntrada: retrasoEnt,
      retrasoSalida:  retrasoSal,
      total:          retrasoEnt + retrasoSal,
    }
  }, [calcularRetrasoEntrada, calcularRetrasoSalida])

  /**
   * Hora de entrada efectiva — si llega antes de las 13:00
   * se registra exactamente a las 13:00.
   */
  const calcularEntradaEfectiva = useCallback((horaEntrada) => {
    const base = getHoraEntrada(horaEntrada)
    return horaEntrada < base ? base : horaEntrada
  }, [getHoraEntrada])

  // ─── Regla de los 180 minutos ─────────────────────────────────────────────

  /**
   * Acumula minutosNuevos al perfil del alumno.
   * Cada 180 min acumulados → diasExtra += 1 (con residuo).
   */
  const acumularMinutos = useCallback((alumno, minutosNuevos) => {
    const total      = (alumno.minutosAcumulados || 0) + minutosNuevos
    const diasNuevos = Math.floor(total / MINUTOS_UMBRAL)
    const residuo    = total % MINUTOS_UMBRAL
    return {
      minutosAcumulados: residuo,
      diasExtra:         (alumno.diasExtra || 0) + diasNuevos,
      diasAgregados:     diasNuevos,
    }
  }, [])

  // ─── Lógica de calendario ─────────────────────────────────────────────────

  const verificarPermiso = useCallback((alumno, asistenciasSemana, ahora) => {
    const diaActual = getDay(ahora)
    const diasConAsistencia = asistenciasSemana.map((a) =>
      getDay(a.fecha instanceof Date ? a.fecha : parseISO(a.fecha))
    )
    const diasFaltantes = DIAS_OBLIGATORIOS.filter((d) => !diasConAsistencia.includes(d))

    if (DIAS_OBLIGATORIOS.includes(diaActual)) {
      const yaAsistioHoy = asistenciasSemana.some((a) => {
        const fa = a.fecha instanceof Date ? a.fecha : parseISO(a.fecha)
        return isSameDay(fa, ahora)
      })
      if (yaAsistioHoy) return { permitido: false, razon: 'Ya registraste asistencia hoy.', esReposicion: false }
      return { permitido: true, razon: null, esReposicion: false }
    }

    if (diaActual === DIA_REPOSICION) {
      if (diasFaltantes.length === 0) return {
        permitido: false,
        razon: '✅ Asistencias completas esta semana. No necesitas reposición.',
        esReposicion: false,
      }
      if (diasConAsistencia.includes(DIA_REPOSICION)) return {
        permitido: false,
        razon: 'Ya registraste tu reposición esta semana.',
        esReposicion: true,
      }
      return { permitido: true, razon: null, esReposicion: true }
    }

    return {
      permitido: false,
      razon: 'Hoy no hay práctica. Días válidos: Mar, Mié, Jue y Vie (reposición).',
      esReposicion: false,
    }
  }, [])

  const calcularPenalizacionSemanal = useCallback((alumno, asistenciasSemana) => {
    const diasConAsistencia = asistenciasSemana.map((a) =>
      getDay(a.fecha instanceof Date ? a.fecha : parseISO(a.fecha))
    )
    const faltas = DIAS_OBLIGATORIOS.filter((d) => !diasConAsistencia.includes(d))
    const tieneReposicion = diasConAsistencia.includes(DIA_REPOSICION)
    if (faltas.length > 0 && !tieneReposicion) {
      return { diasExtra: (alumno.diasExtra || 0) + 1, penalizacion: true }
    }
    return { diasExtra: alumno.diasExtra || 0, penalizacion: false }
  }, [])

  const detectarAccion = useCallback((registroAbierto) =>
    registroAbierto ? 'checkout' : 'checkin', [])

  return {
    HORA_ENTRADA_H, HORA_ENTRADA_M,
    HORA_SALIDA_H, HORA_SALIDA_M,
    MINUTOS_UMBRAL, DIAS_OBLIGATORIOS, DIA_REPOSICION,
    getWeekStart, getHoraEntrada, getHoraSalida,
    formatTime, formatDate, formatDateShort,
    calcularRetrasoEntrada, calcularRetrasoSalida, calcularMinutosDia,
    calcularEntradaEfectiva, acumularMinutos,
    verificarPermiso, calcularPenalizacionSemanal, detectarAccion,
    // Alias para compatibilidad con código existente
    calcularRetraso: calcularRetrasoEntrada,
  }
}
