import { useState, useRef, useEffect } from 'react'
import { User, Camera, Upload, CheckCircle, AlertTriangle, ChevronRight, X, Download, RotateCcw } from 'lucide-react'
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import QRCode from 'qrcode'

const C = {
  bg:'#f0f4ff', surface:'#ffffff', elevated:'#f8faff', border:'#dde4f5',
  text:'#2d3561', muted:'#7b85b8', faint:'#b0b8d8',
  blue:'#6366f1', blueBg:'#e0e7ff', blueBorder:'#a5b4fc',
  green:'#10b981', greenBg:'#d1fae5', greenBorder:'#6ee7b7',
  red:'#ef4444', redBg:'#fee2e2', redBorder:'#fca5a5',
  amber:'#f59e0b', amberBg:'#fef3c7',
}
const mono = "'JetBrains Mono', monospace"
const disp = "'Syne', sans-serif"

function generateUID(nie)  { return `ALU-${nie.toUpperCase().replace(/\s/g,'')}` }
function generateQR(nie)   { return `QR-${nie.toUpperCase().replace(/\s/g,'')}` }

async function checkExiste(nie) {
  const snap = await getDocs(query(collection(db,'alumnos'), where('nie','==',nie.toUpperCase().trim())))
  if (snap.empty) return null
  return { uid: snap.docs[0].id, ...snap.docs[0].data() }
}

async function registrarAlumno(datos, foto) {
  const nie = datos.nie.toUpperCase().trim()
  const uid = generateUID(nie)
  const qr  = generateQR(nie)
  await setDoc(doc(db,'alumnos',uid), {
    nie, nombre:datos.nombre.trim(), apellido:datos.apellido.trim(),
    carrera:datos.carrera.trim(), ciclo:datos.ciclo.trim(),
    email:datos.email.trim().toLowerCase(), telefono:datos.telefono.trim(),
    codigoQR:qr, fotoPerfil:foto||null,
    minutosAcumulados:0, diasExtra:0, historialFaltas:[],
    creadoEn:new Date().toISOString(),
  })
  return { uid, qr, nie }
}

function ModalDuplicado({ alumno, onClose }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(45,53,97,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:32,maxWidth:380,width:'100%',boxShadow:'0 24px 60px rgba(99,102,241,0.2)',animation:'fadeIn 0.25s ease'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:C.amberBg,border:`2px solid ${C.amber}`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
          <AlertTriangle size={26} style={{color:C.amber}}/>
        </div>
        <h3 style={{fontFamily:disp,fontSize:20,fontWeight:800,color:C.text,textAlign:'center',marginBottom:8}}>Estudiante ya registrado</h3>
        <p style={{color:C.muted,fontSize:13,textAlign:'center',lineHeight:1.6,marginBottom:24,fontFamily:mono}}>
          El NIE <strong style={{color:C.blue}}>{alumno.nie}</strong> ya existe. No es posible registrarse dos veces.
        </p>
        <div style={{background:C.elevated,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 18px',marginBottom:24}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {alumno.fotoPerfil
              ? <img src={alumno.fotoPerfil} alt="" style={{width:44,height:44,borderRadius:'50%',objectFit:'cover',border:`2px solid ${C.border}`}}/>
              : <div style={{width:44,height:44,borderRadius:'50%',background:C.blueBg,display:'flex',alignItems:'center',justifyContent:'center'}}><User size={20} style={{color:C.blue}}/></div>
            }
            <div>
              <div style={{color:C.text,fontWeight:700,fontSize:14}}>{alumno.nombre} {alumno.apellido||''}</div>
              <div style={{color:C.muted,fontSize:12,fontFamily:mono}}>NIE: {alumno.nie}</div>
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{width:'100%',background:C.blue,border:'none',borderRadius:10,padding:'11px',color:'#fff',fontWeight:700,fontFamily:mono,fontSize:13,cursor:'pointer'}}>Entendido</button>
      </div>
    </div>
  )
}

function CarnetDigital({ alumno, qrDataUrl, onReset }) {
  const carnetRef = useRef(null)

  const descargar = async () => {
    if (!window.html2canvas) {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
      document.head.appendChild(s); await new Promise(r => { s.onload = r })
    }
    const canvas = await window.html2canvas(carnetRef.current, {
      scale: 3, useCORS: true, backgroundColor: '#f0f5ff',
      logging: false,
    })
    const link = document.createElement('a')
    link.download = `carnet-${alumno.nie}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  // Paleta institucional azul-gris (igual a la imagen)
  const azulOscuro  = '#2a5298'
  const azulMedio   = '#3d6dbf'
  const azulClaro   = '#6e9fd6'
  const azulPastel  = '#dce9f7'
  const grisTexto   = '#2c3e50'
  const grisLabel   = '#7f8c9a'
  const ANCHO       = 360

  // Íconos SVG inline para cada campo (coinciden con la imagen)
  const IconNIE = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  )
  const IconPerson = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
  const IconGrad = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>
  )
  const IconCal = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
  const IconMail = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={azulMedio} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
    </svg>
  )

  const campos = [
    { icon: <IconNIE/>,    label: 'NIE:',             valor: alumno.nie },
    { icon: <IconPerson/>, label: 'Nombre(s):',        valor: alumno.nombre },
    { icon: <IconPerson/>, label: 'Apellido(s):',      valor: alumno.apellido },
    { icon: <IconGrad/>,   label: 'Carrera:',          valor: alumno.carrera },
    { icon: <IconCal/>,    label: 'Ciclo Académico:',  valor: alumno.ciclo },
    { icon: <IconMail/>,   label: 'Correo:',           valor: alumno.email },
  ]

  return (
    <div style={{ textAlign: 'center' }}>
      {/* Badge de éxito */}
      <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRadius:10, padding:'8px 18px', marginBottom:20 }}>
        <CheckCircle size={16} style={{ color: C.green }}/>
        <span style={{ color:C.green, fontSize:13, fontFamily:mono, fontWeight:700 }}>REGISTRO EXITOSO</span>
      </div>
      <h2 style={{ fontFamily:disp, fontSize:22, fontWeight:800, color:C.text, marginBottom:6 }}>Tu carnet está listo</h2>
      <p style={{ color:C.muted, fontSize:13, marginBottom:24, fontFamily:mono }}>Descárgalo e imprímelo. El QR es tu identificador de asistencia.</p>

      {/* ── CARNET ── */}
      <div style={{ display:'flex', justifyContent:'center', marginBottom:28 }}>
        <div ref={carnetRef} style={{
          width: ANCHO,
          background: '#f0f5ff',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(42,82,152,0.22)',
          fontFamily: "'Arial', sans-serif",
        }}>

          {/* ── HEADER AZUL ONDULADO ── */}
          <div style={{
            background: `linear-gradient(160deg, ${azulOscuro} 0%, ${azulMedio} 55%, ${azulClaro} 100%)`,
            padding: '22px 24px 28px',
            position: 'relative',
            overflow: 'hidden',
            textAlign: 'center',
          }}>
            {/* Formas geométricas decorativas (como en la imagen) */}
            <div style={{ position:'absolute', top:8,  right:16, width:10, height:10, borderTop:`2px solid rgba(255,255,255,0.4)`, borderRight:`2px solid rgba(255,255,255,0.4)` }}/>
            <div style={{ position:'absolute', top:14, right:30, width:6,  height:6,  borderRadius:'50%', border:`1.5px solid rgba(255,255,255,0.3)` }}/>
            <div style={{ position:'absolute', top:20, left:12, width:0, height:0, borderLeft:'5px solid transparent', borderRight:'5px solid transparent', borderBottom:`8px solid rgba(255,255,255,0.2)` }}/>
            <div style={{ position:'absolute', bottom:10, right:20, width:0, height:0, borderLeft:'4px solid transparent', borderRight:'4px solid transparent', borderTop:`7px solid rgba(255,255,255,0.15)` }}/>
            {/* Onda inferior decorativa */}
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:20, background:'rgba(255,255,255,0.08)', borderRadius:'60% 60% 0 0' }}/>

            {/* Nombre institución */}
            <div style={{ color:'rgba(255,255,255,0.92)', fontSize:10, fontWeight:600, letterSpacing:'0.18em', marginBottom:8, textTransform:'uppercase' }}>
              COED Cantón Guadalupe La Zorra
            </div>
            {/* Título */}
            <div style={{ color:'#ffffff', fontSize:20, fontWeight:500, lineHeight:1.15, letterSpacing:'0.02em', textShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
              CARNET DE REGISTRO
            </div>
            <div style={{ color:'#ffffff', fontSize:20, fontWeight:500, lineHeight:1.15, letterSpacing:'0.02em', textShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
              DE ASISTENCIA
            </div>
          </div>

          {/* ── CUERPO BLANCO ── */}
          <div style={{ background:'#ffffff', padding:'20px 22px 0' }}>

            {/* Sección foto + datos */}
            <div style={{ display:'flex', gap:16, marginBottom:18 }}>

              {/* Foto circular con borde azul (exacto al modelo) */}
              <div style={{ flexShrink:0, position:'relative' }}>
                <div style={{
                  width: 96, height: 96,
                  borderRadius: '50%',
                  border: `4px solid ${azulClaro}`,
                  background: azulPastel,
                  overflow: 'hidden',
                  boxShadow: `0 0 0 2px ${azulPastel}, 0 4px 16px rgba(42,82,152,0.18)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {alumno.fotoPerfil
                    ? <img src={alumno.fotoPerfil} alt="" crossOrigin="anonymous"
                        style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                    : <User size={36} style={{ color: azulClaro }}/>
                  }
                </div>
              </div>

              {/* Datos del alumno con íconos */}
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:7, justifyContent:'center' }}>
                {campos.map(({ icon, label, valor }) => (
                  <div key={label} style={{ display:'flex', alignItems:'flex-start', gap:6 }}>
                    <div style={{ flexShrink:0, marginTop:1 }}>{icon}</div>
                    <div>
                      <div style={{ color:grisLabel, fontSize:9, fontWeight:700, lineHeight:1, letterSpacing:'0.04em' }}>{label}</div>
                      <div style={{ color:grisTexto, fontSize:11, fontWeight:700, lineHeight:1.3,
                        maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {valor || '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── FOOTER AZUL OSCURO con QR ── */}
          <div style={{
            background: `linear-gradient(135deg, ${azulOscuro} 0%, ${azulMedio} 100%)`,
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}>
            {/* QR */}
            {qrDataUrl && (
              <div style={{
                background: '#ffffff',
                padding: 5,
                borderRadius: 8,
                border: `2px solid rgba(255,255,255,0.3)`,
                flexShrink: 0,
              }}>
                <img src={qrDataUrl} alt="QR" style={{ width: 70, height: 70, display:'block' }}/>
              </div>
            )}

            {/* Código + uso institucional */}
            <div style={{ flex:1 }}>
              <div style={{ color:'rgba(255,255,255,0.6)', fontSize:8, letterSpacing:'0.1em', marginBottom:4 }}>
                CÓDIGO DE ASISTENCIA
              </div>
              <div style={{ color:'#ffffff', fontSize:11, fontWeight:800, letterSpacing:'0.06em', wordBreak:'break-all', marginBottom:8 }}>
                {alumno.codigoQR}
              </div>
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.2)', paddingTop:6 }}>
                <div style={{ color:'#ffffff', fontSize:10, fontWeight:800, letterSpacing:'0.06em' }}>USO INSTITUCIONAL</div>
                <div style={{ color:'rgba(255,255,255,0.65)', fontSize:9 }}>
                  Válido hasta: Diciembre {new Date().getFullYear()}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Botones */}
      <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
        <button onClick={descargar} style={{ background:azulOscuro, border:'none', borderRadius:12, padding:'11px 22px', color:'#fff', fontWeight:700, fontFamily:mono, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:7 }}>
          <Download size={15}/> Descargar carnet
        </button>
        <button onClick={onReset} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:'11px 18px', color:C.muted, fontFamily:mono, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:7 }}>
          <RotateCcw size={14}/> Nuevo registro
        </button>
      </div>
    </div>
  )
}

function FotoUploader({ foto, onFoto }) {
  const inputRef=useRef(null), streamRef=useRef(null), videoRef=useRef(null)
  const [modo,setModo]=useState('upload')
  const abrirCamara=async()=>{try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});streamRef.current=s;setModo('camara');setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=s},100)}catch{alert('Sin acceso a cámara.')}}
  const cerrar=()=>{if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());setModo('upload')}
  const capturar=()=>{const v=videoRef.current,c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);onFoto(c.toDataURL('image/jpeg',0.85));cerrar()}
  const handleFile=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>onFoto(r.result);r.readAsDataURL(f)}
  useEffect(()=>()=>{if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop())},[])

  if(modo==='camara') return (
    <div style={{border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
      <video ref={videoRef} autoPlay playsInline muted style={{width:'100%',display:'block',maxHeight:200,objectFit:'cover'}}/>
      <div style={{display:'flex',gap:8,padding:10}}>
        <button onClick={capturar} style={{flex:1,background:C.blue,border:'none',borderRadius:8,padding:'8px',color:'#fff',fontWeight:700,fontFamily:mono,fontSize:12,cursor:'pointer'}}>📸 Capturar</button>
        <button onClick={cerrar} style={{background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',color:C.muted,cursor:'pointer'}}><X size={14}/></button>
      </div>
    </div>
  )
  return (
    <div>
      {foto ? (
        <div style={{position:'relative',display:'inline-block'}}>
          <img src={foto} alt="" style={{width:90,height:110,objectFit:'cover',borderRadius:12,border:`2px solid ${C.greenBorder}`,display:'block'}}/>
          <button onClick={()=>onFoto(null)} style={{position:'absolute',top:-6,right:-6,background:C.red,border:'none',borderRadius:'50%',width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><X size={11} style={{color:'#fff'}}/></button>
        </div>
      ) : (
        <div style={{border:`2px dashed ${C.border}`,borderRadius:12,padding:'22px 16px',textAlign:'center',background:C.elevated}}>
          <User size={30} style={{color:C.faint,marginBottom:8}}/>
          <div style={{color:C.muted,fontSize:12,fontFamily:mono,marginBottom:12}}>Foto de perfil requerida</div>
          <div style={{display:'flex',gap:8,justifyContent:'center'}}>
            <button onClick={()=>inputRef.current?.click()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 12px',color:C.text,cursor:'pointer',fontFamily:mono,fontSize:12,display:'flex',alignItems:'center',gap:5}}><Upload size={13}/> Subir</button>
            <button onClick={abrirCamara} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 12px',color:C.text,cursor:'pointer',fontFamily:mono,fontSize:12,display:'flex',alignItems:'center',gap:5}}><Camera size={13}/> Cámara</button>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleFile}/>
    </div>
  )
}

const CAMPOS=[
  {key:'nie',      label:'NIE',             placeholder:'00000000-0',    full:true,hint:'Número de Identificación Estudiantil'},
  {key:'nombre',   label:'Nombre(s)',        placeholder:'María José'},
  {key:'apellido', label:'Apellido(s)',      placeholder:'García López'},
  {key:'carrera',  label:'Carrera',          placeholder:'Ing. Sistemas'},
  {key:'ciclo',    label:'Ciclo académico',  placeholder:'2025-I'},
  {key:'email',    label:'Correo',           placeholder:'alumno@uni.edu', type:'email'},
  {key:'telefono', label:'Teléfono',         placeholder:'7000-0000',      type:'tel'},
]

export default function RegistroPage({ toast }) {
  const [form,setForm]=useState({nie:'',nombre:'',apellido:'',carrera:'',ciclo:'',email:'',telefono:''})
  const [foto,setFoto]=useState(null)
  const [errores,setErrores]=useState({})
  const [loading,setLoading]=useState(false)
  const [paso,setPaso]=useState(1)
  const [alumno,setAlumno]=useState(null)
  const [qrDataUrl,setQrUrl]=useState(null)
  const [duplicado,setDuplicado]=useState(null)

  const setField=(k,v)=>{setForm(f=>({...f,[k]:v}));setErrores(e=>({...e,[k]:undefined}))}
  const validar=()=>{
    const e={}
    if(!form.nie.trim())      e.nie='NIE obligatorio'
    if(!form.nombre.trim())   e.nombre='Nombre obligatorio'
    if(!form.apellido.trim()) e.apellido='Apellido obligatorio'
    if(!form.carrera.trim())  e.carrera='Carrera obligatoria'
    if(!form.ciclo.trim())    e.ciclo='Ciclo obligatorio'
    if(!form.email.trim())    e.email='Correo obligatorio'
    else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email='Correo inválido'
    if(!form.telefono.trim()) e.telefono='Teléfono obligatorio'
    if(!foto)                 e.foto='Foto obligatoria'
    return e
  }

  const handleSubmit=async()=>{
    const e=validar(); if(Object.keys(e).length>0){setErrores(e);return}
    setLoading(true)
    try{
      const existe=await checkExiste(form.nie)
      if(existe){setDuplicado(existe);setLoading(false);return}
      const{uid,qr,nie}=await registrarAlumno(form,foto)
      const qrUrl=await QRCode.toDataURL(qr,{width:200,margin:1,color:{dark:'#000000',light:'#ffffff'}})
      setQrUrl(qrUrl)
      setAlumno({...form,nie,uid,codigoQR:qr,fotoPerfil:foto})
      setPaso(2)
      toast.add(`¡${form.nombre} registrado!`,'success')
    }catch(err){console.error(err);toast.add('Error: '+err.message,'error')}
    finally{setLoading(false)}
  }

  const handleReset=()=>{setForm({nie:'',nombre:'',apellido:'',carrera:'',ciclo:'',email:'',telefono:''});setFoto(null);setErrores({});setPaso(1);setAlumno(null);setQrUrl(null)}

  if(paso===2&&alumno) return (
    <div style={{maxWidth:520,margin:'0 auto',padding:'0 0 60px'}}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <CarnetDigital alumno={alumno} qrDataUrl={qrDataUrl} onReset={handleReset}/>
    </div>
  )

  return (
    <div style={{maxWidth:560,margin:'0 auto',padding:'0 0 60px'}}>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes spin{to{transform:rotate(360deg)}} input:focus{outline:none;border-color:${C.blue}!important;box-shadow:0 0 0 3px ${C.blueBg}!important}`}</style>

      {duplicado&&<ModalDuplicado alumno={duplicado} onClose={()=>setDuplicado(null)}/>}

      <div style={{marginBottom:28}}>
        <div style={{display:'inline-block',background:C.blueBg,border:`1px solid ${C.blueBorder}`,borderRadius:6,padding:'3px 10px',fontSize:10,color:C.blue,fontFamily:mono,fontWeight:700,letterSpacing:'0.06em',marginBottom:12}}>PRÁCTICAS PROFESIONALES</div>
        <h1 style={{fontFamily:disp,fontSize:20,fontWeight:600,color:C.text,letterSpacing:-0.5,marginBottom:6}}>Registro de Estudiante</h1>
        <p style={{color:C.muted,fontSize:13,fontFamily:mono,lineHeight:1.6}}>Completa todos los campos. Al finalizar recibirás tu carnet con código QR.</p>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:28}}>
        {['Datos personales','Tu carnet QR'].map((label,i)=>(
          <div key={i} style={{flex:1}}>
            <div style={{height:4,borderRadius:2,background:paso>i?C.blue:C.border,marginBottom:6,transition:'background 0.4s'}}/>
            <div style={{fontSize:10,fontFamily:mono,color:paso>i?C.blue:C.faint}}>{i+1}. {label}</div>
          </div>
        ))}
      </div>

      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:28,boxShadow:'0 4px 24px rgba(99,102,241,0.08)'}}>
        <div style={{marginBottom:22,display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
          <label style={{fontSize:11,color:C.muted,letterSpacing:'0.05em',alignSelf:'flex-start',fontFamily:mono}}>FOTO DE PERFIL <span style={{color:C.red}}>*</span></label>
          <FotoUploader foto={foto} onFoto={setFoto}/>
          {errores.foto&&<div style={{color:C.red,fontSize:11,fontFamily:mono,alignSelf:'flex-start'}}>⚠ {errores.foto}</div>}
        </div>
        <div style={{borderTop:`1px solid ${C.border}`,marginBottom:20}}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          {CAMPOS.map(({key,label,placeholder,type,hint,full})=>(
            <div key={key} style={{gridColumn:full?'1/-1':'auto',marginBottom:15}}>
              <label style={{display:'block',fontSize:11,color:C.muted,letterSpacing:'0.05em',marginBottom:5,fontFamily:mono}}>{label.toUpperCase()} <span style={{color:C.red}}>*</span></label>
              <input type={type||'text'} value={form[key]} onChange={e=>setField(key,e.target.value)} placeholder={placeholder}
                style={{background:C.elevated,border:`1px solid ${errores[key]?C.red:C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontFamily:mono,fontSize:key==='nie'?15:13,fontWeight:key==='nie'?700:400,width:'100%',transition:'all 0.15s'}}/>
              {hint&&!errores[key]&&<div style={{color:C.faint,fontSize:10,marginTop:3,fontFamily:mono}}>{hint}</div>}
              {errores[key]&&<div style={{color:C.red,fontSize:11,marginTop:3,fontFamily:mono}}>⚠ {errores[key]}</div>}
            </div>
          ))}
        </div>
        <button onClick={handleSubmit} disabled={loading} style={{width:'100%',marginTop:8,background:loading?'#a5b4fc':C.blue,border:'none',borderRadius:10,padding:'13px',color:'#fff',fontWeight:700,fontFamily:mono,fontSize:14,cursor:loading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          {loading?(<><div style={{width:14,height:14,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>Verificando...</>):<>Registrarme y obtener carnet <ChevronRight size={16}/></>}
        </button>
        <p style={{textAlign:'center',color:C.faint,fontSize:11,marginTop:12,fontFamily:mono,lineHeight:1.5}}>Al registrarte confirmas que los datos son verídicos. El NIE es único.</p>
      </div>
    </div>
  )
}
