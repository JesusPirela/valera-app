import { View, Text, StyleSheet } from 'react-native'
import type { CrmMetricas } from '../lib/crmMetricas'

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

function BarraMetrica({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 12, color: '#888', flex: 1 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color, marginLeft: 8 }}>{count} <Text style={{ color: '#aaa', fontWeight: '400' }}>({pct}%)</Text></Text>
      </View>
      <View style={{ height: 7, backgroundColor: '#f0f0f0', borderRadius: 4 }}>
        <View style={{ height: 7, width: `${pct}%` as any, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  )
}

export default function CrmMetricasPanel({ metricas }: { metricas: CrmMetricas }) {
  return (
    <View>
      <View style={styles.crmStatsRow}>
        <View style={styles.crmStatBox}>
          <Text style={styles.crmStatNum}>{metricas.totalLeads}</Text>
          <Text style={styles.crmStatLabel}>Total leads</Text>
        </View>
        <View style={styles.crmStatBox}>
          <Text style={styles.crmStatNum}>{metricas.leadsActivos}</Text>
          <Text style={styles.crmStatLabel}>Activos</Text>
        </View>
        <View style={[styles.crmStatBox, { borderColor: '#4CAF50' }]}>
          <Text style={[styles.crmStatNum, { color: '#4CAF50' }]}>{metricas.cerrados}</Text>
          <Text style={styles.crmStatLabel}>Compras</Text>
        </View>
        <View style={styles.crmStatBox}>
          <Text style={styles.crmStatNum}>{metricas.leadsEsteMes}</Text>
          <Text style={styles.crmStatLabel}>Este mes</Text>
        </View>
      </View>

      {metricas.porEstado.length > 0 && (
        <>
          <Text style={styles.crmSectionTitle}>Pipeline por estado</Text>
          {metricas.porEstado.map(({ estado, count }) => (
            <BarraMetrica
              key={estado}
              label={ESTADO_LABEL[estado] ?? estado}
              count={count}
              total={metricas.totalLeads}
              color={ESTADO_COLOR[estado] ?? '#888'}
            />
          ))}
        </>
      )}

      {metricas.porFuente.length > 0 && (
        <>
          <Text style={styles.crmSectionTitle}>Fuentes de lead</Text>
          {metricas.porFuente.map(({ fuente, count }) => (
            <BarraMetrica
              key={fuente}
              label={FUENTE_LABEL[fuente] ?? fuente}
              count={count}
              total={metricas.totalLeads}
              color="#1a6470"
            />
          ))}
        </>
      )}

      <Text style={styles.crmSectionTitle}>Actividad</Text>
      <View style={styles.crmActividadRow}>
        <View style={styles.crmActividadBox}>
          <Text style={styles.crmActividadNum}>{metricas.totalInteracciones}</Text>
          <Text style={styles.crmActividadLabel}>Interacciones{'\n'}registradas</Text>
        </View>
        <View style={[styles.crmActividadBox, metricas.recordatoriosPendientes > 0 && { borderColor: '#FF9800' }]}>
          <Text style={[styles.crmActividadNum, metricas.recordatoriosPendientes > 0 && { color: '#FF9800' }]}>
            {metricas.recordatoriosPendientes}
          </Text>
          <Text style={styles.crmActividadLabel}>Recordatorios{'\n'}pendientes</Text>
        </View>
      </View>

      {metricas.totalLeads === 0 && (
        <Text style={styles.emptySubtitle}>Sin leads registrados aún.</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  crmStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  crmStatBox: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 10,
    alignItems: 'center',
  },
  crmStatNum: { fontSize: 22, fontWeight: '800', color: '#1a6470' },
  crmStatLabel: { fontSize: 10, color: '#888', marginTop: 2, textAlign: 'center' },

  crmSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a6470',
    marginTop: 16,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 4,
  },

  crmActividadRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 8 },
  crmActividadBox: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 14,
    alignItems: 'center',
  },
  crmActividadNum: { fontSize: 26, fontWeight: '800', color: '#1a6470' },
  crmActividadLabel: { fontSize: 11, color: '#888', marginTop: 4, textAlign: 'center', lineHeight: 15 },

  emptySubtitle: { fontSize: 13, color: '#aaa', textAlign: 'center', marginTop: 16 },
})
