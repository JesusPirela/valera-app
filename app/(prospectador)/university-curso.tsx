import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Platform,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Curso = {
  id: string
  titulo: string
  descripcion: string | null
  instructor: string
  nivel: string
  categoria: string
  duracion_texto: string | null
  es_certificacion: boolean
}

type Leccion = {
  id: string
  titulo: string
  descripcion: string | null
  orden: number
}

const NIVEL_LABEL: Record<string, string> = {
  basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado',
}

// ── PDF generator (web-only via jspdf) ────────────────────
async function generarCertificadoPDF(nombreCompleto: string, cursoTitulo: string) {
  try {
    // Dynamic import so it only loads on web
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

    const W = 297
    const H = 210

    // ── Fondo blanco ──
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, W, H, 'F')

    // ── Borde dorado doble ──
    doc.setDrawColor(201, 168, 76)
    doc.setLineWidth(4)
    doc.rect(8, 8, W - 16, H - 16)
    doc.setLineWidth(1)
    doc.rect(13, 13, W - 26, H - 26)

    // ── Esquinas decorativas ──
    const corner = (x: number, y: number, rx: number, ry: number) => {
      doc.setFillColor(201, 168, 76)
      doc.ellipse(x, y, rx, ry, 'F')
    }
    corner(8, 8, 3, 3); corner(W - 8, 8, 3, 3)
    corner(8, H - 8, 3, 3); corner(W - 8, H - 8, 3, 3)

    // ── Logo (fetch como base64) ──
    try {
      const resp = await fetch('https://valerarealestate.com/images/logo.png')
      const blob = await resp.blob()
      const b64: string = await new Promise((res) => {
        const reader = new FileReader()
        reader.onloadend = () => res(reader.result as string)
        reader.readAsDataURL(blob)
      })
      doc.addImage(b64, 'PNG', W / 2 - 28, 18, 56, 28)
    } catch {
      // Si el logo falla, poner texto en su lugar
      doc.setFontSize(14)
      doc.setTextColor(201, 168, 76)
      doc.text('VALERA REAL ESTATE', W / 2, 35, { align: 'center' })
    }

    // ── Título principal ──
    doc.setFontSize(28)
    doc.setTextColor(26, 100, 112)
    doc.setFont('helvetica', 'bold')
    doc.text('CERTIFICADO DE FINALIZACIÓN', W / 2, 65, { align: 'center' })

    // ── Línea decorativa bajo título ──
    doc.setDrawColor(201, 168, 76)
    doc.setLineWidth(0.8)
    doc.line(W / 2 - 70, 70, W / 2 + 70, 70)

    // ── Texto "se certifica" ──
    doc.setFontSize(13)
    doc.setTextColor(100, 100, 100)
    doc.setFont('helvetica', 'normal')
    doc.text('Se certifica que:', W / 2, 83, { align: 'center' })

    // ── Nombre del alumno ──
    doc.setFontSize(32)
    doc.setTextColor(201, 168, 76)
    doc.setFont('helvetica', 'bolditalic')
    doc.text(nombreCompleto, W / 2, 102, { align: 'center' })

    // ── Línea bajo nombre ──
    doc.setDrawColor(201, 168, 76)
    doc.setLineWidth(0.5)
    const nameW = Math.min(doc.getTextWidth(nombreCompleto) + 20, 180)
    doc.line(W / 2 - nameW / 2, 107, W / 2 + nameW / 2, 107)

    // ── Texto "ha completado" ──
    doc.setFontSize(13)
    doc.setTextColor(100, 100, 100)
    doc.setFont('helvetica', 'normal')
    doc.text('Ha completado satisfactoriamente el curso:', W / 2, 120, { align: 'center' })

    // ── Nombre del curso ──
    doc.setFontSize(20)
    doc.setTextColor(26, 26, 46)
    doc.setFont('helvetica', 'bold')
    // Wrap si es muy largo
    const cursoLines = doc.splitTextToSize(cursoTitulo, 220)
    doc.text(cursoLines, W / 2, 132, { align: 'center' })

    // ── Fecha ──
    const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    doc.setFontSize(11)
    doc.setTextColor(130, 130, 130)
    doc.setFont('helvetica', 'normal')
    doc.text(fecha, W / 2, 152, { align: 'center' })

    // ── Firma ──
    doc.setDrawColor(26, 100, 112)
    doc.setLineWidth(0.5)
    doc.line(W / 2 - 45, 170, W / 2 + 45, 170)
    doc.setFontSize(11)
    doc.setTextColor(26, 100, 112)
    doc.setFont('helvetica', 'bold')
    doc.text('Valera Real Estate', W / 2, 177, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text('Valera University', W / 2, 183, { align: 'center' })

    const nombreArchivo = `Certificado_${nombreCompleto.replace(/\s+/g, '_')}_${cursoTitulo.substring(0, 30).replace(/\s+/g, '_')}.pdf`
    doc.save(nombreArchivo)
    return true
  } catch (e) {
    console.error('Error generando PDF:', e)
    return false
  }
}

export default function UniversityCurso() {
  const { id: cursoId } = useLocalSearchParams<{ id: string }>()

  const [curso, setCurso] = useState<Curso | null>(null)
  const [lecciones, setLecciones] = useState<Leccion[]>([])
  const [completadasIds, setCompletadasIds] = useState<Set<string>>(new Set())
  const [tieneCert, setTieneCert] = useState(false)
  const [nombreGuardado, setNombreGuardado] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Modal de certificado
  const [modalCert, setModalCert] = useState(false)
  const [nombreForm, setNombreForm] = useState('')
  const [generando, setGenerando] = useState(false)

  useFocusEffect(useCallback(() => { cargar() }, [cursoId]))

  async function cargar() {
    if (!cursoId) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [
      { data: cursoData },
      { data: leccionesData },
      { data: progresoData },
      { data: certData },
    ] = await Promise.all([
      supabase.from('vu_cursos').select('id, titulo, descripcion, instructor, nivel, categoria, duracion_texto, es_certificacion').eq('id', cursoId).single(),
      supabase.from('vu_lecciones').select('id, titulo, descripcion, orden').eq('curso_id', cursoId).order('orden'),
      supabase.from('vu_progreso').select('leccion_id').eq('user_id', user.id).eq('curso_id', cursoId),
      supabase.from('vu_certificados').select('id, nombre_completo').eq('user_id', user.id).eq('curso_id', cursoId).maybeSingle(),
    ])

    setCurso(cursoData)
    setLecciones(leccionesData ?? [])
    setCompletadasIds(new Set((progresoData ?? []).map((p: any) => p.leccion_id)))
    setTieneCert(!!certData)
    setNombreGuardado(certData?.nombre_completo ?? null)
    setLoading(false)
  }

  function isLocked(leccion: Leccion): boolean {
    if (leccion.orden <= 1) return false
    const anterior = lecciones.find((l) => l.orden === leccion.orden - 1)
    return anterior ? !completadasIds.has(anterior.id) : false
  }

  function primeraLeccionPendiente(): Leccion | null {
    return lecciones.find((l) => !completadasIds.has(l.id) && !isLocked(l)) ?? null
  }

  async function handleGenerarCertificado() {
    if (!nombreForm.trim()) return
    if (!curso) return
    setGenerando(true)
    try {
      // Guardar nombre en BD
      await supabase.rpc('guardar_nombre_certificado', {
        p_curso_id: cursoId,
        p_nombre: nombreForm.trim(),
      })
      // Generar PDF
      const ok = await generarCertificadoPDF(nombreForm.trim(), curso.titulo)
      if (ok) {
        setNombreGuardado(nombreForm.trim())
        setModalCert(false)
      } else {
        if (Platform.OS === 'web') window.alert('Error al generar el PDF. Intenta de nuevo.')
      }
    } finally {
      setGenerando(false)
    }
  }

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />
  if (!curso) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#aaa' }}>Curso no encontrado</Text>
    </View>
  )

  const totalLecciones = lecciones.length
  const pct = totalLecciones > 0 ? Math.round((completadasIds.size / totalLecciones) * 100) : 0
  const cursoCompleto = tieneCert || (totalLecciones > 0 && completadasIds.size >= totalLecciones)
  const siguiente = primeraLeccionPendiente()

  return (
    <ScrollView style={estilos.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header del curso */}
      <View style={estilos.header}>
        <TouchableOpacity onPress={() => router.back()} style={estilos.backBtn}>
          <Text style={estilos.backText}>← Volver</Text>
        </TouchableOpacity>
        <View style={estilos.headerContent}>
          <View style={estilos.metaRow}>
            <View style={estilos.nivelBadge}>
              <Text style={estilos.nivelText}>{NIVEL_LABEL[curso.nivel] ?? curso.nivel}</Text>
            </View>
            <Text style={estilos.categoriaText}>{curso.categoria}</Text>
            {curso.es_certificacion && (
              <View style={estilos.certChip}>
                <Text style={estilos.certChipText}>🎓 Certificación</Text>
              </View>
            )}
          </View>
          <Text style={estilos.titulo}>{curso.titulo}</Text>
          <Text style={estilos.instructor}>👤 {curso.instructor}</Text>
          {curso.duracion_texto && (
            <Text style={estilos.duracion}>⏱ {curso.duracion_texto}</Text>
          )}
        </View>
      </View>

      {/* Progreso */}
      <View style={estilos.progresoCard}>
        <View style={estilos.progresoHeader}>
          <Text style={estilos.progresoLabel}>Tu progreso</Text>
          <Text style={estilos.progresioPct}>{pct}%</Text>
        </View>
        <View style={estilos.barraFondo}>
          <View style={[estilos.barraRelleno, { width: `${pct}%` as any }]} />
        </View>
        <Text style={estilos.progresoSub}>{completadasIds.size} de {totalLecciones} lecciones completadas</Text>

        {/* Banner certificado */}
        {cursoCompleto && curso.es_certificacion ? (
          <View style={estilos.certBannerGold}>
            <Text style={estilos.certBannerIcon}>🏆</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.certBannerTitulo}>¡Curso completado!</Text>
              <Text style={estilos.certBannerSub}>
                {nombreGuardado
                  ? `Certificado emitido a nombre de ${nombreGuardado}`
                  : 'Genera tu certificado oficial PDF'}
              </Text>
            </View>
            {Platform.OS === 'web' ? (
              <TouchableOpacity
                style={estilos.btnCertAccion}
                onPress={() => {
                  if (nombreGuardado) {
                    generarCertificadoPDF(nombreGuardado, curso.titulo)
                  } else {
                    setNombreForm('')
                    setModalCert(true)
                  }
                }}
              >
                <Text style={estilos.btnCertAccionText}>
                  {nombreGuardado ? '⬇ Descargar PDF' : '📄 Generar certificado'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={estilos.btnCertAccionMobile}>
                <Text style={estilos.btnCertAccionMobileText}>
                  🖥️ Descarga tu certificado entrando desde la web
                </Text>
              </View>
            )}
          </View>
        ) : cursoCompleto ? (
          <View style={estilos.certBanner}>
            <Text style={estilos.certText}>🏆 ¡Curso completado!</Text>
          </View>
        ) : siguiente ? (
          <TouchableOpacity
            style={estilos.btnContinuar}
            onPress={() => router.push(`/(prospectador)/university-leccion?id=${siguiente.id}&cursoId=${cursoId}`)}
          >
            <Text style={estilos.btnContinuarText}>
              {completadasIds.size === 0 ? '▶ Comenzar curso' : '▶ Continuar donde me quedé'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Descripción */}
      {curso.descripcion && (
        <View style={estilos.descCard}>
          <Text style={estilos.descTitle}>Acerca de este curso</Text>
          <Text style={estilos.descText}>{curso.descripcion}</Text>
        </View>
      )}

      {/* Lista de lecciones */}
      <View style={estilos.leccionesCard}>
        <Text style={estilos.leccionesTitle}>Contenido del curso</Text>
        {lecciones.map((leccion) => {
          const completada = completadasIds.has(leccion.id)
          const bloqueada = isLocked(leccion)
          return (
            <TouchableOpacity
              key={leccion.id}
              style={[
                estilos.leccionRow,
                bloqueada && estilos.leccionRowBloqueada,
                completada && estilos.leccionRowCompletada,
              ]}
              onPress={() => {
                if (bloqueada) return
                router.push(`/(prospectador)/university-leccion?id=${leccion.id}&cursoId=${cursoId}`)
              }}
              activeOpacity={bloqueada ? 1 : 0.7}
            >
              <View style={[
                estilos.leccionNum,
                completada && estilos.leccionNumDone,
                bloqueada && estilos.leccionNumLocked,
              ]}>
                <Text style={[estilos.leccionNumText, (completada || !bloqueada) && { color: completada ? '#fff' : '#1a6470' }]}>
                  {completada ? '✓' : bloqueada ? '🔒' : leccion.orden}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[estilos.leccionNombre, bloqueada && { color: '#bbb' }]}>
                  {leccion.titulo}
                </Text>
                {leccion.descripcion && !bloqueada && (
                  <Text style={estilos.leccionDesc} numberOfLines={1}>{leccion.descripcion}</Text>
                )}
              </View>
              {completada && <Text style={estilos.checkIcon}>+10 pts</Text>}
              {!bloqueada && !completada && <Text style={estilos.chevron}>›</Text>}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── Modal certificado ── */}
      <Modal visible={modalCert} transparent animationType="fade" onRequestClose={() => setModalCert(false)}>
        <View style={estilos.modalOverlay}>
          <View style={estilos.modalBox}>
            <Text style={estilos.modalIcon}>🎓</Text>
            <Text style={estilos.modalTitulo}>¡Felicidades!</Text>
            <Text style={estilos.modalSub}>
              Completaste el curso <Text style={{ fontWeight: '700' }}>{curso.titulo}</Text>.{'\n'}
              Ingresa tu nombre completo para generar tu certificado oficial.
            </Text>
            <TextInput
              style={estilos.modalInput}
              value={nombreForm}
              onChangeText={setNombreForm}
              placeholder="Tu nombre completo"
              placeholderTextColor="#aaa"
              autoFocus
            />
            <Text style={estilos.modalHint}>
              Este nombre aparecerá exactamente en el certificado PDF.
            </Text>
            {Platform.OS === 'web' ? (
              <TouchableOpacity
                style={[estilos.modalBtn, (!nombreForm.trim() || generando) && { opacity: 0.5 }]}
                onPress={handleGenerarCertificado}
                disabled={!nombreForm.trim() || generando}
              >
                {generando
                  ? <ActivityIndicator color="#000" />
                  : <Text style={estilos.modalBtnText}>📄 Generar y descargar PDF</Text>
                }
              </TouchableOpacity>
            ) : (
              <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>
                La descarga de certificados solo está disponible desde la versión web.
              </Text>
            )}
            <TouchableOpacity onPress={() => setModalCert(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: '#888', fontSize: 13 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  header: { backgroundColor: '#1a6470', padding: 20, paddingTop: 16 },
  backBtn: { marginBottom: 12 },
  backText: { color: '#c9a84c', fontSize: 14, fontWeight: '600' },
  headerContent: {},
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  nivelBadge: { backgroundColor: 'rgba(201,168,76,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#c9a84c' },
  nivelText: { color: '#c9a84c', fontSize: 10, fontWeight: '700' },
  categoriaText: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  certChip: { backgroundColor: 'rgba(201,168,76,0.35)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#c9a84c' },
  certChipText: { color: '#c9a84c', fontSize: 10, fontWeight: '700' },
  titulo: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 28, marginBottom: 8 },
  instructor: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 2 },
  duracion: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  progresoCard: { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e8eef0' },
  progresoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progresoLabel: { fontSize: 13, fontWeight: '700', color: '#1a1a2e' },
  progresioPct: { fontSize: 13, fontWeight: '700', color: '#1a6470' },
  barraFondo: { height: 8, backgroundColor: '#e8eef0', borderRadius: 4, marginBottom: 6 },
  barraRelleno: { height: 8, backgroundColor: '#1a6470', borderRadius: 4 },
  progresoSub: { fontSize: 11, color: '#888', marginBottom: 12 },
  certBanner: { backgroundColor: '#c9a84c', borderRadius: 10, padding: 12, alignItems: 'center' },
  certText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  certBannerGold: {
    backgroundColor: '#1a6470', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  certBannerIcon: { fontSize: 28 },
  certBannerTitulo: { color: '#fff', fontWeight: '800', fontSize: 14 },
  certBannerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  btnCertAccion: {
    backgroundColor: '#c9a84c', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 10, alignItems: 'center',
  },
  btnCertAccionText: { color: '#000', fontWeight: '700', fontSize: 13 },
  btnCertAccionMobile: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnCertAccionMobileText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center' },
  btnContinuar: { backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnContinuarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  descCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e8eef0' },
  descTitle: { fontSize: 13, fontWeight: '700', color: '#1a6470', marginBottom: 8 },
  descText: { fontSize: 13, color: '#555', lineHeight: 20 },
  leccionesCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e8eef0' },
  leccionesTitle: { fontSize: 13, fontWeight: '700', color: '#1a6470', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f4f5' },
  leccionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f0f4f5' },
  leccionRowCompletada: { backgroundColor: '#f8fffe' },
  leccionRowBloqueada: { backgroundColor: '#fafafa' },
  leccionNum: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#1a6470', alignItems: 'center', justifyContent: 'center' },
  leccionNumDone: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  leccionNumLocked: { borderColor: '#ddd' },
  leccionNumText: { fontSize: 13, fontWeight: '700', color: '#aaa' },
  leccionNombre: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  leccionDesc: { fontSize: 11, color: '#888', marginTop: 2 },
  checkIcon: { fontSize: 11, color: '#2e7d32', fontWeight: '700' },
  chevron: { fontSize: 20, color: '#bbb', fontWeight: '300' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 420, alignItems: 'center' },
  modalIcon: { fontSize: 48, marginBottom: 8 },
  modalTitulo: { fontSize: 22, fontWeight: '800', color: '#1a1a2e', marginBottom: 8 },
  modalSub: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  modalInput: {
    width: '100%', backgroundColor: '#f5f5f5', borderRadius: 12,
    borderWidth: 1, borderColor: '#ddd', padding: 14,
    fontSize: 16, color: '#1a1a2e', marginBottom: 8,
  },
  modalHint: { fontSize: 11, color: '#aaa', textAlign: 'center', marginBottom: 20 },
  modalBtn: { backgroundColor: '#c9a84c', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center' },
  modalBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
})
