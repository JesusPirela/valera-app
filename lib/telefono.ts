// Normaliza un teléfono mexicano (con o sin +52/521, espacios, guiones, etc.)
// a la forma canónica "52" + 10 dígitos.
export function normalizarTelefono(tel: string): string {
  let phone = tel.replace(/\D/g, '')
  if (phone.startsWith('5252')) phone = phone.slice(2)
  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
  if (phone.length === 10) phone = '52' + phone
  return phone
}

// A partir de un teléfono canónico ("52" + 10 dígitos), devuelve las dos
// variantes con las que un mismo lead puede aparecer en WhatsApp/Twilio:
// con "52" y con el "521" legacy.
export function variantesWhatsapp(telefono: string): string[] {
  const canonico = normalizarTelefono(telefono)
  if (canonico.length !== 12) return [`whatsapp:+${canonico}`]
  const sufijo = canonico.slice(2)
  return [`whatsapp:+52${sufijo}`, `whatsapp:+521${sufijo}`]
}
