import { useState, useCallback } from 'react'
import { LogIn, LogOut, AlertTriangle, Clock } from 'lucide-react'
import { addDays } from 'date-fns'
import QRScanner from '../components/QRScanner'
import { useAttendanceLogic } from '../hooks/useAttendanceLogic'
import {
  getAlumnoByQR, updateAlumno, createAsistencia,
  registrarSalida, getCheckinAbierto, getAsistenciasSemana,
} from '../services/firestoreService'

const RESULT_TIPO = {
  checkin:  { icon: LogIn,         color: '#10b981', bgColor: '#d1fae5', borderColor: '#6ee7b7', label: 'ENTRADA REGISTRADA' },
  checkout: { icon: LogOut,        color: '#6366f1', bgColor: '#e0e7ff', borderColor: '#a5b4fc', label: 'SALIDA REGISTRADA'  },
  aviso:    { icon: AlertTriangle, color: '#f59e0b', bgColor: '#fef3c7', borderColor: '#fde68a', label: 'ATENCIÓN'           },
  error:    { icon: AlertTriangle, color: '#ef4444', bgColor: '#fee2e2', borderColor: '#fca5a5', label: 'ACCESO DENEGADO'    },
}

function ResultCard({ result }) {
  if (!result) return null
  const cfg  = RESULT_TIPO[result.tipo] || RESULT_TIPO.error
  const Icon = cfg.icon
  return (
    <div className="fade-in" style={{
      background: cfg.bgColor, border: `1px solid ${cfg.borderColor}`,
      borderRadius: 14, padding: 22, marginTop: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={18} style={{ color: cfg.color }} />
        <span style={{ color: cfg.color, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>
          {cfg.label}
        </span>
      </div>
      {result.nombre && (
        <div style={{ fontSize: 17, fontWeight: 700, color: '#2d3561', marginBottom: 4 }}>{result.nombre}</div>
      )}
      {result.hora && (
        <div style={{ color: '#7b85b8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={12} /> {result.hora}
        </div>
      )}
      {result.retrasoEntrada > 0 && (
        <div style={{ marginTop: 8, padding: '5px 10px', background: 'rgba(245,158,11,0.12)', borderRadius: 6, display: 'inline-block', fontSize: 12, color: '#d97706' }}>
          ⏱ Retraso entrada: {result.retrasoEntrada} min
        </div>
      )}
      {result.retrasoSalida > 0 && (
        <div style={{ marginTop: 6, padding: '5px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, display: 'inline-block', fontSize: 12, color: '#ef4444' }}>
          🚪 Salida temprana: {result.retrasoSalida} min (antes de las 4:00 PM)
        </div>
      )}
      {result.minutosNuevos > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#7b85b8' }}>
          Total acumulado hoy: <strong style={{ color: '#2d3561' }}>{result.minutosNuevos} min</strong>
        </div>
      )}
      {result.diasAgregados > 0 && (
        <div style={{ marginTop: 8, color: '#ef4444', fontSize: 12, fontWeight: 700 }}>
          ⚠ +{result.diasAgregados} día(s) extra por superar 180 min acumulados
        </div>
      )}
      {result.esReposicion && (
        <div style={{ marginTop: 8, color: '#6366f1', fontSize: 12 }}>📅 Registrado como REPOSICIÓN</div>
      )}
      {result.mensaje && (
        <div style={{ color: '#7b85b8', fontSize: 13, marginTop: 6 }}>{result.mensaje}</div>
      )}
    </div>
  )
}

export default function LectorPage({ toast }) {
  const logic = useAttendanceLogic()
  const [scannerActive, setScannerActive] = useState(true)
  const [result, setResult]               = useState(null)
  const [processing, setProcessing]       = useState(false)

  const handleScan = useCallback(async (qrCode) => {
    if (processing) return
    setProcessing(true)
    setResult(null)

    try {
      // 1. Buscar alumno
      const alumno = await getAlumnoByQR(qrCode)
      if (!alumno) {
        setResult({ tipo: 'error', mensaje: `QR no registrado: "${qrCode}"` })
        toast.add(`QR desconocido: ${qrCode}`, 'error')
        return
      }

      const ahora     = new Date()
      const weekStart = logic.getWeekStart(ahora)
      const weekEnd   = addDays(weekStart, 7)

      // 2. Permisos
      const asistenciasSemana = await getAsistenciasSemana(alumno.uid, weekStart, weekEnd)
      const { permitido, razon, esReposicion } = logic.verificarPermiso(alumno, asistenciasSemana, ahora)
      if (!permitido) {
        setResult({ tipo: 'aviso', nombre: alumno.nombre, mensaje: razon })
        toast.add(razon, 'warn')
        return
      }

      // 3. Check-in o Check-out
      const registroAbierto = await getCheckinAbierto(alumno.uid, ahora)
      const accion          = logic.detectarAccion(registroAbierto)

      if (accion === 'checkout') {
        // ── CHECKOUT ──────────────────────────────────────────────────────
        // Calcular penalización por salida temprana (< 4:00 PM)
        const { retrasoSalida, total: minutosSalida } = logic.calcularMinutosDia(
          registroAbierto.entrada?.toDate?.() ?? new Date(registroAbierto.entrada),
          ahora
        )

        // Guardar la salida
        await registrarSalida(registroAbierto.id, ahora)

        // Si hubo salida temprana, acumular esos minutos ahora
        let diasAgregados = 0
        if (retrasoSalida > 0) {
          const { minutosAcumulados, diasExtra, diasAgregados: da } = logic.acumularMinutos(alumno, retrasoSalida)
          await updateAlumno(alumno.uid, { minutosAcumulados, diasExtra })
          diasAgregados = da
        }

        setResult({
          tipo:          'checkout',
          nombre:        alumno.nombre,
          hora:          logic.formatTime(ahora),
          retrasoSalida,
          minutosNuevos: retrasoSalida,
          diasAgregados,
        })
        toast.add(
          `Salida: ${alumno.nombre}${retrasoSalida > 0 ? ` — ${retrasoSalida}min salida temprana` : ''}`,
          'success'
        )

      } else {
        // ── CHECKIN ───────────────────────────────────────────────────────
        const entradaEfectiva = logic.calcularEntradaEfectiva(ahora)
        const retrasoEntrada  = logic.calcularRetrasoEntrada(ahora)

        // Acumular solo el retraso de entrada (salida se acumula al hacer checkout)
        const { minutosAcumulados, diasExtra, diasAgregados } = logic.acumularMinutos(alumno, retrasoEntrada)

        await Promise.all([
          updateAlumno(alumno.uid, { minutosAcumulados, diasExtra }),
          createAsistencia({
            alumnoId:       alumno.uid,
            fecha:          ahora,
            entrada:        entradaEfectiva,
            minutosRetraso: retrasoEntrada,
            esReposicion,
          }),
        ])

        setResult({
          tipo:           'checkin',
          nombre:         alumno.nombre,
          hora:           logic.formatTime(entradaEfectiva),
          retrasoEntrada,
          minutosNuevos:  retrasoEntrada,
          diasAgregados,
          esReposicion,
        })
        toast.add(
          `Entrada: ${alumno.nombre}${retrasoEntrada > 0 ? ` — ${retrasoEntrada}min tarde` : ' — a tiempo'}`,
          'success'
        )
      }

    } catch (err) {
      console.error('SCAN ERROR:', err?.code, err?.message, err)
      const msg = err?.message || 'Error de conexión.'
      setResult({ tipo: 'error', mensaje: msg })
      toast.add('Error: ' + msg, 'error')
    } finally {
      setTimeout(() => setResult(null), 7000)
      setProcessing(false)
    }
  }, [processing, logic, toast])

  const ahora = new Date()

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 0 40px' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          display: 'inline-block', background: '#e0e7ff', border: '1px solid #a5b4fc',
          borderRadius: 6, padding: '3px 12px', fontSize: 10,
          color: '#6366f1', fontFamily: 'var(--font-mono)', fontWeight: 700,
          letterSpacing: '0.06em', marginBottom: 12,
        }}>
          CONTROL DE PRÁCTICAS PROFESIONALES
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 30,
          fontWeight: 800, color: '#2d3561', letterSpacing: -0.5, marginBottom: 6,
        }}>
          Lector QR
        </h1>
        <div style={{ color: '#7b85b8', fontSize: 12 }}>
          {logic.formatDate(ahora)} &nbsp;·&nbsp; Entrada 13:00 · Salida 16:00
        </div>
      </div>

      {/* Scanner */}
      <div className="card">
        <QRScanner onScan={handleScan} active={scannerActive && !processing} />
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setScannerActive(v => !v)}
            style={{
              background: 'transparent',
              border: `1px solid ${scannerActive ? '#fca5a5' : '#6ee7b7'}`,
              borderRadius: 8, padding: '7px 18px',
              color: scannerActive ? '#ef4444' : '#10b981',
              fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {scannerActive ? '⏸ Pausar lector' : '▶ Activar lector'}
          </button>
        </div>
      </div>

      {/* Procesando */}
      {processing && (
        <div style={{ textAlign: 'center', color: '#6366f1', fontSize: 13, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 14, height: 14, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          Procesando escaneo...
        </div>
      )}

      <ResultCard result={result} />

      {/* Info reglas */}
      <div style={{
        marginTop: 20, background: '#ffffff', border: '1px solid #d8dff2',
        borderRadius: 12, padding: '14px 16px',
        boxShadow: '0 2px 8px rgba(99,102,241,0.06)',
      }}>
        <div style={{ fontSize: 10, color: '#b0b8d8', marginBottom: 10, fontWeight: 700, letterSpacing: '0.07em' }}>
          DÍAS Y REGLAS
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {['Martes', 'Miércoles', 'Jueves'].map(d => (
            <span key={d} className="badge badge-green">{d}</span>
          ))}
          <span className="badge badge-blue">Viernes (repos.)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { icon: '⏱', text: 'Retraso entrada: minutos después de las 13:00' },
            { icon: '🚪', text: 'Salida temprana: minutos antes de las 16:00' },
            { icon: '⚠', text: 'Cada 180 min acumulados = +1 día extra' },
          ].map(r => (
            <div key={r.text} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11 }}>{r.icon}</span>
              <span style={{ color: '#7b85b8', fontSize: 11, lineHeight: 1.4 }}>{r.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
