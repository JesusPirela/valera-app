// Obliga a TODAS las librerías de iOS a pedir, como mínimo, iOS 15.1.
//
// El problema: expo-build-properties pone el objetivo en la app, pero cada
// librería que se instala trae el suyo escrito adentro. Xcode de este año ya
// no acepta nada por debajo de iOS 15, así que dos de ellas tumbaron la build:
//
//   ReachabilitySwift                 pedía 12.0
//   RNCAsyncStorage_resources         pedía 13.4
//
// Se arregla aquí y no caso por caso a propósito: la lista de librerías cambia
// cada vez que se instala algo, y perseguirlas una por una es una build
// perdida cada vez. Esto recorre todas y le sube el piso a las que estén por
// debajo, sin tocar las que ya estén bien.
//
// Valera no se topó con esto porque su última build de iOS fue con una versión
// anterior de Xcode. Cuando se recompile, le va a pasar lo mismo y va a
// necesitar este mismo parche.
const { withDangerousMod } = require('@expo/config-plugins')
const { promises: fs } = require('fs')
const path = require('path')

const MINIMO = '15.1'

module.exports = function withMinDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile')
      let contenido = await fs.readFile(podfile, 'utf8')

      if (contenido.includes('withMinDeploymentTarget_applied')) return config

      // generated_projects cubre los proyectos que CocoaPods parte en varios
      // (es lo normal desde la 1.11); pods_project cubre el caso de uno solo.
      // Se recorren los dos porque cuál aplica depende de la versión, y una
      // lista vacía no hace nada malo.
      const arreglo = `
  # withMinDeploymentTarget_applied
  def valera_subir_piso(proyecto)
    proyecto.targets.each do |t|
      t.build_configurations.each do |c|
        actual = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if actual.nil? || actual.to_f < ${MINIMO}
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MINIMO}'
        end
      end
    end
  end
  if installer.respond_to?(:generated_projects)
    installer.generated_projects.each { |p| valera_subir_piso(p) }
  end
  valera_subir_piso(installer.pods_project) if installer.pods_project`

      const postInstall = /(react_native_post_install\([\s\S]*?\))/
      if (postInstall.test(contenido)) {
        contenido = contenido.replace(postInstall, `$1\n${arreglo}`)
      } else {
        console.warn('[withMinDeploymentTarget] no encontré react_native_post_install en el Podfile')
      }

      await fs.writeFile(podfile, contenido, 'utf8')
      return config
    },
  ])
}
