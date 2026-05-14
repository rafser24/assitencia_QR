import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, CameraOff, RefreshCw } from 'lucide-react'

const SCANNER_ID = 'qr-reader'

export default function QRScanner({ onScan, active }) {
  const scannerRef   = useRef(null)
  const lastScan     = useRef('')
  const lastScanTime = useRef(0)
  const [cameras, setCameras]   = useState([])
  const [camId, setCamId]       = useState(null)
  const [running, setRunning]   = useState(false)
  const [error, setError]       = useState(null)
  const [manualQR, setManualQR] = useState('')

  // Listar cámaras disponibles
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length) {
          setCameras(devices)
          // Preferir cámara trasera
          const back = devices.find((d) =>
            /back|rear|environment/i.test(d.label)
          )
          setCamId(back ? back.id : devices[0].id)
        }
      })
      .catch(() => setError('No se pudo acceder a la cámara.'))
  }, [])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current && running) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch (_) { /* ignore */ }
      setRunning(false)
    }
  }, [running])

  const startScanner = useCallback(async () => {
    if (!camId || running) return
    setError(null)

    const html5QrCode = new Html5Qrcode(SCANNER_ID)
    scannerRef.current = html5QrCode

    try {
      await html5QrCode.start(
        { deviceId: { exact: camId } },
        {
          fps:            10,
          qrbox:          { width: 220, height: 220 },
          aspectRatio:    1.0,
          disableFlip:    false,
          rememberLastUsedCamera: true,
        },
        (decodedText) => {
          const now = Date.now()
          // Evitar doble escaneo del mismo QR en < 3s
          if (decodedText === lastScan.current && now - lastScanTime.current < 3000) return
          lastScan.current     = decodedText
          lastScanTime.current = now
          // Sonido de éxito
          playBeep()
          onScan(decodedText)
        },
        () => { /* frame sin QR — ignorar */ }
      )
      setRunning(true)
    } catch (err) {
      setError('Error al iniciar la cámara: ' + (err?.message || err))
    }
  }, [camId, running, onScan])

  // Arrancar/parar según prop `active`
  useEffect(() => {
    if (active && camId) startScanner()
    else stopScanner()
    return () => { stopScanner() }
  }, [active, camId]) // eslint-disable-line

  // Beep de confirmación
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    } catch (_) {}
  }

  const handleManual = () => {
    const v = manualQR.trim()
    if (!v) return
    playBeep()
    onScan(v)
    setManualQR('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Viewfinder */}
      <div style={{
        position:     'relative',
        width:        '100%',
        maxWidth:     320,
        margin:       '0 auto',
        borderRadius: 12,
        overflow:     'hidden',
        border:       `2px solid ${running ? '#f59e0b' : '#30363d'}`,
        background:   '#0d1117',
        aspectRatio:  '1',
        transition:   'border-color 0.3s',
      }}>
        <div id={SCANNER_ID} style={{ width: '100%', height: '100%' }} />

        {/* Overlay cuando no está activo */}
        {!running && (
          <div style={{
            position:       'absolute', inset: 0,
            display:        'flex', flexDirection: 'column',
            alignItems:     'center', justifyContent: 'center',
            background:     'rgba(13,17,23,0.85)',
            gap: 12,
          }}>
            <CameraOff size={40} style={{ color: '#484f58' }} />
            <span style={{ color: '#6e7681', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              CÁMARA INACTIVA
            </span>
          </div>
        )}

        {/* Línea de escaneo animada */}
        {running && (
          <div style={{
            position:   'absolute', left: '10%', right: '10%',
            height:     2, background: 'rgba(245,158,11,0.7)',
            animation:  'scanLine 1.8s linear infinite',
            borderRadius: 1,
          }} />
        )}

        {/* Esquinas decorativas */}
        {['tl','tr','bl','br'].map((pos) => (
          <div key={pos} style={{
            position:    'absolute',
            top:    pos.startsWith('t') ? 10 : 'auto',
            bottom: pos.startsWith('b') ? 10 : 'auto',
            left:   pos.endsWith('l')   ? 10 : 'auto',
            right:  pos.endsWith('r')   ? 10 : 'auto',
            width: 22, height: 22,
            borderTop:    pos.startsWith('t') ? '3px solid #f59e0b' : 'none',
            borderBottom: pos.startsWith('b') ? '3px solid #f59e0b' : 'none',
            borderLeft:   pos.endsWith('l')   ? '3px solid #f59e0b' : 'none',
            borderRight:  pos.endsWith('r')   ? '3px solid #f59e0b' : 'none',
          }} />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#2e1a1a', border: '1px solid #7f1d1d',
          borderRadius: 8, padding: '10px 14px',
          color: '#f87171', fontSize: 12, fontFamily: 'var(--font-mono)',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Selector de cámara */}
      {cameras.length > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Camera size={14} style={{ color: '#8b949e', flexShrink: 0 }} />
          <select
            value={camId || ''}
            onChange={(e) => { stopScanner(); setCamId(e.target.value) }}
            style={{ fontSize: 12 }}
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.label || c.id}</option>
            ))}
          </select>
        </div>
      )}

      {/* Entrada manual (fallback) */}
      <div>
        <div style={{ fontSize: 11, color: '#484f58', marginBottom: 6 }}>
          ENTRADA MANUAL (FALLBACK)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={manualQR}
            onChange={(e) => setManualQR(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManual()}
            placeholder="Ingresa el código QR..."
            style={{ flex: 1, fontSize: 13 }}
          />
          <button
            onClick={handleManual}
            style={{
              background:   '#f59e0b',
              border:       'none',
              borderRadius: 8,
              padding:      '0 18px',
              color:        '#0d1117',
              fontWeight:   700,
              fontSize:     14,
              flexShrink:   0,
            }}
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  )
}
