import { View, Text, StyleSheet } from 'react-native'
import type { CrmMetricas } from '../lib/crmMetricas'
import type { AppColors } from '../lib/ThemeContext'

const ESTADO_LABEL: Record<string, string> = {
  por_perfilar: 'Por perfilar',
  primer_contacto: '1er contacto',
  cita_por_agendar: 'Cita p/agendar',
  cita_agendada: 'Cita agendada',
  cita_a_futuro: 'Cita a futuro',
  seguimiento_cierre: 'Seg. cierre',
  compro: 'Compró',
  no_contesta: 'No contesta',
  descartado: 'Descartado',
}

const ESTADO_COLOR: Record<string, string> = {
  por_perfilar: '#888',
  primer_contacto: '#2196F3',
  cita_por_agendar: '#FF9800',
  cita_agendada: '#1a6470',
  cita_a_futuro: '#9C27B0',
  seguimiento_cierre: '#FFC107',
  compro: '#4CAF50',
  no_contesta: '#F44336',
  descartado: '#ccc',
}

const FUENTE_LABEL: Record<string, string> = {
  referido: 'Referido',
  redes_sociales: 'Redes sociales',
  sitio_web: 'Sitio web',
  llamada_fria: 'Llamada fría',
  evento: 'Evento',
  marketplace: 'Marketplace',
  tokko: 'Tokko',
  campana_fb: 'Campaña FB',
  grupo_fb: 'Grupo FB',
  sheets: 'Importación',
  admin: 'Admin',
  otro: 'Otro',
}

function BarraMetrica({ label, count, total, color, labelColor = '#888', trackColor = '#f0f0f0' }: {
  label: string; count: number; total: number; color: string; labelColor?: string; trackColor?: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ fontSize: 12.5, color: labelColor, flex: 1, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 12.5, fontWeight: '800', color, marginLeft: 8 }}>{count} <Text style={{ color: labelColor, fontWeight: '500' }}>({pct}%)</Text></Text>
      </View>
      <View style={{ height: 8, backgroundColor: trackColor, borderRadius: 5, overflow: 'hidden' }}>
        <View style={{ height: 8, width: `${pct}%` as any, backgroundColor: color, borderRadius: 5 }} />
      </View>
    </View>
  )
}

export default function CrmMetricasPanel({ metricas, c }: { metricas: CrmMetricas; c: AppColors }) {
  return (
    <View>
      {/* 4 stat cards */}
      <View style={styles.crmStatsRow}>
        {[
          { n: metricas.totalLeads,   l: 'Total leads', icon: '👥', color: '#1a6470' },
          { n: metricas.leadsActivos, l: 'Activos',     icon: '🔥', color: '#2563eb' },
          { n: metricas.cerrados,     l: 'Compras',     icon: '✅', color: '#16a34a' },
          { n: metricas.leadsEsteMes, l: 'Este mes',    icon: '🗓️', color: '#7c3aed' },
        ].map((st, i) => (
          <View key={i} style={[styles.crmStatBox, { backgroundColor: st.color + '14', borderColor: st.color + '38' }]}>
            <Text style={styles.crmStatIcon}>{st.icon}</Text>
            <Text style={[styles.crmStatNum, { color: st.color }]}>{st.n}</Text>
            <Text style={[styles.crmStatLabel, { color: c.textMute }]}>{st.l}</Text>
          </View>
        ))}
      </View>

      {/* Pipeline por estado */}
      {metricas.porEstado.length > 0 && (
        <>
          <Text style={[styles.crmSectionTitle, { color: c.text, borderBottomColor: c.border }]}>Pipeline por estado</Text>
          {metricas.porEstado.map(({ estado, count }) => (
            <BarraMetrica
              key={estado}
              label={ESTADO_LABEL[estado] ?? estado}
              count={count}
              total={metricas.totalLeads}
              color={ESTADO_COLOR[estado] ?? '#888'}
              labelColor={c.textMute}
              trackColor={c.border}
            />
          ))}
        </>
      )}

      {/* Fuentes */}
      {metricas.porFuente.length > 0 && (
        <>
          <Text style={[styles.crmSectionTitle, { color: c.text, borderBottomColor: c.border }]}>Fuentes de lead</Text>
          {metricas.porFuente.map(({ fuente, count }) => (
            <BarraMetrica
              key={fuente}
              label={FUENTE_LABEL[fuente] ?? fuente}
              count={count}
              total={metricas.totalLeads}
              color="#1a6470"
              labelColor={c.textMute}
              trackColor={c.border}
            />
          ))}
        </>
      )}

      {/* Actividad */}
      <Text style={[styles.crmSectionTitle, { color: c.text, borderBottomColor: c.border }]}>Actividad</Text>
      <View style={styles.crmActividadRow}>
        <View style={[styles.crmActividadBox, { backgroundColor: '#1a647014', borderColor: '#1a647038' }]}>
          <Text style={[styles.crmActividadNum, { color: '#1a6470' }]}>{metricas.totalInteracciones}</Text>
          <Text style={[styles.crmActividadLabel, { color: c.textMute }]}>💬 Interacciones{'\n'}registradas</Text>
        </View>
        <View style={[styles.crmActividadBox, metricas.recordatoriosPendientes > 0
          ? { backgroundColor: '#FF980018', borderColor: '#FF980055' }
          : { backgroundColor: '#16a34a14', borderColor: '#16a34a38' }]}>
          <Text style={[styles.crmActividadNum, { color: metricas.recordatoriosPendientes > 0 ? '#FF9800' : '#16a34a' }]}>
            {metricas.recordatoriosPendientes}
          </Text>
          <Text style={[styles.crmActividadLabel, { color: c.textMute }]}>⏰ Recordatorios{'\n'}pendientes</Text>
        </View>
      </View>

      {metricas.totalLeads === 0 && (
        <View style={styles.crmEmpty}>
          <Text style={{ fontSize: 34, marginBottom: 8 }}>🗂️</Text>
          <Text style={[styles.crmEmptyText, { color: c.textMute }]}>Sin leads registrados aún.</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  crmStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  crmStatBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  crmStatIcon: { fontSize: 16, marginBottom: 3 },
  crmStatNum: { fontSize: 22, fontWeight: '900' },
  crmStatLabel: { fontSize: 10, marginTop: 2, textAlign: 'center', fontWeight: '600' },

  crmSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 12,
    borderBottomWidth: 1,
    paddingBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  crmActividadRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 8 },
  crmActividadBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  crmActividadNum: { fontSize: 26, fontWeight: '900' },
  crmActividadLabel: { fontSize: 11, marginTop: 4, textAlign: 'center', lineHeight: 15, fontWeight: '600' },
  crmEmpty: { alignItems: 'center', paddingVertical: 30 },
  crmEmptyText: { fontSize: 13, textAlign: 'center' },
})
