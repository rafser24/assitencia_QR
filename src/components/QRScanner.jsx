import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { CameraOff, FlipHorizontal } from 'lucide-react'

const SCANNER_ID = 'qr-reader'

export default function QRScanner({ onScan, active }) {
  const scannerRef   = useRef(null)
  const lastScan     = useRef('')
  const lastScanTime = useRef(0)

  const [cameras, setCameras] = useState([])
  const [camIdx,  setCamIdx]  = useState(0)   // índice en el array cameras
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const [manualQR, setManualQR] = useState('')
  const [flipping, setFlipping] = useState(false)

  // ── Listar cámaras ─────────────────────────────────────────────────────────
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!devices || devices.length === 0) {
          setError('No se encontraron cámaras en este dispositivo.')
          return
        }
        setCameras(devices)

        // Preferir cámara TRASERA por defecto (mejor para escanear QR)
        const backIdx = devices.findIndex(d =>
          /back|rear|environment/i.test(d.label)
        )
        setCamIdx(backIdx >= 0 ? backIdx : 0)
      })
      .catch(() => setError('No se pudo acceder a la cámara. Verifica los permisos.'))
  }, [])

  // ── Parar escáner ──────────────────────────────────────────────────────────
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop()
        }
        scannerRef.current.clear()
      } catch (_) { /* ignorar errores al parar */ }
      scannerRef.current = null
    }
    setRunning(false)
  }, [])

  // ── Iniciar escáner ────────────────────────────────────────────────────────
  const startScanner = useCallback(async (idx) => {
    if (cameras.length === 0) return
    setError(null)

    const cam = cameras[idx ?? camIdx]
    if (!cam) return

    const html5QrCode = new Html5Qrcode(SCANNER_ID)
    scannerRef.current = html5QrCode

    try {
      await html5QrCode.start(
        { deviceId: { exact: cam.id } },
        {
          fps:         10,
          qrbox:       { width: 210, height: 210 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          const now = Date.now()
          if (decodedText === lastScan.current && now - lastScanTime.current < 3000) return
          lastScan.current     = decodedText
          lastScanTime.current = now
          playBeep()
          onScan(decodedText)
        },
        () => { /* frame sin QR */ }
      )
      setRunning(true)
    } catch (err) {
      setError('Error al iniciar la cámara: ' + (err?.message || String(err)))
      setRunning(false)
    }
  }, [cameras, camIdx, onScan])

  // ── Reaccionar a cambios de active o cámara ────────────────────────────────
  useEffect(() => {
    if (active && cameras.length > 0) {
      stopScanner().then(() => startScanner(camIdx))
    } else {
      stopScanner()
    }
    return () => { stopScanner() }
  }, [active, camIdx, cameras]) // eslint-disable-line

  // ── Cambiar cámara (flip) ──────────────────────────────────────────────────
  const flipCamera = useCallback(async () => {
    if (cameras.length < 2 || flipping) return
    setFlipping(true)
    await stopScanner()
    const nextIdx = (camIdx + 1) % cameras.length
    setCamIdx(nextIdx)
    // startScanner se dispara por el useEffect al cambiar camIdx
    setTimeout(() => setFlipping(false), 600)
  }, [cameras, camIdx, flipping, stopScanner])

  // ── Beep ───────────────────────────────────────────────────────────────────
  const playBeep = () => {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)()
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
    } catch (_) {}
  }

  // ── Entrada manual ─────────────────────────────────────────────────────────
  const handleManual = () => {
    const v = manualQR.trim()
    if (!v) return
    playBeep(); onScan(v); setManualQR('')
  }

  // Etiqueta de la cámara activa
  const camLabel = cameras[camIdx]?.label || ''
  const esFrontal = /front|user|face|selfie/i.test(camLabel)
  const esTrasera = /back|rear|environment/i.test(camLabel)
  const labelCam  = esFrontal ? 'Frontal' : esTrasera ? 'Trasera' : `Cám. ${camIdx + 1}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Viewfinder ── */}
      <div style={{
        position:    'relative',
        width:       '100%',
        maxWidth:    320,
        margin:      '0 auto',
        borderRadius: 14,
        overflow:    'hidden',
        border:      `2px solid ${running ? '#6366f1' : '#d8dff2'}`,
        background:  '#1e1e2e',
        aspectRatio: '1',
        transition:  'border-color 0.3s',
        boxShadow:   running ? '0 0 0 4px rgba(99,102,241,0.12)' : 'none',
      }}>
        <div id={SCANNER_ID} style={{ width: '100%', height: '100%' }} />

        {/* Overlay inactivo */}
        {!running && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(30,30,46,0.92)', gap: 10,
          }}>
            <CameraOff size={36} style={{ color: '#7b85b8' }} />
            <span style={{ color: '#7b85b8', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              CÁMARA INACTIVA
            </span>
          </div>
        )}

        {/* Línea de escaneo */}
        {running && (
          <div style={{
            position: 'absolute', left: '10%', right: '10%',
            height: 2, background: 'rgba(99,102,241,0.7)',
            animation: 'scanLine 1.8s linear infinite', borderRadius: 1,
          }} />
        )}

        {/* Esquinas */}
        {['tl','tr','bl','br'].map(pos => (
          <div key={pos} style={{
            position: 'absolute',
            top:    pos.startsWith('t') ? 10 : 'auto',
            bottom: pos.startsWith('b') ? 10 : 'auto',
            left:   pos.endsWith('l')   ? 10 : 'auto',
            right:  pos.endsWith('r')   ? 10 : 'auto',
            width: 20, height: 20,
            borderTop:    pos.startsWith('t') ? '3px solid #6366f1' : 'none',
            borderBottom: pos.startsWith('b') ? '3px solid #6366f1' : 'none',
            borderLeft:   pos.endsWith('l')   ? '3px solid #6366f1' : 'none',
            borderRight:  pos.endsWith('r')   ? '3px solid #6366f1' : 'none',
          }} />
        ))}

        {/* Botón flip — SIEMPRE visible cuando hay cámaras */}
        {cameras.length > 0 && (
          <button
            onClick={flipCamera}
            disabled={flipping}
            title={`Cambiar a cámara ${esFrontal ? 'trasera' : 'frontal'}`}
            style={{
              position:   'absolute', bottom: 10, right: 10,
              background: 'rgba(99,102,241,0.85)',
              border:     'none', borderRadius: 8,
              padding:    '6px 10px',
              color:      '#fff', cursor: cameras.length < 2 ? 'default' : 'pointer',
              display:    'flex', alignItems: 'center', gap: 5,
              fontSize:   11, fontFamily: 'var(--font-mono)', fontWeight: 700,
              opacity:    flipping ? 0.6 : 1,
              transition: 'opacity 0.2s',
              backdropFilter: 'blur(4px)',
            }}
          >
            <FlipHorizontal size={13} />
            {flipping ? '...' : labelCam}
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5',
          borderRadius: 8, padding: '10px 14px',
          color: '#ef4444', fontSize: 12, fontFamily: 'var(--font-mono)',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Selector lista de cámaras (si hay más de 2) ── */}
      {cameras.length > 2 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#7b85b8', fontFamily: 'var(--font-mono)' }}>Cámara:</span>
          <select
            value={camIdx}
            onChange={e => setCamIdx(Number(e.target.value))}
            style={{
              flex: 1, fontSize: 12, background: '#f8faff',
              border: '1px solid #d8dff2', borderRadius: 8,
              padding: '6px 10px', color: '#2d3561',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {cameras.map((c, i) => (
              <option key={c.id} value={i}>
                {c.label || `Cámara ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Entrada manual ── */}
      <div>
        <div style={{ fontSize: 10, color: '#b0b8d8', marginBottom: 5, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
          ENTRADA MANUAL (FALLBACK)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={manualQR}
            onChange={e => setManualQR(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManual()}
            placeholder="Ingresa el código QR..."
            style={{
              flex: 1, fontSize: 13,
              background: '#f8faff', border: '1px solid #d8dff2',
              borderRadius: 8, padding: '8px 12px', color: '#2d3561',
              fontFamily: 'var(--font-mono)',
            }}
          />
          <button
            onClick={handleManual}
            style={{
              background: '#6366f1', border: 'none', borderRadius: 8,
              padding: '0 18px', color: '#fff',
              fontWeight: 700, fontSize: 16, flexShrink: 0, cursor: 'pointer',
            }}
          >
            ↵
          </button>
        </div>
      </div>

    </div>
  )
}
