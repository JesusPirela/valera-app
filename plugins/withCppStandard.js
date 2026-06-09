const { withDangerousMod } = require('@expo/config-plugins')
const { promises: fs } = require('fs')
const path = require('path')

module.exports = function withCppStandard(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile')
      let contents = await fs.readFile(podfilePath, 'utf8')

      if (contents.includes('withCppStandard_applied')) {
        return config
      }

      // Patch fmt headers: FMT_USE_CONSTEVAL may appear as "#  define FMT_USE_CONSTEVAL 1"
      // (with arbitrary spaces), so we use a Ruby regex instead of string matching.
      // gnu++20 is kept globally — RN 0.79 core requires C++20 (std::unordered_set::contains etc.)
      const cppFix = `
  # withCppStandard_applied
  require 'find'
  Find.find(installer.sandbox.root.to_s) do |file|
    next unless file.end_with?('.h')
    begin
      content = File.read(file, encoding: 'utf-8')
      if content.match?(/^#\\s*define\\s+FMT_USE_CONSTEVAL\\s+1/)
        patched = content.gsub(/^(#\\s*define\\s+FMT_USE_CONSTEVAL)\\s+1/, '\\1 0')
        File.write(file, patched)
        puts "withCppStandard: patched \#{file}"
      end
    rescue
    end
  end`

      const rnPostInstallRegex = /(react_native_post_install\([\s\S]*?\))/
      if (rnPostInstallRegex.test(contents)) {
        contents = contents.replace(rnPostInstallRegex, `$1\n${cppFix}`)
      } else {
        console.warn('[withCppStandard] react_native_post_install not found in Podfile')
      }

      await fs.writeFile(podfilePath, contents, 'utf8')
      return config
    },
  ])
}
