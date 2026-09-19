#!/usr/bin/env node
// Полнота и актуальность русского перевода по установленному DeepSeek Harness.
//
//   node scripts/check-coverage.mjs [путь к установке dsh]
//
// Скрипт сравнивает словари `dsh/client.js` с английскими словарями dsh:
//   * missing  — ключи dsh, которых нет в переводе (показываются по-английски);
//   * stale    — ключи перевода, которых больше нет в dsh (мусор в словаре);
//   * placeholder — расхождение в {подстановках} между английским и русским;
//   * empty    — пустые переводы;
//   * same-as-en — перевод совпал с английским текстом (обычно это норма для
//     названий приложений и аббревиатур, поэтому это подсказка, а не ошибка).
//
// Код возврата 1, если есть missing/stale/placeholder/empty.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDsh, dshLocaleDictionaries, pluginDictionaries } from './lib/dsh-dicts.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const clientPath = path.join(root, 'dsh', 'client.js')

const dsh = resolveDsh(process.argv[2])
const reference = await dshLocaleDictionaries(dsh)
const { dictionaries: ours, sandbox } = pluginDictionaries(clientPath)
if (sandbox.errors.length > 0) {
  console.error('the plugin failed to load:', sandbox.errors)
  process.exit(1)
}

const placeholders = (text) => new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]))
const sameSet = (left, right) => left.size === right.size && [...left].every((item) => right.has(item))

const missing = []
const stale = []
const placeholderMismatch = []
const empty = []
const sameAsEnglish = []

for (const [namespace, locales] of Object.entries(reference)) {
  const english = locales.en ?? {}
  const russian = ours[namespace]?.ru ?? {}
  for (const [key, text] of Object.entries(english)) {
    if (!(key in russian)) missing.push(`${namespace}.${key}`)
    else if (!sameSet(placeholders(text), placeholders(russian[key]))) {
      placeholderMismatch.push(`${namespace}.${key}: "${text}" -> "${russian[key]}"`)
    }
  }
  for (const key of Object.keys(russian)) {
    if (!(key in english)) stale.push(`${namespace}.${key}`)
  }
}

for (const [namespace, locales] of Object.entries(ours)) {
  for (const [key, text] of Object.entries(locales.ru ?? {})) {
    if (String(text).trim() === '') empty.push(`${namespace}.${key}`)
  }
}

const referenceKeys = Object.values(reference).reduce((total, locales) => total + Object.keys(locales.en ?? {}).length, 0)
const translatedKeys = Object.values(ours).reduce((total, locales) => total + Object.keys(locales.ru ?? {}).length, 0)

for (const [namespace, locales] of Object.entries(ours)) {
  for (const [key, text] of Object.entries(locales.ru ?? {})) {
    const english = reference[namespace]?.en?.[key]
    if (english !== undefined && english === text) sameAsEnglish.push(`${namespace}.${key}`)
  }
}

const report = (title, items) => {
  if (items.length === 0) return
  console.log(`${title} (${items.length}):`)
  for (const item of items.slice(0, 40)) console.log(`  - ${item}`)
  if (items.length > 40) console.log(`  ... and ${items.length - 40} more`)
}

console.log(`dsh: ${dsh.dshRoot}`)
console.log(`namespaces: ${Object.keys(ours).length} translated / ${Object.keys(reference).length} in dsh`)
console.log(`keys: ${translatedKeys} translated / ${referenceKeys} in dsh`)
report('missing translations', missing)
report('stale keys (not in this dsh anymore)', stale)
report('placeholder mismatches', placeholderMismatch)
report('empty translations', empty)
report('same as English (check by hand)', sameAsEnglish)
for (const [id, message] of sandbox.errors) console.log(`  ! plugin warning from ${id}: ${message}`)

const failed = missing.length + stale.length + placeholderMismatch.length + empty.length
console.log(failed === 0 ? 'RESULT: OK' : `RESULT: ${failed} problem(s)`)
process.exit(failed === 0 ? 0 : 1)
