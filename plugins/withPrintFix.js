const { withDangerousMod } = require('@expo/config-plugins')
const path = require('path')
const fs = require('fs')

// Parchea expo-print/PrintPDFRenderTask.kt para corregir el NullPointerException
// que ocurre en Android System WebView >= 6432 cuando mediaSize es null.
// Bug corregido: el fallback usa (DEFAULT_MEDIA_HEIGHT / PIXELS_PER_MIL) para
// obtener el valor en mils (~11000), no en píxeles (792).
module.exports = function withPrintFix(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const filePath = path.join(
        config.modRequest.projectRoot,
        'node_modules/expo-print/android/src/main/java/expo/modules/print/PrintPDFRenderTask.kt'
      )

      if (!fs.existsSync(filePath)) {
        console.warn('[withPrintFix] PrintPDFRenderTask.kt no encontrado, skipping patch')
        return config
      }

      let content = fs.readFileSync(filePath, 'utf8')

      const ORIGINAL = `    override fun onPageFinished(view: WebView, url: String) {
      document = view.createPrintDocumentAdapter("Document")
      // layout the document with appropriate print attributes
      document.onLayout(null, printAttributes, null, object : PrintDocumentAdapterLayoutCallback() {}, null)
      @SuppressLint("Range")
      val pageHeight = PIXELS_PER_MIL * printAttributes.mediaSize!!.heightMils
      numberOfPages = 1 + (view.contentHeight / pageHeight).toInt()

      // Write to a file if file path was passed, otherwise invoke onRenderFinish callback
      if (fileDescriptor != null) {
        document.onWrite(arrayOf(PageRange.ALL_PAGES), fileDescriptor, null, printDocumentWriteCallback)
      } else {
        callbacks.onRenderFinished(document, null, numberOfPages)
      }
    }`

      const PATCHED = `    override fun onPageFinished(view: WebView, url: String) {
      try {
        document = view.createPrintDocumentAdapter("Document")
        // layout the document with appropriate print attributes
        document.onLayout(null, printAttributes, null, object : PrintDocumentAdapterLayoutCallback() {}, null)
        @SuppressLint("Range")
        // heightMils debe estar en milésimas de pulgada (~11000 para carta/A4).
        // DEFAULT_MEDIA_HEIGHT está en píxeles (792); dividir por PIXELS_PER_MIL
        // lo convierte a mils correctamente. Usar 792 directo daría ~57px/página.
        val heightMils = printAttributes.mediaSize?.heightMils?.toDouble()
          ?: (DEFAULT_MEDIA_HEIGHT.toDouble() / PIXELS_PER_MIL)
        val pageHeight = PIXELS_PER_MIL * heightMils
        numberOfPages = 1 + (view.contentHeight / pageHeight).toInt()

        // Write to a file if file path was passed, otherwise invoke onRenderFinish callback
        if (fileDescriptor != null) {
          document.onWrite(arrayOf(PageRange.ALL_PAGES), fileDescriptor, null, printDocumentWriteCallback)
        } else {
          callbacks.onRenderFinished(document, null, numberOfPages)
        }
      } catch (e: Exception) {
        callbacks.onRenderError(PdfWriteException())
      }
    }`

      if (content.includes('mediaSize!!')) {
        content = content.replace(ORIGINAL, PATCHED)
        fs.writeFileSync(filePath, content)
        console.log('[withPrintFix] PrintPDFRenderTask.kt parcheado correctamente')
      } else {
        console.log('[withPrintFix] PrintPDFRenderTask.kt ya estaba parcheado o cambió, skipping')
      }

      return config
    },
  ])
}
