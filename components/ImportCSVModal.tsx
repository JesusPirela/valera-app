import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Modal, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// ── Campos del CRM disponibles para mapear ────────────────────────
export const CRM_FIELDS = [
  { key: 'nombre',         label: 'Nombre',           required: true  },
  { key: 'telefono',       label: 'Teléfono',          required: true  },
  { key: 'email',          label: 'Email',             required: false },
  { key: 'empresa',        label: 'Empresa',           required: false },
  { key: 'tipo_operacion', label: 'Tipo Operación',    required: false },
  { key: 'estado',         label: 'Estado',            required: false },
  { key: 'zona_busqueda',  label: 'Zona de búsqueda',  required: false },
  { key: 'presupuesto',    label: 'Presupuesto',       required: false },
  { key: 'fuente_lead',    label: 'Fuente Lead',       required: false },
  { key: 'notas',          label: 'Notas',             required: false },
] as const

export type ImportedRow = {
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  tipo_operacion: string | null
  estado: string | null
  zona_busqueda: string | null
  presupuesto: string | null
  fuente_lead: string | null
  notas: string | null
}

type UsuarioSimple = { id: string; nombre: string }

type Props = {
  visible: boolean
  csvHeaders: string[]
  csvData: string[][]
  onClose: () => void
  onConfirm: (rows: ImportedRow[], responsableId?: string) => Promise<void>
  // Si se pasa users, se muestra paso de selección de asesor (admin)
  users?: UsuarioSimple[]
}

const ESTADOS_VALIDOS = new Set([
  'por_perfilar', 'no_contesta', 'cita_por_agendar',
  'cita_agendada', 'seguimiento_cierre', 'compro', 'descartado',
])

// ── Auto-detección de columnas ────────────────────────────────────
function autoDetect(headers: string[]): Record<string, string | null> {
  const m: Record<string, string | null> = Object.fromEntries(CRM_FIELDS.map(f => [f.key, null]))
  for (const h of headers) {
    const n = h
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '')
    if (!m.nombre         && /^(nombre|name|cliente)$/.test(n))                                  m.nombre = h
    if (!m.telefono       && /^(numero|telefono|phone|tel|celular|movil|whatsapp)$/.test(n))      m.telefono = h
    if (!m.email          && /^(email|correo|mail)$/.test(n))                                     m.email = h
    if (!m.empresa        && /^(empresa|company|negocio)$/.test(n))                               m.empresa = h
    if (!m.tipo_operacion && /^(tipooperacion|operacion|tipo)$/.test(n))                          m.tipo_operacion = h
    if (!m.estado         && /^(estado|status|etapa)$/.test(n))                                   m.estado = h
    if (!m.zona_busqueda  && /^(zonas?|zona|region|zonabusqueda)$/.test(n))                       m.zona_busqueda = h
    if (!m.presupuesto    && /^(presupuesto|budget|precio|cualestupr)/.test(n))                   m.presupuesto = h
    if (!m.fuente_lead    && /^(fuente|campana|campaign|source|origen)$/.test(n))                 m.fuente_lead = h
    if (!m.notas          && /^(notas?|notes?|comentarios?)$/.test(n))                            m.notas = h
  }
  return m
}

// ── Construir filas finales a partir del mapeo ────────────────────
function buildRows(csvData: string[][], headers: string[], mapping: Record<string, string | null>): ImportedRow[] {
  const idx = (field: string) => {
    const col = mapping[field]
    return col ? headers.indexOf(col) : -1
  }
  const get = (row: string[], field: string) => {
    const i = idx(field)
    return i >= 0 ? row[i]?.trim() || null : null
  }
  return csvData
    .filter(row => get(row, 'nombre') && get(row, 'telefono'))
    .map(row => {
      const estado = get(row, 'estado')?.toLowerCase() ?? null
      const tipo   = get(row, 'tipo_operacion')?.toLowerCase() ?? null
      return {
        nombre:         get(row, 'nombre')!,
        telefono:       get(row, 'telefono')!,
        email:          get(row, 'email'),
        empresa:        get(row, 'empresa'),
        tipo_operacion: ['venta', 'renta'].includes(tipo ?? '') ? tipo : null,
        estado:         ESTADOS_VALIDOS.has(estado ?? '') ? estado : 'por_perfilar',
        zona_busqueda:  get(row, 'zona_busqueda'),
        presupuesto:    get(row, 'presupuesto'),
        fuente_lead:    get(row, 'fuente_lead') || 'sheets',
        notas:          get(row, 'notas'),
      }
    })
}

// ── Componente principal ──────────────────────────────────────────
type MainStep = 'assign' | 'mapping' | 'preview'

export default function ImportCSVModal({
  visible, csvHeaders, csvData, onClose, onConfirm, users,
}: Props) {
  const [step, setStep]             = useState<MainStep>(users ? 'assign' : 'mapping')
  const [mapping, setMapping]       = useState<Record<string, string | null>>({})
  const [pickerField, setPickerField] = useState<string | null>(null)
  const [importing, setImporting]   = useState(false)
  const [responsableId, setResponsableId] = useState('')

  useEffect(() => {
    if (visible && csvHeaders.length) {
      setMapping(autoDetect(csvHeaders))
      setStep(users ? 'assign' : 'mapping')
      setPickerField(null)
      setImporting(false)
      setResponsableId('')
    }
  }, [visible, csvHeaders])

  const requiredMissing = CRM_FIELDS.filter(f => f.required && !mapping[f.key])
  const canContinue     = requiredMissing.length === 0
  const previewRows     = canContinue ? buildRows(csvData, csvHeaders, mapping) : []

  async function handleConfirm() {
    setImporting(true)
    try {
      await onConfirm(previewRows, users ? responsableId : undefined)
      onClose()
    } catch {
      // error handled by caller
    } finally {
      setImporting(false)
    }
  }

  function handleClose() {
    setPickerField(null)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* ── Paso 0: Selección de asesor (solo admin) ── */}
          {step === 'assign' && users && (
            <>
              <Text style={s.title}>Asignar a asesor</Text>
              <Text style={s.subtitle}>¿A quién se asignarán los clientes importados?</Text>
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {users.map(u => {
                  const sel = responsableId === u.id
                  return (
                    <TouchableOpacity key={u.id} style={[s.userRow, sel && s.userRowSel]} onPress={() => setResponsableId(u.id)}>
                      <View style={s.userAvatar}>
                        <Text style={s.userAvatarTxt}>{u.nombre?.[0]?.toUpperCase() ?? '?'}</Text>
                      </View>
                      <Text style={[s.userNombre, sel && { color: '#1a6470', fontWeight: '700' }]}>{u.nombre}</Text>
                      {sel && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
                    </TouchableOpacity>
                  )
                })}
                <View style={{ height: 16 }} />
              </ScrollView>
              <TouchableOpacity
                style={[s.btnPrimary, !responsableId && s.btnDisabled]}
                onPress={() => responsableId && setStep('mapping')}
                disabled={!responsableId}
              >
                <Text style={s.btnPrimaryTxt}>Continuar → Mapear columnas</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnCancel} onPress={handleClose}>
                <Text style={s.btnCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Paso 1: Mapeo de columnas ── */}
          {step === 'mapping' && (
            <>
              {users && (
                <TouchableOpacity style={s.backBtn} onPress={() => setStep('assign')}>
                  <Ionicons name="arrow-back" size={14} color="#1a6470" />
                  <Text style={s.backTxt}>Cambiar asesor</Text>
                </TouchableOpacity>
              )}
              <Text style={s.title}>Mapear columnas</Text>
              <Text style={s.subtitle}>{csvData.length} filas · {csvHeaders.length} columnas detectadas</Text>

              <ScrollView style={s.fieldList} showsVerticalScrollIndicator={false}>
                {CRM_FIELDS.map(field => {
                  const mapped    = mapping[field.key]
                  const isMissing = field.required && !mapped
                  return (
                    <TouchableOpacity
                      key={field.key}
                      style={[s.fieldRow, isMissing && s.fieldRowError]}
                      onPress={() => setPickerField(field.key)}
                    >
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={s.fieldLabel}>
                          {field.label}
                          {field.required && <Text style={{ color: '#ef4444' }}> *</Text>}
                        </Text>
                      </View>
                      <View style={[s.pill, mapped ? s.pillMapped : s.pillEmpty]}>
                        <Text style={[s.pillTxt, !mapped && s.pillTxtEmpty]} numberOfLines={1}>
                          {mapped ?? 'Sin asignar'}
                        </Text>
                        <Ionicons name="chevron-down" size={11} color={mapped ? '#1a6470' : '#94a3b8'} />
                      </View>
                    </TouchableOpacity>
                  )
                })}
                <View style={{ height: 16 }} />
              </ScrollView>

              {!canContinue && (
                <Text style={s.errorHint}>Asigna los campos requeridos (*) para continuar</Text>
              )}
              <TouchableOpacity
                style={[s.btnPrimary, !canContinue && s.btnDisabled]}
                onPress={() => canContinue && setStep('preview')}
                disabled={!canContinue}
              >
                <Text style={s.btnPrimaryTxt}>
                  {canContinue ? `Ver preview (${previewRows.length} clientes) →` : 'Continuar →'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnCancel} onPress={handleClose}>
                <Text style={s.btnCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Paso 2: Preview ── */}
          {step === 'preview' && (
            <>
              <TouchableOpacity style={s.backBtn} onPress={() => setStep('mapping')}>
                <Ionicons name="arrow-back" size={14} color="#1a6470" />
                <Text style={s.backTxt}>Volver al mapeo</Text>
              </TouchableOpacity>
              <Text style={s.title}>Previsualización</Text>
              <View style={s.previewInfoRow}>
                <Ionicons name="people-outline" size={16} color="#1a6470" />
                <Text style={s.previewInfoTxt}>{previewRows.length} clientes listos para importar</Text>
              </View>
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {previewRows.slice(0, 8).map((row, i) => (
                  <View key={i} style={s.previewRow}>
                    <Text style={s.previewNombre} numberOfLines={1}>{row.nombre}</Text>
                    <Text style={s.previewSub} numberOfLines={1}>
                      {row.telefono}
                      {row.tipo_operacion ? ` · ${row.tipo_operacion}` : ''}
                      {row.zona_busqueda ? ` · ${row.zona_busqueda}` : ''}
                    </Text>
                  </View>
                ))}
                {previewRows.length > 8 && (
                  <Text style={s.previewMas}>+{previewRows.length - 8} más...</Text>
                )}
                <View style={{ height: 12 }} />
              </ScrollView>
              <TouchableOpacity
                style={[s.btnPrimary, importing && s.btnDisabled]}
                onPress={handleConfirm}
                disabled={importing}
              >
                {importing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnPrimaryTxt}>Importar {previewRows.length} clientes</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={s.btnCancel} onPress={handleClose}>
                <Text style={s.btnCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Picker de columna (overlay encima del sheet) ── */}
        {pickerField && (
          <View style={s.pickerOverlay}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPickerField(null)} />
            <View style={s.pickerSheet}>
              <View style={s.handle} />
              <Text style={s.pickerTitle}>
                Columna para: <Text style={{ color: '#1a6470' }}>{CRM_FIELDS.find(f => f.key === pickerField)?.label}</Text>
              </Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                {/* Opción sin asignar */}
                <TouchableOpacity
                  style={s.pickerOpt}
                  onPress={() => { setMapping(m => ({ ...m, [pickerField]: null })); setPickerField(null) }}
                >
                  <Text style={[s.pickerOptTxt, !mapping[pickerField] && s.pickerOptActive]}>Sin asignar</Text>
                  {!mapping[pickerField] && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
                </TouchableOpacity>
                {csvHeaders.map(h => (
                  <TouchableOpacity
                    key={h}
                    style={s.pickerOpt}
                    onPress={() => { setMapping(m => ({ ...m, [pickerField]: h })); setPickerField(null) }}
                  >
                    <Text style={[s.pickerOptTxt, mapping[pickerField] === h && s.pickerOptActive]} numberOfLines={2}>
                      {h}
                    </Text>
                    {mapping[pickerField] === h && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
                  </TouchableOpacity>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </Modal>
  )
}

// ── Utilidades de parseo exportadas para los CRM ─────────────────
export function parsearCSV(texto: string): string[][] {
  const lineas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  const delim = lineas[0].includes(';') ? ';' : ','
  return lineas.map(linea => {
    const cols: string[] = []
    let actual = ''
    let enComillas = false
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i]
      if (ch === '"') {
        if (enComillas && linea[i + 1] === '"') { actual += '"'; i++ }
        else enComillas = !enComillas
      } else if (ch === delim && !enComillas) {
        cols.push(actual.trim()); actual = ''
      } else {
        actual += ch
      }
    }
    cols.push(actual.trim())
    return cols
  })
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 22, paddingBottom: 40, maxHeight: '92%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 18 },
  title:    { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#94a3b8', marginBottom: 14 },
  backBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  backTxt:  { fontSize: 13, color: '#1a6470', fontWeight: '600' },

  // User selection
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 4, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  userRowSel:     { backgroundColor: '#f0fdfa' },
  userAvatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e0f4f5', alignItems: 'center', justifyContent: 'center' },
  userAvatarTxt:  { fontSize: 14, fontWeight: '700', color: '#1a6470' },
  userNombre:     { flex: 1, fontSize: 14, color: '#334155' },

  // Mapping
  fieldList: { maxHeight: 380 },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  fieldRowError: { borderBottomColor: '#fca5a5' },
  fieldLabel:    { fontSize: 14, color: '#334155', fontWeight: '600' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    maxWidth: 180, borderWidth: 1,
  },
  pillMapped:    { backgroundColor: '#e0f4f5', borderColor: '#1a6470' },
  pillEmpty:     { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  pillTxt:       { fontSize: 12, color: '#1a6470', fontWeight: '600', flex: 1 },
  pillTxtEmpty:  { color: '#94a3b8', fontWeight: '400' },
  errorHint:     { fontSize: 12, color: '#ef4444', textAlign: 'center', marginBottom: 6 },

  // Preview
  previewInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  previewInfoTxt: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  previewRow:     { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  previewNombre:  { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  previewSub:     { fontSize: 12, color: '#64748b', marginTop: 2 },
  previewMas:     { fontSize: 12, color: '#94a3b8', paddingTop: 8, textAlign: 'center' as const },

  // Buttons
  btnPrimary:    { backgroundColor: '#1a6470', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  btnDisabled:   { opacity: 0.45 },
  btnPrimaryTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnCancel:     { alignItems: 'center', paddingVertical: 12 },
  btnCancelTxt:  { color: '#94a3b8', fontSize: 14 },

  // Column picker overlay
  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 22, paddingBottom: 40,
  },
  pickerTitle:     { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 14 },
  pickerOpt:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerOptTxt:    { fontSize: 14, color: '#334155', flex: 1, marginRight: 8 },
  pickerOptActive: { color: '#1a6470', fontWeight: '700' },
})
