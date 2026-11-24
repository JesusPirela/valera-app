// Hook de resolucion para que Node pueda importar los .ts del proyecto sin
// extension, igual que hace Metro. Solo lo usan las pruebas.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && ctx.parentURL?.endsWith('.ts')) {
    try {
      if (!existsSync(fileURLToPath(new URL(spec, ctx.parentURL))) &&
          existsSync(fileURLToPath(new URL(spec + '.ts', ctx.parentURL)))) {
        return next(spec + '.ts', ctx)
      }
    } catch { /* se deja pasar al resolvedor normal */ }
  }
  return next(spec, ctx)
}
