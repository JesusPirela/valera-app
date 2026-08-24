// Catálogo compartido de avatares animados premium (emoji, GIF, nombre).
// Se usa en la tienda (entrega automática al azar), el perfil y el inventario.
// Antes estaba duplicado en varios archivos; esta es la fuente única.
export type AvatarPremium = { emoji: string; gif: string; nombre: string }

const NOTO = (hex: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.gif`

export const AVATARES_PREMIUM: AvatarPremium[] = [
  { emoji: '🔥', gif: NOTO('1f525'), nombre: 'Fuego'        },
  { emoji: '⚡', gif: NOTO('26a1'),  nombre: 'Rayo'         },
  { emoji: '🌈', gif: NOTO('1f308'), nombre: 'Arcoíris'     },
  { emoji: '🦋', gif: NOTO('1f98b'), nombre: 'Mariposa'     },
  { emoji: '🐉', gif: NOTO('1f409'), nombre: 'Dragón'       },
  { emoji: '🦄', gif: NOTO('1f984'), nombre: 'Unicornio'    },
  { emoji: '👑', gif: NOTO('1f451'), nombre: 'Corona'       },
  { emoji: '💫', gif: NOTO('1f4ab'), nombre: 'Destello'     },
  { emoji: '🌸', gif: NOTO('1f338'), nombre: 'Cerezo'       },
  { emoji: '🔮', gif: NOTO('1f52e'), nombre: 'Bola mágica'  },
  { emoji: '🌊', gif: NOTO('1f30a'), nombre: 'Ola'          },
  { emoji: '🏆', gif: NOTO('1f3c6'), nombre: 'Trofeo'       },
  { emoji: '🎉', gif: NOTO('1f389'), nombre: 'Fiesta'       },
  { emoji: '✨', gif: NOTO('2728'),  nombre: 'Brillos'      },
  { emoji: '🦁', gif: NOTO('1f981'), nombre: 'León'         },
  { emoji: '🐺', gif: NOTO('1f43a'), nombre: 'Lobo'         },
]

export const GIF_AVATAR: Record<string, string> = Object.fromEntries(
  AVATARES_PREMIUM.map(a => [a.emoji, a.gif]),
)
