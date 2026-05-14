/**
 * pdfReport.js
 * ============
 * Genera el reporte PDF de asistencias usando jsPDF + jsPDF-AutoTable.
 *
 * Reglas aplicadas:
 *  - Retraso entrada:  minutos después de 13:00
 *  - Salida temprana:  minutos antes de 16:00
 *  - Falta simple:     día obligatorio sin asistencia NI reposición
 *  - Falta doble:      falta simple sin recuperar al viernes → acumula 180 min automáticos
 *  - Días asistidos:   registros en Firestore
 *  - Días faltados:    días obligatorios sin ningún registro
 *  - Días doble pen.:  faltas que ya generaron 180 min extra automáticos
 */

const CDN_JSPDF     = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
const CDN_AUTOTABLE = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'

const PALETA = {
  headerBg:   [99,  102, 241],
  headerText: [255, 255, 255],
  rowAlt:     [238, 241, 251],
  rowNormal:  [255, 255, 255],
  accent:     [99,  102, 241],
  green:      [16,  185, 129],
  red:        [239,  68,  68],
  amber:      [245, 158,  11],
  orange:     [234, 88,   12],
  text:       [45,   53,  97],
  muted:      [123, 133, 184],
  border:     [216, 223, 242],
  redBg:      [255, 226, 226],
  amberBg:    [255, 243, 199],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src; s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
}

const toDate = (v) => v?.toDate?.() ?? (v instanceof Date ? v : new Date(v))

function fmt(date) {
  if (!date) return '—'
  return toDate(date).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: true })
}

/**
 * Retorna el lunes de la semana a la que pertenece `fecha`.
 */
function lunesDeSemana(fecha) {
  const d = new Date(fecha)
  const day = d.getDay()                          // 0=dom
  const diff = day === 0 ? -6 : 1 - day           // retroceder al lunes
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Agrupa registros por semana (clave = ISO de su lunes).
 */
function agruparPorSemana(historial) {
  const semanas = {}
  for (const r of historial) {
    const fecha  = toDate(r.fecha)
    const lunes  = lunesDeSemana(fecha)
    const key    = lunes.toISOString().slice(0, 10)
    if (!semanas[key]) semanas[key] = { lunes, registros: [] }
    semanas[key].registros.push(r)
  }
  return semanas
}

/**
 * Calcula todas las estadísticas del alumno a partir de su historial.
 *
 * Lógica de falta doble:
 *   Por cada semana donde el alumno NO asistió ningún día obligatorio (Mar/Mié/Jue)
 *   NI hizo reposición (Vie), esa semana cuenta como "falta doble" →
 *   se consideran 180 min automáticos adicionales (equivale a 1 día extra de reposición).
 *
 *   Si asistió algún día pero faltó otro y NO repuso → falta simple sin doble.
 */
function calcStats(historial, creadoEn) {
  let diasAsistidos    = 0
  let llegadasTarde    = 0
  let salidasTempranas = 0
  let totalMinRetraso  = 0
  let totalMinSalida   = 0
  let diasFaltados     = 0
  let diasDoble        = 0   // semanas con penalización doble (180 min automáticos)
  let minDobleAcum     = 0   // minutos extra generados por faltas dobles

  const DIAS_OBLIGATORIOS = [2, 3, 4]  // Mar=2, Mié=3, Jue=4
  const DIA_REPOS = 5                   // Vie=5

  // Calcular desde cuándo contar semanas
  const inicio = creadoEn ? new Date(creadoEn) : null

  // Obtener todas las semanas con asistencia
  const semanasConRegistro = agruparPorSemana(historial)

  // Contar días asistidos y penalizaciones por asistencia
  for (const r of historial) {
    if (!r) continue
    diasAsistidos++

    const entrada = toDate(r.entrada)
    const salida  = r.salida ? toDate(r.salida) : null

    // Retraso entrada (> 13:00)
    const baseEnt  = new Date(entrada); baseEnt.setHours(13, 0, 0, 0)
    const minsEnt  = Math.max(0, Math.round((entrada - baseEnt) / 60000))
    if (minsEnt > 0) { llegadasTarde++; totalMinRetraso += minsEnt }

    // Salida temprana (< 16:00)
    if (salida) {
      const baseSal  = new Date(salida); baseSal.setHours(16, 0, 0, 0)
      const minsSal  = Math.max(0, Math.round((baseSal - salida) / 60000))
      if (minsSal > 0) { salidasTempranas++; totalMinSalida += minsSal }
    }
  }

  // Analizar cada semana para detectar faltas
  const hoy    = new Date()
  const ahora  = lunesDeSemana(hoy)

  // Generar todas las semanas desde el registro del alumno hasta la semana pasada
  if (inicio) {
    const semanaInicio = lunesDeSemana(inicio)
    const cur = new Date(semanaInicio)

    while (cur < ahora) {
      const key = cur.toISOString().slice(0, 10)
      const semana = semanasConRegistro[key]

      if (!semana) {
        // No hubo ningún registro esa semana → falta doble completa
        diasFaltados += 3   // los 3 días obligatorios
        diasDoble    += 1   // penalización doble = 180 min automáticos
        minDobleAcum += 180
      } else {
        const diasPresentes = semana.registros.map(r => toDate(r.fecha).getDay())
        const tieneReposicion = diasPresentes.includes(DIA_REPOS)

        const faltasObligatorias = DIAS_OBLIGATORIOS.filter(d => !diasPresentes.includes(d))
        diasFaltados += faltasObligatorias.length

        // Si faltó algún día obligatorio Y no repuso → penalización doble
        if (faltasObligatorias.length > 0 && !tieneReposicion) {
          diasDoble    += faltasObligatorias.length
          minDobleAcum += 180 * faltasObligatorias.length
        }
      }

      cur.setDate(cur.getDate() + 7)
    }
  }

  return {
    diasAsistidos,
    diasFaltados,
    diasDoble,
    minDobleAcum,
    llegadasTarde,
    salidasTempranas,
    totalMinRetraso,
    totalMinSalida,
  }
}

// ── Generador principal ───────────────────────────────────────────────────────

export async function generarReportePDF({ alumnos, getHistorialAlumno, semanaLabel }) {
  await loadScript(CDN_JSPDF)
  await loadScript(CDN_AUTOTABLE)

  const { jsPDF } = window.jspdf
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PW  = doc.internal.pageSize.getWidth()   // 297 en landscape
  const PH  = doc.internal.pageSize.getHeight()  // 210 en landscape
  const M   = 14

  // ── Portada ────────────────────────────────────────────────────────────────

  doc.setFillColor(...PALETA.headerBg)
  doc.rect(0, 0, PW, 44, 'F')

  // Logo
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(M, 11, 18, 18, 3, 3, 'F')
  doc.setTextColor(...PALETA.headerBg)
  doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text('Q', M + 5.5, 23)

  // Título
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20); doc.setFont('helvetica', 'bold')
  doc.text('Control de Asistencias', M + 24, 20)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text('Control de asistencia  ·  Prácticas Profesionales', M + 24, 27)
  doc.text(`Generado: ${new Date().toLocaleDateString('es-SV', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}`, M + 24, 33)
  doc.text(`Período: ${semanaLabel || 'Histórico completo'}`, M + 24, 39)

  // Totales globales
  const totalDiasExtra = alumnos.reduce((s, a) => s + (a.diasExtra || 0), 0)
  const totalMinAcum   = alumnos.reduce((s, a) => s + (a.minutosAcumulados || 0), 0)

  let y = 54

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PALETA.text)
  doc.text('Resumen general', M, y); y += 7

  doc.autoTable({
    startY: y,
    head: [['Total alumnos', 'Días extra totales', 'Min. acumulados (total)', 'Generado']],
    body: [[String(alumnos.length), String(totalDiasExtra), `${totalMinAcum} min`, new Date().toLocaleDateString('es-SV')]],
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: PALETA.headerBg, textColor: PALETA.headerText, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { halign: 'center', textColor: PALETA.text },
    alternateRowStyles: { fillColor: PALETA.rowAlt },
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 12

  // ── Cargar historiales ────────────────────────────────────────────────────

  const historiales = await Promise.all(
    alumnos.map(a =>
      getHistorialAlumno(a.uid, 500)
        .then(h => ({ uid: a.uid, h }))
        .catch(() => ({ uid: a.uid, h: [] }))
    )
  )
  const histMap = Object.fromEntries(historiales.map(({ uid, h }) => [uid, h]))

  // ── Tabla resumen por estudiante ──────────────────────────────────────────

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PALETA.text)
  doc.text('Resumen por estudiante', M, y); y += 6

  const resumenRows = alumnos.map(a => {
    const hist = histMap[a.uid] || []
    const st   = calcStats(hist, a.creadoEn)
    return [
      `${a.nombre || ''} ${a.apellido || ''}`.trim(),
      a.nie || a.uid,
      a.carrera || '—',
      String(st.diasAsistidos),
      String(st.diasFaltados),
      String(st.diasDoble),
      String(st.llegadasTarde),
      String(st.salidasTempranas),
      `${st.totalMinRetraso + st.totalMinSalida + st.minDobleAcum}m`,
      `${a.minutosAcumulados || 0}m`,
      String(a.diasExtra || 0),
    ]
  })

  doc.autoTable({
    startY: y,
    head: [[
      'Estudiante', 'NIE', 'Carrera',
      'Asistidos', 'Faltados', 'Doble pen.',
      'L. Tarde', 'S. Temprana',
      'Min. Total', 'Min. Acum.', 'Días Extra',
    ]],
    body: resumenRows,
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: PALETA.headerBg, textColor: PALETA.headerText, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    bodyStyles: { textColor: PALETA.text },
    alternateRowStyles: { fillColor: PALETA.rowAlt },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 32 },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center', fontStyle: 'bold' },
      6: { halign: 'center' },
      7: { halign: 'center' },
      8: { halign: 'center' },
      9: { halign: 'center' },
      10: { halign: 'center', fontStyle: 'bold' },
    },
    theme: 'grid',
    didParseCell(data) {
      if (data.section !== 'body') return
      // Faltados → rojo si > 0
      if (data.column.index === 4) {
        const v = parseInt(data.cell.raw, 10)
        data.cell.styles.textColor = v > 0 ? PALETA.red : PALETA.green
      }
      // Doble penalización → naranja si > 0
      if (data.column.index === 5) {
        const v = parseInt(data.cell.raw, 10)
        if (v > 0) {
          data.cell.styles.textColor = PALETA.orange
          data.cell.styles.fillColor = PALETA.amberBg
        } else {
          data.cell.styles.textColor = PALETA.green
        }
      }
      // Días extra → rojo si > 0
      if (data.column.index === 10) {
        const v = parseInt(data.cell.raw, 10)
        data.cell.styles.textColor = v > 0 ? PALETA.red : PALETA.green
      }
    },
  })

  // ── Detalle por alumno ────────────────────────────────────────────────────

  for (const alumno of alumnos) {
    doc.addPage()

    // Header alumno
    doc.setFillColor(...PALETA.headerBg)
    doc.rect(0, 0, PW, 30, 'F')

    let fotoX = M
    if (alumno.fotoPerfil) {
      try {
        doc.addImage(alumno.fotoPerfil, 'JPEG', M, 4, 20, 24, undefined, 'FAST')
        fotoX = M + 24
      } catch (_) {}
    }

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text(`${alumno.nombre || ''} ${alumno.apellido || ''}`.trim(), fotoX + 4, 13)
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal')
    doc.text(`NIE: ${alumno.nie || alumno.uid}  ·  ${alumno.carrera || ''}  ·  Ciclo: ${alumno.ciclo || '—'}`, fotoX + 4, 20)
    doc.text(`Correo: ${alumno.email || '—'}  ·  Tel: ${alumno.telefono || '—'}`, fotoX + 4, 27)

    y = 38

    const hist = histMap[alumno.uid] || []
    const st   = calcStats(hist, alumno.creadoEn)
    const pct  = Math.min(100, Math.round(((alumno.minutosAcumulados || 0) / 180) * 100))
    const minTotalGeneral = st.totalMinRetraso + st.totalMinSalida + st.minDobleAcum

    // Tarjetas de estadísticas (2 filas × 5 cols)
    const cards = [
      { label: 'Días asistidos',   valor: st.diasAsistidos,                              color: PALETA.green },
      { label: 'Días faltados',    valor: st.diasFaltados,                               color: st.diasFaltados > 0 ? PALETA.red : PALETA.green },
      { label: 'Doble pen. (falta sin repos.)', valor: st.diasDoble,                     color: st.diasDoble > 0 ? PALETA.orange : PALETA.green },
      { label: 'Llegadas tarde',   valor: st.llegadasTarde,                              color: st.llegadasTarde > 0 ? PALETA.amber : PALETA.green },
      { label: 'Salidas tempranas',valor: st.salidasTempranas,                           color: st.salidasTempranas > 0 ? PALETA.amber : PALETA.green },
      { label: 'Min. retraso ent.',valor: `${st.totalMinRetraso}m`,                      color: PALETA.muted },
      { label: 'Min. salida temp.',valor: `${st.totalMinSalida}m`,                       color: PALETA.muted },
      { label: 'Min. por faltas',  valor: `${st.minDobleAcum}m`,                         color: st.minDobleAcum > 0 ? PALETA.orange : PALETA.muted },
      { label: 'Min. total histór.',valor: `${minTotalGeneral}m`,                        color: PALETA.text },
      { label: 'Min. acum. actual',valor: `${alumno.minutosAcumulados || 0}m / 180`,     color: pct >= 80 ? PALETA.red : PALETA.amber },
      { label: 'Días extra total', valor: String(alumno.diasExtra || 0),                 color: (alumno.diasExtra || 0) > 0 ? PALETA.red : PALETA.green },
    ]

    const cols   = 5
    const cardW  = (PW - M * 2 - (cols - 1) * 3) / cols
    const cardH  = 20

    cards.forEach((card, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx  = M + col * (cardW + 3)
      const cy  = y + row * (cardH + 3)

      doc.setFillColor(...PALETA.rowAlt)
      doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'F')
      doc.setDrawColor(...PALETA.border)
      doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'S')

      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PALETA.muted)
      doc.text(card.label.toUpperCase(), cx + cardW / 2, cy + 6.5, { align: 'center' })
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...card.color)
      doc.text(String(card.valor), cx + cardW / 2, cy + 15, { align: 'center' })
    })

    y += Math.ceil(cards.length / cols) * (cardH + 3) + 6

    // Nota sobre penalización doble
    if (st.diasDoble > 0) {
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...PALETA.orange)
      doc.text(
        `⚠ Nota: ${st.diasDoble} día(s) sin asistencia ni reposición → +${st.minDobleAcum} min acumulados automáticamente (${Math.floor(st.minDobleAcum/180)} día(s) extra generados).`,
        M, y
      )
      y += 8
    }

    // Barra progreso
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PALETA.muted)
    doc.text(`Minutos acumulados hacia el siguiente día extra: ${pct}% (${alumno.minutosAcumulados || 0} / 180 min)`, M, y); y += 3
    doc.setFillColor(...PALETA.border)
    doc.roundedRect(M, y, PW - M * 2, 4, 1, 1, 'F')
    const barColor = pct >= 80 ? PALETA.red : pct >= 50 ? PALETA.amber : PALETA.green
    doc.setFillColor(...barColor)
    if (pct > 0) doc.roundedRect(M, y, (PW - M * 2) * pct / 100, 4, 1, 1, 'F')
    y += 10

    // Tabla detalle de registros
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PALETA.text)
    doc.text(`Historial de asistencias (${hist.length} registros)`, M, y); y += 5

    if (hist.length === 0) {
      doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(...PALETA.muted)
      doc.text('Sin registros de asistencia.', M, y)
    } else {
      const sorted = [...hist].sort((a, b) => toDate(b.fecha) - toDate(a.fecha))

      const rows = sorted.map(r => {
        const entrada = toDate(r.entrada)
        const salida  = r.salida ? toDate(r.salida) : null

        const baseEnt = new Date(entrada); baseEnt.setHours(13, 0, 0, 0)
        const minEnt  = Math.max(0, Math.round((entrada - baseEnt) / 60000))

        let minSal = 0
        if (salida) {
          const baseSal = new Date(salida); baseSal.setHours(16, 0, 0, 0)
          minSal = Math.max(0, Math.round((baseSal - salida) / 60000))
        }

        const minTotal = minEnt + minSal
        const dia      = toDate(r.fecha).toLocaleDateString('es-SV', { weekday:'short', day:'2-digit', month:'short', year:'numeric' })
        const stEnt    = minEnt > 0  ? `+${minEnt}min tarde`    : 'A tiempo'
        const stSal    = !salida     ? 'Sin salida'              : minSal > 0 ? `-${minSal}min temprano` : 'A tiempo'
        const tipo     = r.esReposicion ? 'Reposición' : 'Obligatorio'

        return [dia, fmt(entrada), fmt(salida), stEnt, stSal, `${minTotal}m`, tipo]
      })

      doc.autoTable({
        startY: y,
        head: [['Fecha', 'Entrada', 'Salida', 'Estado entrada', 'Estado salida', 'Min. día', 'Tipo']],
        body: rows,
        margin: { left: M, right: M },
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: PALETA.headerBg, textColor: PALETA.headerText, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { textColor: PALETA.text },
        alternateRowStyles: { fillColor: PALETA.rowAlt },
        columnStyles: {
          0: { cellWidth: 48 },
          1: { cellWidth: 26, halign: 'center' },
          2: { cellWidth: 26, halign: 'center' },
          3: { cellWidth: 38, halign: 'center' },
          4: { cellWidth: 38, halign: 'center' },
          5: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          6: { cellWidth: 28, halign: 'center' },
        },
        theme: 'grid',
        didParseCell(data) {
          if (data.section !== 'body') return
          if (data.column.index === 3)
            data.cell.styles.textColor = data.cell.raw.includes('tarde') ? PALETA.amber : PALETA.green
          if (data.column.index === 4) {
            if (data.cell.raw === 'Sin salida')         data.cell.styles.textColor = PALETA.muted
            else if (data.cell.raw.includes('temprano')) data.cell.styles.textColor = PALETA.red
            else                                          data.cell.styles.textColor = PALETA.green
          }
          if (data.column.index === 5) {
            const v = parseInt(data.cell.raw, 10)
            if (v > 0) data.cell.styles.textColor = PALETA.amber
          }
          if (data.column.index === 6 && data.cell.raw === 'Reposición')
            data.cell.styles.textColor = PALETA.accent
        },
      })
    }

    // Pie de página
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PALETA.muted)
    doc.text(`AttendanceQR — ${alumno.nombre || ''} ${alumno.apellido || ''}`, M, PH - 6)
    doc.text(`Pág. ${doc.internal.getCurrentPageInfo().pageNumber}`, PW - M, PH - 6, { align: 'right' })
  }

  // Numeración portada
  const totalPags = doc.internal.getNumberOfPages()
  doc.setPage(1)
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PALETA.muted)
  doc.text(`AttendanceQR v2.0  ·  ${totalPags} páginas`, M, PH - 6)
  doc.text('Pág. 1', PW - M, PH - 6, { align: 'right' })

  const fecha = new Date().toISOString().slice(0, 10)
  doc.save(`reporte-asistencias-${fecha}.pdf`)
}
