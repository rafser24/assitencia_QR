import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, ClipboardList, UserPlus, Trash2, RefreshCw, User, Mail, Phone, BookOpen, Edit3, Check, X, FileText, Download, CreditCard } from 'lucide-react'
import { addDays, format } from 'date-fns'
import QRCode from 'qrcode'
import { es } from 'date-fns/locale'
import { useAttendanceLogic } from '../hooks/useAttendanceLogic'
import { generarReportePDF } from '../services/pdfReport'
import {
  getAlumnos, createAlumno, deleteAlumno,
  getAsistenciasSemana, getHistorialAlumno,
  getAsistenciasHoy, updateAlumno, createAsistencia, deleteAsistencia, registrarSalida,
} from '../services/firestoreService'

const C = {
  bg:'#f0f4ff', surface:'#ffffff', elevated:'#f8faff', border:'#dde4f5', borderSub:'#eaeffa',
  text:'#2d3561', muted:'#7b85b8', faint:'#b0b8d8',
  amber:'#f59e0b', amberBg:'#fef3c7', amberBorder:'#fde68a',
  green:'#10b981', greenBg:'#d1fae5', greenBorder:'#6ee7b7',
  red:'#ef4444', redBg:'#fee2e2', redBorder:'#fca5a5',
  blue:'#6366f1', blueBg:'#e0e7ff', blueBorder:'#a5b4fc',
}
const mono = "'JetBrains Mono', monospace"
const disp = "'Syne', sans-serif"

function EditableNumber({ value, onSave, label, color }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const handleSave = () => { const n = parseInt(val,10); if(!isNaN(n)&&n>=0) onSave(n); setEditing(false) }
  if (editing) return (
    <div style={{display:'flex',alignItems:'center',gap:4}}>
      <input type="number" min="0" value={val} onChange={e=>setVal(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter')handleSave();if(e.key==='Escape')setEditing(false)}} autoFocus
        style={{width:56,padding:'2px 6px',fontFamily:mono,fontSize:13,fontWeight:700,color:C.text,background:C.surface,border:`1px solid ${C.blue}`,borderRadius:6,outline:'none'}}/>
      <button onClick={handleSave} style={{background:'none',border:'none',cursor:'pointer',color:C.green}}><Check size={13}/></button>
      <button onClick={()=>setEditing(false)} style={{background:'none',border:'none',cursor:'pointer',color:C.red}}><X size={13}/></button>
    </div>
  )
  return (
    <div onClick={()=>{setVal(value);setEditing(true)}} title={`Editar ${label}`}
      style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
      <span style={{color,fontSize:13,fontWeight:700}}>{value}</span>
      <Edit3 size={10} style={{color:C.faint}}/>
    </div>
  )
}

// ── Modal editar día de asistencia ───────────────────────────────────────────

function ModalEditarDia({ alumno, diaNum, diaLabel, registro, onClose, onSaved, toast }) {
  const toDate = v => v instanceof Date ? v : (v?.toDate?.() ?? new Date(v))
  const ahora  = new Date()

  // Fecha del día seleccionado en la semana actual
  const fechaDia = (() => {
    const d = new Date(ahora)
    const diff = diaNum - d.getDay()
    d.setDate(d.getDate() + diff)
    return d
  })()

  const fmtH = (d) => {
    const h = d.getHours().toString().padStart(2,'0')
    const m = d.getMinutes().toString().padStart(2,'0')
    return `${h}:${m}`
  }

  const [entrada, setEntrada]       = useState(registro ? fmtH(toDate(registro.entrada)) : '13:00')
  const [salida,  setSalida]        = useState(registro?.salida ? fmtH(toDate(registro.salida)) : '16:00')
  const [esRepos, setEsRepos]       = useState(registro?.esReposicion || diaNum === 5)
  const [loading, setLoading]       = useState(false)

  const handleGuardar = async () => {
    setLoading(true)
    try {
      // ── Construir fechas ──────────────────────────────────────────────────
      const [eh, em] = entrada.split(':').map(Number)
      const [sh, sm] = salida.split(':').map(Number)
      const fechaEnt = new Date(fechaDia); fechaEnt.setHours(eh, em, 0, 0)
      const fechaSal = new Date(fechaDia); fechaSal.setHours(sh, sm, 0, 0)

      // ── Calcular minutos de retraso entrada (> 13:00) ─────────────────────
      const baseEnt  = new Date(fechaDia); baseEnt.setHours(13, 0, 0, 0)
      const minEnt   = Math.max(0, Math.round((fechaEnt - baseEnt) / 60000))

      // ── Calcular minutos de salida temprana (< 16:00) ─────────────────────
      const baseSal  = new Date(fechaDia); baseSal.setHours(16, 0, 0, 0)
      const minSal   = Math.max(0, Math.round((baseSal - fechaSal) / 60000))

      const minNuevos = minEnt + minSal   // total de minutos penalizables del día

      // ── Si edición: descontar los minutos del registro anterior ───────────
      let minutosBase = alumno.minutosAcumulados || 0
      let diasExtraBase = alumno.diasExtra || 0

      if (registro) {
        // Calcular cuántos minutos tenía el registro anterior
        const entAnterior = toDate(registro.entrada)
        const salAnterior = registro.salida ? toDate(registro.salida) : null

        const baseEntAnt = new Date(entAnterior); baseEntAnt.setHours(13,0,0,0)
        const minEntAnt  = Math.max(0, Math.round((entAnterior - baseEntAnt) / 60000))

        const baseSalAnt = new Date(entAnterior); baseSalAnt.setHours(16,0,0,0)
        const minSalAnt  = salAnterior ? Math.max(0, Math.round((baseSalAnt - salAnterior) / 60000)) : 0

        const minAnteriores = minEntAnt + minSalAnt

        // Revertir: restar minutos anteriores del acumulado actual
        // (trabajamos con el total histórico = diasExtra*180 + minutosAcumulados)
        const totalHistorico = diasExtraBase * 180 + minutosBase
        const totalRevertido = Math.max(0, totalHistorico - minAnteriores)
        diasExtraBase  = Math.floor(totalRevertido / 180)
        minutosBase    = totalRevertido % 180

        await deleteAsistencia(registro.id)
      }

      // ── Aplicar nuevos minutos ────────────────────────────────────────────
      const totalNuevo    = minutosBase + minNuevos
      const diasExtraNuevo = diasExtraBase + Math.floor(totalNuevo / 180)
      const minAcumNuevo   = totalNuevo % 180

      // ── Guardar asistencia en Firestore ───────────────────────────────────
      const asistenciaId = await createAsistencia({
        alumnoId:       alumno.uid,
        fecha:          fechaDia,
        entrada:        fechaEnt,
        minutosRetraso: minEnt,
        esReposicion:   esRepos,
      })

      // Registrar salida directamente (no necesita query intermedio)
      await registrarSalida(asistenciaId, fechaSal)

      // ── Actualizar perfil del alumno ──────────────────────────────────────
      await updateAlumno(alumno.uid, {
        minutosAcumulados: minAcumNuevo,
        diasExtra:         diasExtraNuevo,
      })

      // Feedback visual con desglose
      const partes = []
      if (minEnt > 0)  partes.push(`${minEnt}min entrada tarde`)
      if (minSal > 0)  partes.push(`${minSal}min salida temprana`)
      const detalle = partes.length > 0 ? ` (${partes.join(' + ')})` : ' — sin penalización'
      toast.add(`${diaLabel} guardado${detalle}`, 'success')

      onSaved()
      onClose()
    } catch(err) {
      console.error('ModalEditarDia error:', err)
      toast.add('Error: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleEliminar = async () => {
    if (!registro) return
    if (!window.confirm(`¿Eliminar la asistencia del ${diaLabel} de ${alumno.nombre}?`)) return
    setLoading(true)
    try {
      await deleteAsistencia(registro.id)
      toast.add(`Asistencia del ${diaLabel} eliminada`, 'info')
      onSaved()
      onClose()
    } catch(err) {
      toast.add('Error: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(45,53,97,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:950,padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:28,width:340,boxShadow:'0 20px 60px rgba(99,102,241,0.18)',animation:'fadeIn 0.2s ease'}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontSize:11,color:C.muted,fontFamily:mono,letterSpacing:'0.05em',marginBottom:3}}>EDITAR ASISTENCIA</div>
            <h3 style={{fontFamily:disp,fontSize:17,fontWeight:800,color:C.text}}>{diaLabel} — {alumno.nombre}</h3>
            <div style={{color:C.faint,fontSize:11,fontFamily:mono,marginTop:2}}>
              {fechaDia.toLocaleDateString('es-SV',{day:'2-digit',month:'long',year:'numeric'})}
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.faint,cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
        </div>

        {/* Campos */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          {[{label:'Hora entrada',val:entrada,set:setEntrada},{label:'Hora salida',val:salida,set:setSalida}].map(({label,val,set})=>(
            <div key={label}>
              <label style={{display:'block',fontSize:10,color:C.muted,fontFamily:mono,letterSpacing:'0.05em',marginBottom:5}}>{label.toUpperCase()}</label>
              <input type="time" value={val} onChange={e=>set(e.target.value)}
                style={{background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.text,fontFamily:mono,fontSize:13,width:'100%'}}/>
            </div>
          ))}
        </div>

        {/* Tipo */}
        <div style={{marginBottom:20}}>
          <label style={{display:'block',fontSize:10,color:C.muted,fontFamily:mono,letterSpacing:'0.05em',marginBottom:8}}>TIPO DE ASISTENCIA</label>
          <div style={{display:'flex',gap:8}}>
            {[{val:false,label:'Obligatorio',color:C.green,bg:C.greenBg,border:C.greenBorder},{val:true,label:'Reposición',color:C.blue,bg:C.blueBg,border:C.blueBorder}].map(op=>(
              <button key={String(op.val)} onClick={()=>setEsRepos(op.val)}
                style={{flex:1,padding:'8px',borderRadius:8,border:`2px solid ${esRepos===op.val?op.border:C.border}`,background:esRepos===op.val?op.bg:C.elevated,color:esRepos===op.val?op.color:C.muted,fontFamily:mono,fontSize:12,fontWeight:esRepos===op.val?700:400,cursor:'pointer',transition:'all 0.15s'}}>
                {op.label}
              </button>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div style={{display:'flex',gap:8}}>
          <button onClick={handleGuardar} disabled={loading}
            style={{flex:1,background:C.blue,border:'none',borderRadius:8,padding:'10px',color:'#fff',fontWeight:700,fontFamily:mono,fontSize:13,cursor:'pointer',opacity:loading?0.7:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            {loading?<div style={{width:13,height:13,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>:null}
            {registro ? 'Guardar cambios' : 'Agregar asistencia'}
          </button>
          {registro && (
            <button onClick={handleEliminar} disabled={loading}
              style={{background:C.redBg,border:`1px solid ${C.redBorder}`,borderRadius:8,padding:'10px 14px',color:C.red,cursor:'pointer',fontFamily:mono,fontSize:13}}>
              Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TablaAlumnos({ alumnos, asistenciasPorAlumno, logic, onSelectAlumno, onDelete, onUpdateAlumno, onEditarDia, onVerCarnet }) {
  const dias = [{num:2,label:'Mar'},{num:3,label:'Mié'},{num:4,label:'Jue'},{num:5,label:'Vie'}]
  const toDate = v => v instanceof Date ? v : new Date(v)

  return (
    <div style={{overflowX:'auto',borderRadius:14,border:`1px solid ${C.border}`,background:C.surface,boxShadow:'0 2px 16px rgba(99,102,241,0.06)'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontFamily:mono,fontSize:12}}>
        <thead>
          <tr style={{background:C.elevated,borderBottom:`1px solid ${C.border}`}}>
            {['Alumno',...dias.map(d=>d.label),'Min. Acum.','Días Extra',''].map((h,i)=>(
              <th key={i} style={{padding:'11px 14px',fontSize:10,color:C.muted,textAlign:i===0?'left':'center',fontWeight:700,letterSpacing:'0.07em',whiteSpace:'nowrap'}}>
                {h.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alumnos.map((alumno,idx)=>{
            const asistencias = asistenciasPorAlumno[alumno.uid]||[]
            const pct = Math.min(100,Math.round(((alumno.minutosAcumulados||0)/180)*100))
            return (
              <tr key={alumno.uid} onClick={()=>onSelectAlumno(alumno)}
                style={{borderBottom:`1px solid ${C.borderSub}`,background:idx%2===0?C.surface:C.elevated,cursor:'pointer',transition:'background 0.12s'}}>
                <td style={{padding:'10px 14px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    {alumno.fotoPerfil
                      ? <img src={alumno.fotoPerfil} alt="" style={{width:34,height:34,borderRadius:'50%',objectFit:'cover',border:`2px solid ${C.border}`,flexShrink:0}}/>
                      : <div style={{width:34,height:34,borderRadius:'50%',background:C.blueBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><User size={15} style={{color:C.blue}}/></div>
                    }
                    <div>
                      <div style={{color:C.text,fontWeight:700,fontSize:13}}>{alumno.nombre} {alumno.apellido||''}</div>
                      <div style={{color:C.faint,fontSize:10,marginTop:1}}>{alumno.nie||alumno.uid}</div>
                    </div>
                  </div>
                </td>

                {dias.map(({num,label})=>{
                  const reg = asistencias.find(a=>new Date(a.fecha).getDay()===num)
                  const esR = reg && num===5 && reg.esReposicion
                  return (
                    <td key={num} style={{padding:'8px 6px',textAlign:'center'}}
                      onClick={e=>{e.stopPropagation();onEditarDia(alumno,num,label,reg||null)}}>
                      {reg ? (
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:1,cursor:'pointer'}}>
                          <span title="Clic para editar" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:22,height:22,borderRadius:6,fontSize:11,fontWeight:800,background:esR?C.blueBg:C.greenBg,color:esR?C.blue:C.green,border:`1px solid ${esR?C.blueBorder:C.greenBorder}`,transition:'transform 0.1s'}}
                            onMouseEnter={e=>e.currentTarget.style.transform='scale(1.15)'}
                            onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                            {esR?'R':'✓'}
                          </span>
                          <span style={{fontSize:9,color:C.muted}}>{logic.formatTime(toDate(reg.entrada))}</span>
                          {reg.salida&&<span style={{fontSize:9,color:C.faint}}>{logic.formatTime(toDate(reg.salida))}</span>}
                        </div>
                      ) : (
                        <span title="Clic para agregar asistencia" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:22,height:22,borderRadius:6,background:C.elevated,color:C.faint,border:`1px solid ${C.border}`,fontSize:14,cursor:'pointer',transition:'all 0.15s'}}
                          onMouseEnter={e=>{e.currentTarget.style.background=C.greenBg;e.currentTarget.style.color=C.green;e.currentTarget.style.borderColor=C.greenBorder;e.currentTarget.textContent='+'}}
                          onMouseLeave={e=>{e.currentTarget.style.background=C.elevated;e.currentTarget.style.color=C.faint;e.currentTarget.style.borderColor=C.border;e.currentTarget.textContent='—'}}>—</span>
                      )}
                    </td>
                  )
                })}

                <td style={{padding:'10px 14px',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                    <EditableNumber value={alumno.minutosAcumulados||0} label="minutos acumulados"
                      color={pct>=80?C.red:pct>=50?C.amber:C.green}
                      onSave={v=>onUpdateAlumno(alumno.uid,{minutosAcumulados:v})}/>
                    <div style={{width:44,height:4,background:C.border,borderRadius:2,overflow:'hidden'}}>
                      <div style={{width:`${pct}%`,height:'100%',borderRadius:2,background:pct>=80?C.red:pct>=50?C.amber:C.green}}/>
                    </div>
                  </div>
                </td>

                <td style={{padding:'10px 14px',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                  <EditableNumber value={alumno.diasExtra||0} label="días extra"
                    color={(alumno.diasExtra||0)>0?C.red:C.green}
                    onSave={v=>onUpdateAlumno(alumno.uid,{diasExtra:v})}/>
                </td>

                <td style={{padding:'10px 8px',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                    <button onClick={()=>onVerCarnet(alumno)} title="Ver carnet"
                      style={{background:C.blueBg,border:`1px solid ${C.blueBorder}`,borderRadius:6,padding:'4px 8px',color:C.blue,cursor:'pointer'}}>
                      <CreditCard size={12}/>
                    </button>
                    <button onClick={()=>onDelete(alumno)} title="Eliminar"
                      style={{background:C.redBg,border:`1px solid ${C.redBorder}`,borderRadius:6,padding:'4px 8px',color:C.red,cursor:'pointer'}}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Modal Carnet del alumno ──────────────────────────────────────────────────

function ModalCarnet({ alumno, onClose }) {
  const carnetRef = useRef(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [loading, setLoading]     = useState(true)

  const azulOscuro = '#2a5298'
  const azulMedio  = '#3d6dbf'
  const azulClaro  = '#6e9fd6'
  const azulPastel = '#dce9f7'
  const grisTexto  = '#2c3e50'
  const grisLabel  = '#7f8c9a'

  useEffect(() => {
    if (alumno?.codigoQR) {
      QRCode.toDataURL(alumno.codigoQR, {
        width: 200, margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then(url => { setQrDataUrl(url); setLoading(false) })
        .catch(() => setLoading(false))
    } else { setLoading(false) }
  }, [alumno])

  const descargar = async () => {
    if (!window.html2canvas) {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
      document.head.appendChild(s)
      await new Promise(r => { s.onload = r })
    }
    const canvas = await window.html2canvas(carnetRef.current, {
      scale: 3, useCORS: true, backgroundColor: '#f0f5ff', logging: false,
    })
    const link = document.createElement('a')
    link.download = `carnet-${alumno.nie || alumno.uid}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const IconNIE = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  )
  const IconPerson = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
  const IconGrad = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>
  )
  const IconCal = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
  const IconMail = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
    </svg>
  )

  const campos = [
    { icon: <IconNIE/>,    label: 'NIE:',            valor: alumno.nie || alumno.uid },
    { icon: <IconPerson/>, label: 'Nombre(s):',       valor: alumno.nombre },
    { icon: <IconPerson/>, label: 'Apellido(s):',     valor: alumno.apellido },
    { icon: <IconGrad/>,   label: 'Carrera:',         valor: alumno.carrera },
    { icon: <IconCal/>,    label: 'Ciclo Académico:', valor: alumno.ciclo },
    { icon: <IconMail/>,   label: 'Correo:',          valor: alumno.email },
  ]

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(45,53,97,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20,overflowY:'auto'}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20,padding:'10px 0'}}>

        {loading ? (
          <div style={{color:'#fff',fontFamily:mono,fontSize:14}}>Generando carnet...</div>
        ) : (
          <>
            {/* ── CARNET ── */}
            <div ref={carnetRef} style={{width:340,fontFamily:"'Arial',sans-serif",borderRadius:18,overflow:'hidden',boxShadow:'0 24px 64px rgba(42,82,152,0.35)'}}>
              {/* Header */}
              <div style={{background:`linear-gradient(160deg,${azulOscuro} 0%,${azulMedio} 55%,${azulClaro} 100%)`,padding:'22px 24px 28px',position:'relative',overflow:'hidden',textAlign:'center'}}>
                <div style={{position:'absolute',top:8,right:16,width:10,height:10,borderTop:'2px solid rgba(255,255,255,0.4)',borderRight:'2px solid rgba(255,255,255,0.4)'}}/>
                <div style={{position:'absolute',top:14,right:30,width:6,height:6,borderRadius:'50%',border:'1.5px solid rgba(255,255,255,0.3)'}}/>
                <div style={{position:'absolute',top:20,left:12,width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderBottom:'8px solid rgba(255,255,255,0.2)'}}/>
                <div style={{position:'absolute',bottom:10,right:20,width:0,height:0,borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderTop:'7px solid rgba(255,255,255,0.15)'}}/>
                <div style={{position:'absolute',bottom:0,left:0,right:0,height:20,background:'rgba(255,255,255,0.08)',borderRadius:'60% 60% 0 0'}}/>
                <div style={{color:'rgba(255,255,255,0.92)',fontSize:10,fontWeight:700,letterSpacing:'0.18em',marginBottom:8,textTransform:'uppercase'}}>COED Cantón Guadalupe La Zorra</div>
                <div style={{color:'#ffffff',fontSize:15,fontWeight:700,lineHeight:1.15,letterSpacing:'0.02em',textShadow:'0 2px 8px rgba(0,0,0,0.2)'}}>CARNET DE REGISTRO</div>
                <div style={{color:'#ffffff',fontSize:15,fontWeight:700,lineHeight:1.15,letterSpacing:'0.02em',textShadow:'0 2px 8px rgba(0,0,0,0.2)'}}>DE ASISTENCIA</div>
              </div>
              {/* Cuerpo */}
              <div style={{background:'#ffffff',padding:'20px 22px 0'}}>
                <div style={{display:'flex',gap:16,marginBottom:18}}>
                  <div style={{flexShrink:0}}>
                    <div style={{width:96,height:96,borderRadius:'50%',border:`4px solid ${azulClaro}`,background:azulPastel,overflow:'hidden',boxShadow:`0 0 0 2px ${azulPastel},0 4px 16px rgba(42,82,152,0.18)`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {alumno.fotoPerfil
                        ? <img src={alumno.fotoPerfil} alt="" crossOrigin="anonymous" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                        : <User size={36} style={{color:azulClaro}}/>
                      }
                    </div>
                  </div>
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:7,justifyContent:'center'}}>
                    {campos.map(({icon,label,valor})=>(
                      <div key={label} style={{display:'flex',alignItems:'flex-start',gap:6}}>
                        <div style={{flexShrink:0,marginTop:1}}>{icon}</div>
                        <div>
                          <div style={{color:grisLabel,fontSize:9,fontWeight:700,lineHeight:1,letterSpacing:'0.04em'}}>{label}</div>
                          <div style={{color:grisTexto,fontSize:11,fontWeight:700,lineHeight:1.3,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{valor||'—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Footer QR */}
              <div style={{background:`linear-gradient(135deg,${azulOscuro} 0%,${azulMedio} 100%)`,padding:'14px 20px',display:'flex',alignItems:'center',gap:14}}>
                {qrDataUrl && (
                  <div style={{background:'#ffffff',padding:5,borderRadius:8,border:'2px solid rgba(255,255,255,0.3)',flexShrink:0}}>
                    <img src={qrDataUrl} alt="QR" style={{width:70,height:70,display:'block'}}/>
                  </div>
                )}
                <div style={{flex:1}}>
                  <div style={{color:'rgba(255,255,255,0.6)',fontSize:8,letterSpacing:'0.1em',marginBottom:4}}>CÓDIGO DE ASISTENCIA</div>
                  <div style={{color:'#ffffff',fontSize:11,fontWeight:800,letterSpacing:'0.06em',wordBreak:'break-all',marginBottom:8}}>{alumno.codigoQR}</div>
                  <div style={{borderTop:'1px solid rgba(255,255,255,0.2)',paddingTop:6}}>
                    <div style={{color:'#ffffff',fontSize:10,fontWeight:800,letterSpacing:'0.06em'}}>USO INSTITUCIONAL</div>
                    <div style={{color:'rgba(255,255,255,0.65)',fontSize:9}}>Válido hasta: Diciembre {new Date().getFullYear()}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Botones */}
            <div style={{display:'flex',gap:10}}>
              <button onClick={descargar}
                style={{background:'#2a5298',border:'none',borderRadius:12,padding:'11px 22px',color:'#fff',fontWeight:700,fontFamily:mono,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:7}}>
                <Download size={15}/> Descargar carnet
              </button>
              <button onClick={onClose}
                style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:12,padding:'11px 18px',color:'#fff',fontFamily:mono,fontSize:13,cursor:'pointer',backdropFilter:'blur(4px)'}}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ModalNuevoAlumno({ onClose, onCreated, toast }) {
  const [form,setForm] = useState({nombre:'',uid:'',codigoQR:''})
  const [loading,setLoading] = useState(false)
  const handleSubmit = async()=>{
    if(!form.nombre.trim()||!form.uid.trim()||!form.codigoQR.trim()){toast.add('Completa todos los campos','error');return}
    setLoading(true)
    try{await createAlumno(form.uid.trim(),{nombre:form.nombre.trim(),codigoQR:form.codigoQR.trim()});toast.add('Alumno creado','success');onCreated();onClose()}
    catch(err){toast.add('Error: '+err.message,'error')}finally{setLoading(false)}
  }
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(45,53,97,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:900}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:28,width:380,boxShadow:'0 20px 60px rgba(99,102,241,0.15)'}}>
        <h3 style={{fontFamily:disp,fontSize:18,marginBottom:20,color:C.text}}>Agregar Alumno</h3>
        {[{key:'nombre',label:'Nombre completo',ph:'García López, Sofía'},{key:'uid',label:'ID / Carnet',ph:'ALU001'},{key:'codigoQR',label:'Código QR',ph:'QR-ALU001'}].map(({key,label,ph})=>(
          <div key={key} style={{marginBottom:14}}>
            <label style={{display:'block',fontSize:11,color:C.muted,marginBottom:5,fontFamily:mono,letterSpacing:'0.05em'}}>{label.toUpperCase()}</label>
            <input value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}
              style={{background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontFamily:mono,fontSize:13,width:'100%',outline:'none'}}/>
          </div>
        ))}
        <div style={{display:'flex',gap:10,marginTop:20}}>
          <button onClick={handleSubmit} disabled={loading} style={{flex:1,background:C.blue,border:'none',borderRadius:8,padding:'10px',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',opacity:loading?0.7:1}}>
            {loading?'Guardando...':'CREAR ALUMNO'}
          </button>
          <button onClick={onClose} style={{background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 16px',color:C.muted,fontSize:13,cursor:'pointer'}}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function ModalHistorial({ alumno, onClose, logic, onUpdateAlumno, onVerCarnet }) {
  const [historial,setHistorial] = useState([])
  const [loading,setLoading]     = useState(true)
  const [error,setError]         = useState(null)
  const toDate = v => v instanceof Date ? v : new Date(v)

  useEffect(()=>{
    // SIN orderBy — solo where('alumnoId') para evitar índice compuesto
    getHistorialAlumno(alumno.uid,60)
      .then(h=>{
        const sorted = [...h].sort((a,b)=>toDate(b.fecha)-toDate(a.fecha))
        setHistorial(sorted)
      })
      .catch(err=>{console.error('Historial:',err);setError(err.message)})
      .finally(()=>setLoading(false))
  },[alumno.uid])

  const total      = historial.length
  const conRetraso = historial.filter(r=>r.minutosRetraso>0).length
  const repos      = historial.filter(r=>r.esReposicion).length
  const pct        = Math.min(100,Math.round(((alumno.minutosAcumulados||0)/180)*100))

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(45,53,97,0.5)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:900,overflowY:'auto',padding:'28px 16px'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:28,width:'100%',maxWidth:580,marginBottom:32,boxShadow:'0 24px 60px rgba(99,102,241,0.18)'}}>

        {/* Perfil */}
        <div style={{display:'flex',gap:16,marginBottom:20,paddingBottom:20,borderBottom:`1px solid ${C.border}`}}>
          {alumno.fotoPerfil
            ? <img src={alumno.fotoPerfil} alt="foto" style={{width:76,height:92,objectFit:'cover',borderRadius:12,border:`2px solid ${C.border}`,flexShrink:0}}/>
            : <div style={{width:76,height:92,borderRadius:12,background:C.blueBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><User size={28} style={{color:C.blue}}/></div>
          }
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <div>
                <h3 style={{fontFamily:disp,fontSize:19,color:C.text,fontWeight:800,marginBottom:2}}>{alumno.nombre} {alumno.apellido||''}</h3>
                <div style={{color:C.blue,fontSize:11,fontFamily:mono,fontWeight:700,marginBottom:8}}>NIE: {alumno.nie||alumno.uid}</div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>{ onClose(); setTimeout(()=>onVerCarnet&&onVerCarnet(alumno),50) }}
                  title="Ver e imprimir carnet"
                  style={{background:C.blueBg,border:`1px solid ${C.blueBorder}`,borderRadius:8,padding:'5px 10px',color:C.blue,cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontFamily:mono,fontSize:11,fontWeight:700}}>
                  <CreditCard size={12}/> Carnet
                </button>
                <button onClick={onClose} style={{background:'none',border:'none',color:C.faint,fontSize:22,cursor:'pointer'}}>×</button>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              {alumno.carrera&&<div style={{display:'flex',alignItems:'center',gap:6,color:C.muted,fontSize:12}}><BookOpen size={11}/>{alumno.carrera}{alumno.ciclo?` · ${alumno.ciclo}`:''}</div>}
              {alumno.email&&<div style={{display:'flex',alignItems:'center',gap:6,color:C.muted,fontSize:12}}><Mail size={11}/>{alumno.email}</div>}
              {alumno.telefono&&<div style={{display:'flex',alignItems:'center',gap:6,color:C.muted,fontSize:12}}><Phone size={11}/>{alumno.telefono}</div>}
            </div>
          </div>
        </div>

        {/* Stats editables */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}}>
          {[
            {label:'Asistencias',valor:total,       color:C.green,bg:C.greenBg, edit:false},
            {label:'Con retraso',valor:conRetraso,  color:C.amber,bg:C.amberBg, edit:false},
            {label:'Reposiciones',valor:repos,      color:C.blue, bg:C.blueBg,  edit:false},
            {label:'Días extra',  valor:alumno.diasExtra||0,color:(alumno.diasExtra||0)>0?C.red:C.green,bg:(alumno.diasExtra||0)>0?C.redBg:C.greenBg,edit:true},
          ].map(s=>(
            <div key={s.label} style={{background:s.bg,borderRadius:10,padding:'10px 8px',textAlign:'center',border:`1px solid ${C.border}`}}>
              {s.edit
                ? <div style={{display:'flex',justifyContent:'center',marginBottom:4}}><EditableNumber value={s.valor} label={s.label} color={s.color} onSave={v=>onUpdateAlumno(alumno.uid,{diasExtra:v})}/></div>
                : <div style={{color:s.color,fontSize:20,fontWeight:800,marginBottom:4}}>{s.valor}</div>
              }
              <div style={{color:C.muted,fontSize:9,fontFamily:mono,letterSpacing:'0.05em'}}>{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Barra minutos editable */}
        <div style={{background:C.elevated,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px',marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,alignItems:'center'}}>
            <span style={{color:C.muted,fontSize:11,fontFamily:mono}}>MINUTOS ACUMULADOS</span>
            <div style={{display:'flex',alignItems:'center',gap:4}}>
              <EditableNumber value={alumno.minutosAcumulados||0} label="minutos acumulados" color={C.text}
                onSave={v=>onUpdateAlumno(alumno.uid,{minutosAcumulados:v})}/>
              <span style={{color:C.muted,fontSize:11,fontFamily:mono}}>/ 180 min</span>
            </div>
          </div>
          <div style={{height:8,background:C.border,borderRadius:4,overflow:'hidden'}}>
            <div style={{width:`${pct}%`,height:'100%',borderRadius:4,background:pct>=80?C.red:pct>=50?C.amber:C.green,transition:'width 0.5s'}}/>
          </div>
        </div>

        {/* Historial */}
        <div style={{fontSize:10,color:C.faint,fontFamily:mono,marginBottom:8,letterSpacing:'0.06em'}}>HISTORIAL DE ASISTENCIAS ({total})</div>

        {loading ? (
          <div style={{textAlign:'center',padding:28,color:C.muted}}>
            <div style={{width:20,height:20,border:`2px solid ${C.blue}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite',margin:'0 auto 10px'}}/>
            Cargando historial...
          </div>
        ) : error ? (
          <div style={{background:C.redBg,border:`1px solid ${C.redBorder}`,borderRadius:8,padding:14,color:C.red,fontSize:12,fontFamily:mono}}>⚠ {error}</div>
        ) : historial.length===0 ? (
          <div style={{textAlign:'center',color:C.faint,padding:28,fontSize:13}}>Sin registros de asistencia aún.</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:300,overflowY:'auto',paddingRight:4}}>
            {historial.map(r=>{
              const fecha  = toDate(r.fecha)
              const entrada= toDate(r.entrada)
              const salida = r.salida ? toDate(r.salida) : null
              const activo = !salida
              return (
                <div key={r.id} style={{background:activo?C.greenBg:C.elevated,border:`1px solid ${activo?C.greenBorder:C.border}`,borderRadius:10,padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div>
                    <div style={{color:C.text,fontSize:13,fontWeight:700,textTransform:'capitalize'}}>
                      {format(fecha,"EEEE d 'de' MMM yyyy",{locale:es})}
                    </div>
                    <div style={{color:C.muted,fontSize:11,marginTop:3,fontFamily:mono}}>
                      ↓ {logic.formatTime(entrada)}{salida?` · ↑ ${logic.formatTime(salida)}`:' · Sin salida'}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'flex-end',flexShrink:0}}>
                    {r.minutosRetraso>0&&<span style={{background:C.amberBg,border:`1px solid ${C.amberBorder}`,color:C.amber,borderRadius:4,padding:'2px 7px',fontSize:10,fontFamily:mono,fontWeight:700}}>+{r.minutosRetraso}min</span>}
                    {r.esReposicion&&<span style={{background:C.blueBg,border:`1px solid ${C.blueBorder}`,color:C.blue,borderRadius:4,padding:'2px 7px',fontSize:10,fontFamily:mono,fontWeight:700}}>REPOS.</span>}
                    {activo&&<span style={{background:C.greenBg,border:`1px solid ${C.greenBorder}`,color:C.green,borderRadius:4,padding:'2px 7px',fontSize:10,fontFamily:mono,fontWeight:700}}>ACTIVO</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminPage({ toast }) {
  const logic = useAttendanceLogic()
  const [alumnos,setAlumnos]                 = useState([])
  const [asistenciasPorAlumno,setAsistencias]= useState({})
  const [asistenciasHoy,setAsistenciasHoy]   = useState([])
  const [loading,setLoading]                 = useState(true)
  const [tab,setTab]                         = useState('semana')
  const [showModal,setShowModal]             = useState(false)
  const [alumnoSel,setAlumnoSel]             = useState(null)
  const [generandoPDF,setGenerandoPDF]       = useState(false)
  const [editarDia,setEditarDia]             = useState(null)  // {alumno,diaNum,diaLabel,registro}
  const [verCarnet,setVerCarnet]             = useState(null)   // alumno

  const ahora     = new Date()
  const weekStart = logic.getWeekStart(ahora)
  const weekEnd   = addDays(weekStart,7)

  const cargarDatos = useCallback(async()=>{
    setLoading(true)
    try {
      const lista = await getAlumnos()
      setAlumnos(lista)
      const entries = await Promise.all(lista.map(async a=>[a.uid,await getAsistenciasSemana(a.uid,weekStart,weekEnd)]))
      setAsistencias(Object.fromEntries(entries))
      setAsistenciasHoy(await getAsistenciasHoy(ahora))
    } catch(err){ toast.add('Error al cargar: '+err.message,'error') }
    finally { setLoading(false) }
  },[]) // eslint-disable-line

  useEffect(()=>{ cargarDatos() },[])

  const handleDelete = async(alumno)=>{
    if(!window.confirm(`¿Eliminar a ${alumno.nombre}?`)) return
    try{ await deleteAlumno(alumno.uid); toast.add('Eliminado','info'); cargarDatos() }
    catch(err){ toast.add('Error: '+err.message,'error') }
  }

  const handleUpdateAlumno = async(uid,updates)=>{
    try{
      await updateAlumno(uid,updates)
      setAlumnos(prev=>prev.map(a=>a.uid===uid?{...a,...updates}:a))
      if(alumnoSel?.uid===uid) setAlumnoSel(prev=>({...prev,...updates}))
      toast.add('Actualizado','success')
    } catch(err){ toast.add('Error: '+err.message,'error') }
  }

  const handleGenerarPDF = async () => {
    if (alumnos.length === 0) { toast.add('No hay alumnos para reportar', 'warn'); return }
    setGenerandoPDF(true)
    try {
      const semanaLabel = `${format(weekStart,"d MMM",{locale:es})} – ${format(addDays(weekEnd,-1),"d MMM yyyy",{locale:es})}`
      await generarReportePDF({ alumnos, getHistorialAlumno, semanaLabel })
      toast.add('Reporte PDF generado y descargado', 'success')
    } catch(err) {
      console.error('PDF error:', err)
      toast.add('Error al generar PDF: ' + err.message, 'error')
    } finally { setGenerandoPDF(false) }
  }

  const stats = {
    total:alumnos.length, hoy:asistenciasHoy.length,
    diasExtra:alumnos.reduce((s,a)=>s+(a.diasExtra||0),0),
    conRetraso:alumnos.filter(a=>(a.minutosAcumulados||0)>0).length,
  }

  return (
    <div style={{maxWidth:960,margin:'0 auto',padding:'0 0 60px'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} tr:hover>td{background:#eef2ff!important}`}</style>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12,marginBottom:28}}>
        <div>
          <div style={{display:'inline-block',background:C.blueBg,border:`1px solid ${C.blueBorder}`,borderRadius:6,padding:'3px 10px',fontSize:10,color:C.blue,fontFamily:mono,fontWeight:700,letterSpacing:'0.06em',marginBottom:10}}>PANEL DE ADMINISTRACIÓN</div>
          <h2 style={{fontFamily:disp,fontSize:26,fontWeight:800,color:C.text,marginBottom:4}}>Control de Prácticas</h2>
          <div style={{color:C.muted,fontSize:12,fontFamily:mono}}>Semana: {format(weekStart,"d MMM",{locale:es})} – {format(addDays(weekEnd,-1),"d MMM yyyy",{locale:es})}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={cargarDatos} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 14px',color:C.muted,display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer',fontFamily:mono}}>
            <RefreshCw size={13}/> Actualizar
          </button>
          <button onClick={handleGenerarPDF} disabled={generandoPDF||alumnos.length===0}
            style={{background:generandoPDF?'#a5b4fc':'#10b981',border:'none',borderRadius:8,padding:'8px 18px',color:'#fff',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:6,cursor:generandoPDF?'not-allowed':'pointer',fontFamily:mono,opacity:alumnos.length===0?0.5:1}}>
            {generandoPDF?(<><div style={{width:13,height:13,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>Generando...</>):(<><FileText size={14}/> Reporte PDF</>)}
          </button>
          <button onClick={()=>setShowModal(true)} style={{background:C.blue,border:'none',borderRadius:8,padding:'8px 18px',color:'#fff',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontFamily:mono}}>
            <UserPlus size={14}/> Nuevo Alumno
          </button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:12,marginBottom:24}}>
        {[
          {label:'Total alumnos',  valor:stats.total,     color:C.blue,  bg:'#eef2ff'},
          {label:'Entradas hoy',   valor:stats.hoy,       color:C.green, bg:C.greenBg},
          {label:'Días extra tot.',valor:stats.diasExtra, color:C.red,   bg:C.redBg},
          {label:'Con retraso ac.',valor:stats.conRetraso,color:C.amber, bg:C.amberBg},
        ].map(s=>(
          <div key={s.label} style={{background:s.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 16px'}}>
            <div style={{color:C.faint,fontSize:10,marginBottom:6,fontFamily:mono,letterSpacing:'0.06em'}}>{s.label.toUpperCase()}</div>
            <div style={{color:s.color,fontSize:28,fontWeight:800}}>{s.valor}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',marginBottom:20,borderBottom:`2px solid ${C.border}`}}>
        {[{key:'semana',label:'Vista Semanal',icon:<ClipboardList size={14}/>},{key:'alumnos',label:'Todos los Alumnos',icon:<Users size={14}/>}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{background:'none',border:'none',borderBottom:`3px solid ${tab===t.key?C.blue:'transparent'}`,marginBottom:-2,padding:'10px 18px',color:tab===t.key?C.blue:C.muted,fontSize:13,fontWeight:tab===t.key?700:400,display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontFamily:mono,transition:'all 0.2s'}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:60,color:C.muted}}>
          <div style={{width:24,height:24,border:`2px solid ${C.blue}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite',margin:'0 auto 12px'}}/>
          Cargando datos...
        </div>
      ) : alumnos.length===0 ? (
        <div style={{textAlign:'center',padding:60}}>
          <div style={{fontSize:40,marginBottom:12}}>👤</div>
          <div style={{color:C.muted}}>No hay alumnos registrados.</div>
          <button onClick={()=>setShowModal(true)} style={{marginTop:16,background:C.blue,border:'none',borderRadius:8,padding:'10px 24px',color:'#fff',fontWeight:700,cursor:'pointer'}}>Agregar primer alumno</button>
        </div>
      ) : (
        <TablaAlumnos alumnos={alumnos} asistenciasPorAlumno={asistenciasPorAlumno} logic={logic} onSelectAlumno={setAlumnoSel} onDelete={handleDelete} onUpdateAlumno={handleUpdateAlumno}
          onEditarDia={(alumno,diaNum,diaLabel,registro)=>setEditarDia({alumno,diaNum,diaLabel,registro})}
          onVerCarnet={setVerCarnet}/>
      )}

      {!loading&&alumnos.length>0&&(
        <div style={{marginTop:14,display:'flex',gap:14,flexWrap:'wrap',alignItems:'center'}}>
          {[{color:C.green,bg:C.greenBg,border:C.greenBorder,label:'✓ Asistió'},{color:C.blue,bg:C.blueBg,border:C.blueBorder,label:'R Reposición'},{color:C.faint,bg:C.elevated,border:C.border,label:'— Ausente'}].map(l=>(
            <div key={l.label} style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:4,background:l.bg,border:`1px solid ${l.border}`,color:l.color,fontSize:9,fontWeight:800}}>{l.label.charAt(0)}</span>
              <span style={{color:C.muted,fontSize:11,fontFamily:mono}}>{l.label}</span>
            </div>
          ))}
          <div style={{color:C.faint,fontSize:11,marginLeft:'auto',fontFamily:mono}}>Clic en alumno → perfil · Clic en número → editar</div>
        </div>
      )}

      {showModal&&<ModalNuevoAlumno onClose={()=>setShowModal(false)} onCreated={cargarDatos} toast={toast}/>}
      {alumnoSel&&<ModalHistorial alumno={alumnoSel} onClose={()=>setAlumnoSel(null)} logic={logic} onUpdateAlumno={handleUpdateAlumno} onVerCarnet={setVerCarnet}/>}
      {editarDia&&<ModalEditarDia alumno={editarDia.alumno} diaNum={editarDia.diaNum} diaLabel={editarDia.diaLabel} registro={editarDia.registro} onClose={()=>setEditarDia(null)} onSaved={cargarDatos} toast={toast}/>}
      {verCarnet&&<ModalCarnet alumno={verCarnet} onClose={()=>setVerCarnet(null)}/>}
    </div>
  )
}
