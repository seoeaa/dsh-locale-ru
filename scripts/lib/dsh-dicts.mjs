// Доступ к установленному DeepSeek Harness: английские словари интерфейса и
// словари нашего плагина. Нужен для двух служебных проверок:
//   node scripts/check-coverage.mjs   — полнота и актуальность перевода;
//   node scripts/verify.mjs           — работоспособность плагина на реальном
//                                       сервисе локали dsh.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createSandbox, loadModuleSource, runApply, stubContext } from './browser-sandbox.mjs'

/**
 * Находит установленный dsh и каталог пакетов @deepseek-ai.
 * @param {string} [explicit] - путь из аргумента или переменной окружения.
 * @returns {{ dshRoot: string, deepseekDir: string, localePackage: string }}
 */
export function resolveDsh(explicit) {
  const candidates = [
    explicit,
    process.env.DSH_DIR,
    process.env.DSH_CLIENT_LOCALE_DIR,
    dshFromPath(),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const resolved = interpret(candidate)
    if (resolved) return resolved
  }
  throw new Error(
    'dsh is not found. Pass its path explicitly: node scripts/verify.mjs /path/to/node_modules/@deepseek-ai',
  )
}

function dshFromPath() {
  try {
    const bin = execFileSync('which', ['dsh'], { encoding: 'utf8' }).trim()
    return bin || undefined
  } catch {
    return undefined
  }
}

function interpret(candidate) {
  const target = fs.existsSync(candidate) ? fs.realpathSync(candidate) : candidate
  // 1. Каталог пакетов @deepseek-ai (например .../node_modules/@deepseek-ai).
  if (isDeepseekDir(target)) return fromDeepseekDir(target)
  // 2. Корень пакета @deepseek-ai/dsh.
  if (packageName(target) === '@deepseek-ai/dsh') return fromDshPackage(target)
  // 3. Файл внутри установки (например bin/dsh): поднимаемся до корня пакета dsh.
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    let dir = path.dirname(target)
    while (dir !== path.dirname(dir)) {
      if (packageName(dir) === '@deepseek-ai/dsh') return fromDshPackage(dir)
      dir = path.dirname(dir)
    }
  }
  // 4. node_modules или его часть: <путь>[/node_modules]/@deepseek-ai/dsh.
  for (const nested of [
    path.join(target, '@deepseek-ai', 'dsh'),
    path.join(target, 'node_modules', '@deepseek-ai', 'dsh'),
  ]) {
    if (packageName(nested) === '@deepseek-ai/dsh') return fromDshPackage(nested)
  }
  return undefined
}

/** Пакеты клиента лежат либо внутри пакета dsh, либо рядом с ним (pnpm). */
function fromDshPackage(dshPackage) {
  const deepseekDir = [
    path.join(dshPackage, 'node_modules', '@deepseek-ai'),
    path.dirname(dshPackage),
  ].find(isDeepseekDir)
  if (!deepseekDir) return undefined
  return {
    dshRoot: dshPackage,
    deepseekDir,
    localePackage: path.join(deepseekDir, 'dsh-client-locale'),
  }
}

function fromDeepseekDir(deepseekDir) {
  return {
    dshRoot: path.dirname(deepseekDir),
    deepseekDir,
    localePackage: path.join(deepseekDir, 'dsh-client-locale'),
  }
}

function isDeepseekDir(dir) {
  return fs.existsSync(path.join(dir, 'dsh-client-locale', 'package.json'))
}

function packageName(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name
  } catch {
    return undefined
  }
}

/** Ключ в исходнике клиентского модуля: словари регистрирует только он. */
const REGISTERS_LOCALE = /locale\.register\s*\(|locale\.addLanguage\s*\(/

/**
 * Ищет клиентские модули dsh, которые регистрируют словари локали. Остальные
 * модули не загружаем: они не нужны, а их побочные эффекты рассчитаны на браузер.
 */
function walkClientModules(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'types' || entry.name === 'dist') continue
      walkClientModules(full, found)
    } else if (entry.name === 'client.js' && REGISTERS_LOCALE.test(fs.readFileSync(full, 'utf8'))) {
      found.push(full)
    }
  }
  return found
}

/**
 * Английские словари всех клиентских модулей dsh: `{ namespace: { en: { key: text } } }`.
 * Модули выполняются в песочнице, реальный dsh и браузер не нужны.
 * @param {{ deepseekDir: string }} dsh
 * @returns {Promise<Record<string, Record<string, Record<string, string>>>>}
 */
export async function dshLocaleDictionaries(dsh) {
  const dictionaries = {}
  const sandbox = createSandbox()
  // Модули dsh, выполняясь вне браузера, пишут в консоль предупреждения об
  // окружении и падают в асинхронных эффектах: словари это не затрагивает.
  const warn = console.warn
  const error = console.error
  const onUncaught = (failure) => sandbox.errors.push(['async', String(failure?.message ?? failure)])
  console.warn = () => {}
  console.error = () => {}
  process.on('uncaughtException', onUncaught)
  process.on('unhandledRejection', onUncaught)
  try {
    for (const file of walkClientModules(dsh.deepseekDir)) {
      const module = loadModuleSource(fs.readFileSync(file, 'utf8'), sandbox)
      if (!module.exports) continue
      captureLocaleRuntime(module.exports, dictionaries)
      const ctx = stubContext((namespace, locale, dict) => merge(dictionaries, namespace, locale, dict))
      runApply(module, ctx, sandbox)
      ctx.runDeferredEffects()
    }
    // Даём обещаниям модулей завершиться внутри окна с обработчиками:
    // их асинхронные ошибки — шум заглушек, а не проблема словарей.
    for (let tick = 0; tick < 3; tick += 1) await new Promise((resolve) => setImmediate(resolve))
  } finally {
    process.off('uncaughtException', onUncaught)
    process.off('unhandledRejection', onUncaught)
    console.warn = warn
    console.error = error
  }
  return dictionaries
}

/**
 * Пакет локали держит словари в собственном экземпляре LocaleRuntime, а не в
 * `ctx.locale`, поэтому перехватываем его `register` на прототипе.
 */
function captureLocaleRuntime(exports, dictionaries) {
  const runtime = exports.LocaleRuntime ?? exports.default?.LocaleRuntime
  if (!runtime?.prototype || typeof runtime.prototype.register !== 'function') return
  if (runtime.prototype.register.__dshLocaleRuPatched) return
  const original = runtime.prototype.register
  runtime.prototype.register = function (namespace, localeOrDicts, dict) {
    const pairs = typeof localeOrDicts === 'string' ? [[localeOrDicts, dict]] : Object.entries(localeOrDicts)
    for (const [locale, entries] of pairs) merge(dictionaries, namespace, locale, entries)
    return original.apply(this, arguments)
  }
  runtime.prototype.register.__dshLocaleRuPatched = true
}

function merge(dictionaries, namespace, locale, entries) {
  if (!entries || typeof entries !== 'object') return
  dictionaries[namespace] ??= {}
  dictionaries[namespace][locale] = { ...(dictionaries[namespace][locale] ?? {}), ...entries }
}

/**
 * Русские словари нашего плагина: `{ namespace: { ru: { key: text } } }`.
 * @param {string} clientPath - путь к `dsh/client.js`.
 */
export function pluginDictionaries(clientPath) {
  const dictionaries = {}
  const sandbox = createSandbox()
  const module = loadModuleSource(fs.readFileSync(clientPath, 'utf8'), sandbox)
  const ctx = stubContext((namespace, locale, dict) => merge(dictionaries, namespace, locale, dict))
  runApply(module, ctx, sandbox)
  ctx.runDeferredEffects()
  return { dictionaries, module, sandbox, ctx }
}
