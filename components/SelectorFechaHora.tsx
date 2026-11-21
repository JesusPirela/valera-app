// Selector de fecha y hora con calendario.
//
// Vivía dentro de detalle-cliente. Se sacó aquí cuando los avisos de
// seguimiento también tuvieron que poder cambiar la fecha: dos calendarios
// distintos para lo mismo acaban comportándose distinto, y el de aquí ya
// tenía resueltas las esquinas (las horas dan la vuelta sin cambiar de día,
// no deja elegir un momento que ya pasó, los minutos van de 5 en 5).
import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native'
// ── DateTimePicker ───────────────────────────────────────
export default function SelectorFechaHora({ value, onChange, label }: {
  value: Date | null; onChange: (d: Date | null) => void; label: string
}) {
  const [open, setOpen] = useState(false)
  const [temp, setTemp] = useState<Date>(value ?? new Date())
  const [mesVista, setMesVista] = useState<Date>(value ?? new Date())

  function adj(field: 'date' | 'month' | 'year' | 'hour' | 'minute', delta: number) {
    setTemp((prev) => {
      const d = new Date(prev)
      if (field === 'date')   d.setDate(d.getDate() + delta)
      if (field === 'month')  d.setMonth(d.getMonth() + delta)
      if (field === 'year')   d.setFullYear(d.getFullYear() + delta)
      // Hora y minutos dan la vuelta DENTRO del mismo día: pasar de 23 a 0 (o de
      // 0 a 23) ya no cambia la fecha, que era lo confuso. Módulo sin acarreo.
      if (field === 'hour')   d.setHours((d.getHours() + delta + 24) % 24)
      if (field === 'minute') d.setMinutes((d.getMinutes() + delta + 60) % 60)
      // No permitir fechas/horas anteriores al presente
      const ahora = new Date()
      if (d.getTime() < ahora.getTime()) return ahora
      return d
    })
  }

  const displayStr = value
    ? value.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Sin fecha'

  return (
    <>
      <Text style={dpStyles.label}>{label}</Text>
      <TouchableOpacity style={dpStyles.trigger} onPress={() => {
        let b: Date
        if (value) {
          b = new Date(value)
          b.setMinutes(Math.round(b.getMinutes() / 5) * 5, 0, 0)
        } else {
          // Sin fecha previa: arrancar a las 7:00 am (mañana si las 7 de hoy ya pasaron).
          b = new Date(); b.setHours(7, 0, 0, 0)
          if (b.getTime() < Date.now()) b.setDate(b.getDate() + 1)
        }
        setTemp(b); setMesVista(new Date(b.getFullYear(), b.getMonth(), 1)); setOpen(true)
      }}>
        <Text style={[dpStyles.triggerText, !value && dpStyles.placeholder]}>{displayStr}</Text>
        <Text style={dpStyles.icon}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <View style={dpStyles.overlay}>
          <View style={dpStyles.modal}>
            <Text style={dpStyles.modalTitle}>Fecha y hora</Text>
            <Text style={dpStyles.secLabel}>Fecha</Text>
            {(() => {
              const y = mesVista.getFullYear(), m = mesVista.getMonth()
              const diasMes = new Date(y, m + 1, 0).getDate()
              const primerDia = new Date(y, m, 1).getDay() // 0=Dom
              const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0)
              const celdas: (number | null)[] = [
                ...Array(primerDia).fill(null),
                ...Array.from({ length: diasMes }, (_, i) => i + 1),
              ]
              const seleccionar = (d: number) => {
                const nuevo = new Date(temp)
                nuevo.setFullYear(y, m, d)
                setTemp(nuevo)
              }
              return (
                <View style={dpStyles.cal}>
                  <View style={dpStyles.calHead}>
                    <TouchableOpacity onPress={() => setMesVista(new Date(y, m - 1, 1))} style={dpStyles.calNav}><Text style={dpStyles.calNavTxt}>‹</Text></TouchableOpacity>
                    <Text style={dpStyles.calMes}>{mesVista.toLocaleString('es-MX', { month: 'long', year: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => setMesVista(new Date(y, m + 1, 1))} style={dpStyles.calNav}><Text style={dpStyles.calNavTxt}>›</Text></TouchableOpacity>
                  </View>
                  <View style={dpStyles.calSemana}>
                    {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((w, i) => (
                      <Text key={i} style={dpStyles.calDow}>{w}</Text>
                    ))}
                  </View>
                  <View style={dpStyles.calGrid}>
                    {celdas.map((d, i) => {
                      if (d == null) return <View key={i} style={dpStyles.calCell} />
                      const fecha = new Date(y, m, d)
                      const pasado = fecha < hoy0
                      const sel = temp.getFullYear() === y && temp.getMonth() === m && temp.getDate() === d
                      const esHoy = fecha.getTime() === hoy0.getTime()
                      return (
                        <TouchableOpacity key={i} style={dpStyles.calCell} disabled={pasado} onPress={() => seleccionar(d)}>
                          <View style={[dpStyles.calDia, sel && dpStyles.calDiaSel, esHoy && !sel && dpStyles.calDiaHoy]}>
                            <Text style={[dpStyles.calDiaTxt, sel && dpStyles.calDiaTxtSel, pasado && dpStyles.calDiaTxtOff]}>{d}</Text>
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )
            })()}
            <Text style={dpStyles.secLabel}>Hora</Text>
            <View style={dpStyles.row}>
              <Spin label="Hora" value={String(temp.getHours()).padStart(2, '0')}   onUp={() => adj('hour', 1)}   onDown={() => adj('hour', -1)} />
              <Spin label="Min"  value={String(temp.getMinutes()).padStart(2, '0')} onUp={() => adj('minute', 5)} onDown={() => adj('minute', -5)} />
            </View>
            <View style={dpStyles.actions}>
              <TouchableOpacity style={dpStyles.btnCancel} onPress={() => setOpen(false)}>
                <Text style={dpStyles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={dpStyles.btnConfirm} onPress={() => { onChange(temp); setOpen(false) }}>
                <Text style={dpStyles.btnConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

function Spin({ label, value, onUp, onDown }: { label: string; value: string | number; onUp: () => void; onDown: () => void }) {
  return (
    <View style={dpStyles.spin}>
      <Text style={dpStyles.spinLabel}>{label}</Text>
      <TouchableOpacity onPress={onUp} style={dpStyles.spinBtn}><Text style={dpStyles.spinArrow}>▲</Text></TouchableOpacity>
      <Text style={dpStyles.spinValue}>{value}</Text>
      <TouchableOpacity onPress={onDown} style={dpStyles.spinBtn}><Text style={dpStyles.spinArrow}>▼</Text></TouchableOpacity>
    </View>
  )
}

// ── DateTimePicker styles ────────────────────────────────
const dpStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f7f8',
    borderRadius: 10, borderWidth: 1, borderColor: '#e0e8ea',
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14,
  },
  triggerText: { flex: 1, fontSize: 14, color: '#1a1a2e' },
  placeholder: { color: '#aaa' },
  icon: { color: '#aaa', fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modal: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '88%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a6470', marginBottom: 16, textAlign: 'center' },
  secLabel: { fontSize: 11, fontWeight: '700', color: '#aaa', letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  cal: { marginBottom: 16 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calNav: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  calNavTxt: { fontSize: 22, color: '#1a6470', fontWeight: '800', marginTop: -2 },
  calMes: { fontSize: 15, fontWeight: '800', color: '#1a1a2e', textTransform: 'capitalize' },
  calSemana: { flexDirection: 'row' },
  calDow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#9eafb2', paddingVertical: 4 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  calDia: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calDiaSel: { backgroundColor: '#1a6470' },
  calDiaHoy: { borderWidth: 1.5, borderColor: '#1a6470' },
  calDiaTxt: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  calDiaTxtSel: { color: '#fff', fontWeight: '800' },
  calDiaTxtOff: { color: '#cbd5e1' },
  spin: { alignItems: 'center', minWidth: 60 },
  spinLabel: { fontSize: 10, color: '#aaa', marginBottom: 4, fontWeight: '600' },
  spinBtn: { padding: 8 },
  spinArrow: { fontSize: 16, color: '#1a6470' },
  spinValue: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginVertical: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' },
  btnCancel: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f0f0f0' },
  btnCancelText: { color: '#555', fontWeight: '600', fontSize: 13 },
  btnConfirm: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: '#1a6470' },
  btnConfirmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})

