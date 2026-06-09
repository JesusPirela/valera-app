export type UserRole = 'admin' | 'supervisor' | 'prospectador' | 'prospectador_plus' | 'nuevo'

export type PropertyType = 'casa' | 'depa' | 'terreno' | 'local'
export type PropertyModality = 'venta' | 'renta'

export interface Profile {
  id: string
  email: string
  role: UserRole
  nombre: string
  created_at: string
}

export interface Inmobiliaria {
  id: string
  nombre: string
  asesor_referencia: string | null
  telefono: string | null
  logo_url: string | null
  exclusiva: boolean
}

export interface Property {
  id: string
  display_id: string       // ej: PROP-0047
  tipo: PropertyType
  modalidad: PropertyModality
  titulo: string
  descripcion: string
  precio: number
  disponible: boolean
  direccion: string
  colonia?: string
  ciudad: string
  recamaras?: number
  banos?: number
  medios_banos?: number
  metros_cuadrados?: number
  inmobiliaria_id?: string | null
  created_by: string
  created_at: string
  updated_at: string
  images?: PropertyImage[]
}

export interface PropertyImage {
  id: string
  property_id: string
  url_original: string
  url_enhanced?: string
  orden: number
  created_at: string
}
