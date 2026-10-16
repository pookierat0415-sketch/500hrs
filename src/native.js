import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

// Differences between the web app and the Android app (Capacitor).

/** True inside the Android APK. */
export const isNativeApp = Capacitor.isNativePlatform()

/**
 * Keeps Android's status and navigation bar icons readable. The bars sit on the
 * app's window background, which is always slate (android/.../values/styles.xml),
 * so they need light icons whichever theme the page itself is using.
 */
export function syncSystemBars() {
  if (!isNativeApp) return
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {})
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Saves a generated file. Browsers download it; the Android app can't download
 * blob URLs, so it writes the file to the app's cache and opens the share sheet,
 * where the user can save it to Files or Drive, or send it to someone.
 */
export async function saveFile(blob, filename) {
  if (!isNativeApp) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  })
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: 'Save or send your report' })
  } catch (err) {
    // Closing the share sheet without choosing anything isn't an error.
    if (!/cancel/i.test(err?.message ?? '')) throw err
  }
}
