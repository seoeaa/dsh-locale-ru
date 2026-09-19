#!/usr/bin/env node
// Проверка плагина на настоящем сервисе локали dsh (без браузера и без запуска dsh).
//
//   node scripts/verify.mjs [путь к установке dsh]
//
// Скрипт загружает `@deepseek-ai/dsh-client-locale` из установленного dsh,
// применяет к нему наш плагин и проверяет:
//   * язык «ru» зарегистрирован и попадает в список языков;
//   * русский включается сам, если его предпочитает браузер;
//   * английский браузер русский интерфейс не навязывает;
//   * словари переводят ключи, а неизвестный ключ падает на английский;
//   * выбор языка сохраняется в настройках ($DSH_HOME/settings.yaml);
//   * прежний выбор из localStorage переносится в настройки;
//   * выгрузка плагина возвращает язык и словари в исходное состояние.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSandbox, loadModuleSource, runApply } from './lib/browser-sandbox.mjs'
import { resolveDsh, dshLocaleDictionaries, pluginDictionaries } from './lib/dsh-dicts.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const clientPath = path.join(root, 'dsh', 'client.js')
const pluginId = '@dsh-local/locale-ru'

const dsh = resolveDsh(process.argv[2])
const reference = await dshLocaleDictionaries(dsh)
const { dictionaries: ours } = pluginDictionaries(clientPath)

let failed = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) failed += 1
}

/** Поднимает настоящий сервис локали dsh и наш плагин в браузерной песочнице. */
function boot({ languages, storage = {} }) {
  const sandbox = createSandbox({ languages, storage })
  const scope = {
    value: undefined,
    listeners: new Set(),
    getSnapshot() { return { value: this.value } },
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) },
    set(field, value) {
      this.value = { ...(this.value ?? {}), [field]: value }
      for (const fn of this.listeners) fn()
    },
  }
  const disposers = []
  const provided = {}
  const ctx = {
    effect(fn) {
      const dispose = fn()
      disposers.push(typeof dispose === 'function' ? dispose : () => {})
      return () => {}
    },
    // Реальный cordis делает сервис доступным как ctx[<имя>] — повторяем это,
    // иначе плагин не увидит ctx.locale.
    provide(name, value) { provided[name] = value; ctx[name] = value },
    settingsScope: { bind: () => scope },
    slots: { installLocale() {}, inject() {}, register: () => () => {} },
    remote: {}, logger: console,
    on() {}, emit() {}, off() {}, inject: () => () => {},
  }

  const localeSource = fs.readFileSync(path.join(dsh.localePackage, 'lib', 'client.js'), 'utf8')
  runApply(loadModuleSource(localeSource, sandbox), ctx, sandbox)
  const plugin = loadModuleSource(fs.readFileSync(clientPath, 'utf8'), sandbox)
  runApply(plugin, ctx, sandbox)
  sandbox.flushTimeouts()
  return { sandbox, ctx, scope, provided, plugin, disposers }
}

// --- сценарий 1: браузер предпочитает русский ---------------------------------
const russianBrowser = boot({ languages: ['ru-RU', 'ru', 'en'] })
const locale = russianBrowser.provided.locale
check('dsh provides the locale service', Boolean(locale))
check('the plugin injects the locale service', (russianBrowser.plugin.exports.inject ?? []).includes('locale'))
check('the plugin loaded without errors', russianBrowser.sandbox.errors.length === 0, JSON.stringify(russianBrowser.sandbox.errors))

const snapshot = locale.getSnapshot()
const russian = snapshot.locales.find((item) => item.id === 'ru')
check('«ru» is in the language list', Boolean(russian), JSON.stringify(snapshot.locales))
check('its label is «Русский»', russian?.label === 'Русский', russian?.label)
check('a Russian browser gets Russian automatically', snapshot.active === 'ru', snapshot.active)

// --- сценарий 2: переводы -----------------------------------------------------
const translate = {}
for (const [namespace, locales] of Object.entries(ours)) {
  const t = locale.bind(namespace)
  for (const [key, expected] of Object.entries(locales.ru ?? {})) {
    const actual = t(key)
    if (actual !== expected) translate[`${namespace}.${key}`] = `"${actual}" != "${expected}"`
  }
}
check('every translated key resolves to its Russian text',
  Object.keys(translate).length === 0,
  Object.entries(translate).slice(0, 5).map(([key, value]) => `${key}: ${value}`).join('; '))

const fallback = Object.entries(reference)
  .flatMap(([namespace, locales]) => Object.keys(locales.en ?? {}).map((key) => [namespace, key]))
  .find(([namespace, key]) => !(key in (ours[namespace]?.ru ?? {})))
check(fallback ? 'a key missing from the translation falls back to English' : 'fallback chain is not exercised (full coverage)',
  fallback ? locale.bind(fallback[0])(fallback[1]) === reference[fallback[0]].en[fallback[1]] : true,
  fallback ? `${fallback[0]}.${fallback[1]}` : undefined)
check('an unknown key stays as-is', locale.bind('common')('__no_such_key__') === '__no_such_key__')

// --- сценарий 3: выбор языка и его сохранение ---------------------------------
locale.setLocale('en')
check('switching to English applies immediately', locale.getSnapshot().active === 'en' && locale.bind('common')('cancel') === 'Cancel')
check('the choice is stored in the dsh settings', russianBrowser.scope.value?.preference === 'en', JSON.stringify(russianBrowser.scope.value))
locale.setLocale('ru')
check('switching back to Russian works', locale.getSnapshot().active === 'ru' && locale.bind('common')('cancel') === 'Отмена')
check('Russian is stored as well', russianBrowser.scope.value?.preference === 'ru')

// --- сценарий 4: английский браузер и прежний выбор из localStorage -----------
const englishBrowser = boot({ languages: ['en-US', 'en'] })
check('an English browser without a stored choice stays English', englishBrowser.provided.locale.getSnapshot().active === 'en')
check('Russian is still offered there', englishBrowser.provided.locale.getSnapshot().locales.some((item) => item.id === 'ru'))

const legacyBrowser = boot({ languages: ['en-US', 'en'], storage: { 'dsh-locale-ru:pref': 'ru' } })
check('the legacy localStorage choice switches the interface to Russian', legacyBrowser.provided.locale.getSnapshot().active === 'ru')
check('the legacy choice is moved into the settings', legacyBrowser.scope.value?.preference === 'ru')
check('the legacy key is cleaned up', !('dsh-locale-ru:pref' in legacyBrowser.sandbox.storage))

// --- сценарий 5: выгрузка плагина --------------------------------------------
for (const dispose of [...russianBrowser.disposers].reverse()) dispose()
const afterUnload = locale.getSnapshot()
check('unloading the plugin removes «ru» from the list', !afterUnload.locales.some((item) => item.id === 'ru'))
check('unloading the plugin does not break the locale service', afterUnload.active === 'en' && locale.bind('common')('cancel') === 'Cancel', afterUnload.active)

console.log(failed === 0 ? 'RESULT: OK' : `RESULT: ${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
