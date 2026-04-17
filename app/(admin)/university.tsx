import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Switch, Platform, TextInput,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Stats = {
  total_cursos: number
  cursos_publicados: number
  total_cert: number
  total_puntos: number
  entregas_pendientes: number
  ranking: { nombre: string | null; puntos: number; certs: number }[]
}

type CursoAdmin = {
  id: string
  titulo: string
  nivel: string
  publicado: boolean
  categoria: string
  totalLecciones: number
  totalCerts: number
}

function confirmar(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(msg))
  return new Promise((res) => Alert.alert('Confirmar', msg, [
    { text: 'Cancelar', onPress: () => res(false) },
    { text: 'Eliminar', style: 'destructive', onPress: () => res(true) },
  ]))
}

export default function AdminUniversity() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [cursos, setCursos] = useState<CursoAdmin[]>([])
  const [loading, setLoading] = useState(true)

  // Config intro video
  const [introUrl, setIntroUrl] = useState('')
  const [introTitulo, setIntroTitulo] = useState('')
  const [guardandoConfig, setGuardandoConfig] = useState(false)
  const [configGuardada, setConfigGuardada] = useState(false)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const [{ data: statsData }, { data: cursosData }, { data: configData }] = await Promise.all([
      supabase.rpc('get_vu_stats_admin'),
      supabase.from('vu_cursos').select('id, titulo, nivel, publicado, categoria, vu_lecciones(id), vu_certificados(id)').order('orden'),
      supabase.from('vu_config').select('clave, valor').in('clave', ['intro_video_url', 'intro_video_titulo']),
    ])

    if (statsData) setStats(statsData as Stats)

    const cfg = Object.fromEntries((configData ?? []).map((r: any) => [r.clave, r.valor]))
    setIntroUrl(cfg['intro_video_url'] ?? '')
    setIntroTitulo(cfg['intro_video_titulo'] ?? 'Bienvenido a Valera University')

    setCursos((cursosData ?? []).map((c: any) => ({
      id: c.id, titulo: c.titulo, nivel: c.nivel, publicado: c.publicado,
      categoria: c.categoria,
      totalLecciones: (c.vu_lecciones ?? []).length,
      totalCerts: (c.vu_certificados ?? []).length,
    })))
    setLoading(false)
  }

  async function guardarConfig() {
    setGuardandoConfig(true)
    await Promise.all([
      supabase.from('vu_config').upsert({ clave: 'intro_video_url', valor: introUrl.trim() }),
      supabase.from('vu_config').upsert({ clave: 'intro_video_titulo', valor: introTitulo.trim() }),
    ])
    setConfigGuardada(true)
    setTimeout(() => setConfigGuardada(false), 3000)
    setGuardandoConfig(false)
  }

  async function togglePublicado(curso: CursoAdmin) {
    await supabase.from('vu_cursos').update({ publicado: !curso.publicado }).eq('id', curso.id)
    cargar()
  }

  async function eliminarCurso(id: string, titulo: string) {
    const ok = await confirmar(`¿Eliminar "${titulo}"? Se borrará todo su contenido.`)
    if (!ok) return
    await supabase.from('vu_cursos').delete().eq('id', id)
    cargar()
  }

  return (
    <ScrollView style={estilos.container} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View style={estilos.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={estilos.backText}>← Volver</Text>
        </TouchableOpacity>
        <View style={estilos.logoRow}>
          <Text style={estilos.logoIcon}>🎓</Text>
          <View>
            <Text style={estilos.logoTitle}>Valera University</Text>
            <Text style={estilos.logoSub}>Panel de administración</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Stats */}
          <View style={estilos.statsGrid}>
            <StatCard icon="📚" label="Total cursos"   value={stats?.total_cursos ?? 0} />
            <StatCard icon="✅" label="Publicados"     value={stats?.cursos_publicados ?? 0} color="#2e7d32" />
            <StatCard icon="🏆" label="Certificados"  value={stats?.total_cert ?? 0} color="#c9a84c" />
            <StatCard icon="⭐" label="Puntos dados"  value={stats?.total_puntos ?? 0} color="#6a1b9a" />
          </View>

          {/* Entregas pendientes — acceso rápido */}
          {(stats?.entregas_pendientes ?? 0) > 0 && (
            <TouchableOpacity
              style={estilos.entregasBanner}
              onPress={() => router.push('/(admin)/university-entregas')}
            >
              <Text style={estilos.entregasBannerText}>
                📥 {stats!.entregas_pendientes} entrega{stats!.entregas_pendientes > 1 ? 's' : ''} pendiente{stats!.entregas_pendientes > 1 ? 's' : ''} de revisión
              </Text>
              <Text style={estilos.entregasBannerArrow}>→</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={estilos.btnEntregasLink}
            onPress={() => router.push('/(admin)/university-entregas')}
          >
            <Text style={estilos.btnEntregasLinkText}>📥 Ver todas las entregas de tareas</Text>
          </TouchableOpacity>

          {/* ── Config video de introducción ── */}
          <View style={estilos.configCard}>
            <Text style={estilos.configTitle}>🎬 Video de introducción</Text>
            <Text style={estilos.configSub}>Este video aparece como pop-up cuando los prospectadores entran por primera vez a Valera University.</Text>

            <Text style={estilos.label}>Título del video</Text>
            <TextInput
              style={estilos.input}
              value={introTitulo}
              onChangeText={setIntroTitulo}
              placeholder="Bienvenido a Valera University"
            />

            <Text style={estilos.label}>URL de YouTube</Text>
            <TextInput
              style={estilos.input}
              value={introUrl}
              onChangeText={setIntroUrl}
              placeholder="https://youtu.be/... o https://youtube.com/watch?v=..."
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[estilos.btnGuardarConfig, guardandoConfig && { opacity: 0.6 }]}
              onPress={guardarConfig}
              disabled={guardandoConfig}
            >
              {guardandoConfig
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={estilos.btnGuardarConfigText}>
                    {configGuardada ? '✓ Guardado' : '💾 Guardar config'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          {/* Ranking */}
          {stats?.ranking && stats.ranking.length > 0 && (
            <View style={estilos.rankCard}>
              <Text style={estilos.sectionTitle}>🏅 Top alumnos</Text>
              {stats.ranking.slice(0, 5).map((r, i) => (
                <View key={i} style={estilos.rankRow}>
                  <Text style={estilos.rankPos}>#{i + 1}</Text>
                  <Text style={estilos.rankNombre}>{r.nombre ?? 'Usuario'}</Text>
                  <Text style={estilos.rankPuntos}>⭐ {r.puntos} pts</Text>
                  <Text style={estilos.rankCerts}>🏆 {r.certs}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Gestión de cursos */}
          <View style={estilos.cursosHeader}>
            <Text style={estilos.sectionTitle}>Gestión de cursos</Text>
            <TouchableOpacity style={estilos.btnNuevo} onPress={() => router.push('/(admin)/university-curso-form')}>
              <Text style={estilos.btnNuevoText}>+ Nuevo curso</Text>
            </TouchableOpacity>
          </View>

          {cursos.length === 0 ? (
            <View style={estilos.empty}>
              <Text style={estilos.emptyIcon}>📭</Text>
              <Text style={estilos.emptyText}>No hay cursos todavía</Text>
              <TouchableOpacity style={[estilos.btnNuevo, { marginTop: 16 }]} onPress={() => router.push('/(admin)/university-curso-form')}>
                <Text style={estilos.btnNuevoText}>+ Crear primer curso</Text>
              </TouchableOpacity>
            </View>
          ) : (
            cursos.map((curso) => (
              <View key={curso.id} style={estilos.cursoCard}>
                <View style={estilos.cursoHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.cursoTitulo}>{curso.titulo}</Text>
                    <View style={estilos.cursoMeta}>
                      <Text style={estilos.cursoMetaText}>{curso.categoria}</Text>
                      <Text style={estilos.cursoMetaText}>· {curso.nivel}</Text>
                      <Text style={estilos.cursoMetaText}>· {curso.totalLecciones} lecciones</Text>
                      <Text style={estilos.cursoMetaText}>· 🏆 {curso.totalCerts}</Text>
                    </View>
                  </View>
                </View>
                <View style={estilos.cursoActions}>
                  <View style={estilos.publishRow}>
                    <Text style={[estilos.publishLabel, { color: curso.publicado ? '#2e7d32' : '#888' }]}>
                      {curso.publicado ? '✓ Publicado' : 'Borrador'}
                    </Text>
                    <Switch value={curso.publicado} onValueChange={() => togglePublicado(curso)}
                      trackColor={{ false: '#ddd', true: '#1a6470' }} thumbColor={curso.publicado ? '#c9a84c' : '#fff'} />
                  </View>
                  <View style={estilos.btnRow}>
                    <TouchableOpacity style={estilos.btnEditar} onPress={() => router.push(`/(admin)/university-curso-form?id=${curso.id}`)}>
                      <Text style={estilos.btnEditarText}>✏️ Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={estilos.btnEliminar} onPress={() => eliminarCurso(curso.id, curso.titulo)}>
                      <Text style={estilos.btnEliminarText}>🗑 Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  )
}

function StatCard({ icon, label, value, color = '#1a6470' }: { icon: string; label: string; value: number; color?: string }) {
  return (
    <View style={[estilos.statCard, { borderColor: color }]}>
      <Text style={estilos.statIcon}>{icon}</Text>
      <Text style={[estilos.statValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={estilos.statLabel}>{label}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  header: { backgroundColor: '#1a6470', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  backText: { color: '#c9a84c', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoIcon: { fontSize: 36 },
  logoTitle: { color: '#c9a84c', fontSize: 20, fontWeight: '800' },
  logoSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  statCard: { width: '47%', backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5 },
  statIcon: { fontSize: 24, marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  entregasBanner: { backgroundColor: '#e65100', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entregasBannerText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  entregasBannerArrow: { color: '#fff', fontSize: 18, fontWeight: '700' },
  btnEntregasLink: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1a6470', marginHorizontal: 16, marginBottom: 16, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnEntregasLinkText: { color: '#1a6470', fontWeight: '600', fontSize: 13 },
  configCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e8eef0' },
  configTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 },
  configSub: { fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1a1a2e', marginBottom: 12 },
  btnGuardarConfig: { backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  btnGuardarConfigText: { color: '#c9a84c', fontWeight: '700', fontSize: 14 },
  rankCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e8eef0' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1a6470', marginBottom: 12 },
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f4f5', gap: 8 },
  rankPos: { fontSize: 13, fontWeight: '700', color: '#c9a84c', width: 28 },
  rankNombre: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1a1a2e' },
  rankPuntos: { fontSize: 12, color: '#888' },
  rankCerts: { fontSize: 12, color: '#888' },
  cursosHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  btnNuevo: { backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  btnNuevoText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { color: '#aaa', fontSize: 14 },
  cursoCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e8eef0' },
  cursoHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  cursoTitulo: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  cursoMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cursoMetaText: { fontSize: 11, color: '#888' },
  cursoActions: { padding: 12, gap: 10 },
  publishRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  publishLabel: { fontSize: 13, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 8 },
  btnEditar: { flex: 1, backgroundColor: '#f0f4f5', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnEditarText: { fontSize: 13, color: '#1a6470', fontWeight: '600' },
  btnEliminar: { flex: 1, backgroundColor: '#fde8e8', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnEliminarText: { fontSize: 13, color: '#c0392b', fontWeight: '600' },
})
