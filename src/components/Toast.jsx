import { useState, useCallback, useEffect } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const ICONS = {
  success: CheckCircle,
  error:   XCircle,
  warn:    AlertTriangle,
  info:    Info,
}

const COLORS = {
  success: { bg: '#1a2e1a', border: '#4ade80', text: '#4ade80' },
  error:   { bg: '#2e1a1a', border: '#f87171', text: '#f87171' },
  warn:    { bg: '#2e2a1a', border: '#f59e0b', text: '#f59e0b' },
  info:    { bg: '#1a1e2e', border: '#60a5fa', text: '#60a5fa' },
}

function ToastItem({ toast, onRemove }) {
  const [visible, setVisible] = useState(true)
  const c = COLORS[toast.type] || COLORS.info
  const Icon = ICONS[toast.type] || Info

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), toast.duration - 400)
    return () => clearTimeout(t)
  }, [toast.duration])

  return (
    <div
      style={{
        background:   c.bg,
        border:       `1px solid ${c.border}`,
        borderRadius: 10,
        padding:      '12px 16px',
        display:      'flex',
        alignItems:   'flex-start',
        gap:          10,
        maxWidth:     340,
        animation:    visible ? 'slideInRight 0.25s ease' : 'fadeOut 0.35s ease forwards',
        cursor:       'pointer',
      }}
      onClick={() => onRemove(toast.id)}
    >
      <Icon size={16} style={{ color: c.text, marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ color: c.text, fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
          {toast.type.toUpperCase()}
        </div>
        <div style={{ color: '#c9d1d9', fontSize: 13, fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
          {toast.message}
        </div>
      </div>
      <X size={14} style={{ color: c.text, flexShrink: 0, marginTop: 1 }} />
    </div>
  )
}

export function ToastContainer({ toasts, removeToast }) {
  return (
    <div style={{
      position:      'fixed',
      top:           20,
      right:         20,
      zIndex:        9999,
      display:       'flex',
      flexDirection: 'column',
      gap:           10,
      pointerEvents: 'none',
    }}>
      <style>{`
        @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; transform: translateX(10px); } }
      `}</style>
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'all' }}>
          <ToastItem toast={t} onRemove={removeToast} />
        </div>
      ))}
    </div>
  )
}

export function useToast() {
  const [toasts, setToasts] = useState([])

  const add = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type, duration }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration)
  }, [])

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, add, remove }
}
