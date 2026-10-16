// Trainee name helpers: the name is entered as parts and shown as one string.

export const MAX_NAME = 40

export const cleanName = (s) => s.replace(/\s+/g, ' ').trim()
export const cleanInitial = (s) =>
  s
    .replace(/[^\p{L}]/gu, '')
    .slice(0, 2)
    .toUpperCase()

/** "Juan", "D", "Dela Cruz" -> "Juan D. Dela Cruz" */
export function composeName({ firstName = '', middleInitial = '', lastName = '' }) {
  const mi = cleanInitial(middleInitial)
  return [cleanName(firstName), mi && `${mi}.`, cleanName(lastName)].filter(Boolean).join(' ')
}

/** Best-effort split of an older single "name" field into parts. */
export function splitName(name = '') {
  const words = cleanName(name).split(' ').filter(Boolean)
  if (words.length < 2) return { firstName: words[0] ?? '', middleInitial: '', lastName: '' }
  const miIndex = words.findIndex((w, i) => i > 0 && i < words.length - 1 && /^\p{L}{1,2}\.$/u.test(w))
  if (miIndex > 0) {
    return {
      firstName: words.slice(0, miIndex).join(' '),
      middleInitial: words[miIndex].replace('.', ''),
      lastName: words.slice(miIndex + 1).join(' '),
    }
  }
  return { firstName: words.slice(0, -1).join(' '), middleInitial: '', lastName: words.at(-1) }
}

export const nameIsComplete = (v) => Boolean(cleanName(v.firstName) && cleanName(v.lastName))

export const cleanNameParts = (v) => ({
  firstName: cleanName(v.firstName),
  middleInitial: cleanInitial(v.middleInitial),
  lastName: cleanName(v.lastName),
})
