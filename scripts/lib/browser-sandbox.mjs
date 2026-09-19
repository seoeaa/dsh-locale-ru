// Минимальная браузерная песочница для служебных скриптов репозитория.
//
// Клиентская половина плагина dsh — обычный файл, который выполняет
// `window.__ModuleLoader__.load({ id, factory })`. Чтобы получить словари или
// применить плагин к сервису локали вне браузера, достаточно подменить
// глобальные `window`, `document`, `navigator` и заглушить `require`:
// запускать настоящий dsh и браузер для проверок не нужно.

/** Универсальная «всё принимающая» заглушка: вызывается, конструируется, отдаёт любые свойства. */
export function anyProxy(name = 'any') {
  const target = function () { return proxy }
  const proxy = new Proxy(target, {
    get(_, prop) {
      if (prop === 'then') return undefined
      if (prop === Symbol.toPrimitive) return () => name
      if (prop === 'prototype') return target.prototype
      if (typeof prop === 'symbol') return undefined
      return anyProxy(`${name}.${String(prop)}`)
    },
    set() { return true },
    apply() { return proxy },
    construct() { return {} },
    has() { return true },
  })
  return proxy
}

function createElement() {
  return {
    style: { getPropertyValue: () => '', setProperty() {}, removeProperty() {}, length: 0, item: () => '' },
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    children: [], childNodes: [], textContent: '', innerHTML: '',
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    appendChild: (child) => child, removeChild: (child) => child, insertBefore: (child) => child,
    addEventListener() {}, removeEventListener() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    animate: () => ({ finished: Promise.resolve(), cancel() {} }),
    focus() {}, blur() {}, click() {}, contains: () => false,
  }
}

/** Свойства, которые сборщик dsh копирует при импорте модуля (react и подобные). */
const INTEROP_KEYS = [
  'memo', 'forwardRef', 'createElement', 'Fragment', 'jsx', 'jsxs', 'jsxDEV',
  'useState', 'useEffect', 'useLayoutEffect', 'useMemo', 'useCallback', 'useRef',
  'useContext', 'useReducer', 'useSyncExternalStore', 'createContext', 'createRoot',
  'createPortal', 'render', 'unmount', 'default', 'Provider', 'Consumer',
  'Button', 'Icon', 'IconButton', 'Text', 'Tooltip', 'Modal', 'Select', 'Input',
  'Field', 'Row', 'Card', 'Chip', 'Menu', 'Dialog', 'Spinner', 'Skeleton',
  'useStore', 'defineSlot', 'createSlot', 'registerSlot', 'useSlot', 'useSlotStore',
  'bind', 't', 'clsx', 'css', 'cn', 'classNames', 'useTranslation', 'translate',
]

const REACT_STUBS = {
  memo: (component) => component,
  forwardRef: (component) => component,
  createElement: () => null,
  jsx: () => null, jsxs: () => null, jsxDEV: () => null, Fragment: Symbol('Fragment'),
  useState: (value) => [value, () => {}],
  useEffect: () => {}, useLayoutEffect: () => {},
  useMemo: (factory) => (typeof factory === 'function' ? factory() : undefined),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  useContext: () => undefined,
  useReducer: (_reducer, state) => [state, () => {}],
  useSyncExternalStore: (getSnapshot) => getSnapshot(),
  createContext: () => ({ Provider: () => null, Consumer: () => null }),
  createRoot: () => ({ render() {}, unmount() {} }),
  createPortal: () => null, render: () => {}, unmount: () => {},
}

/** Заглушка `require`: react-подобные модули отдают рабочие заглушки, остальные — «всё принимающий» прокси. */
export function fakeRequire(id) {
  return new Proxy(REACT_STUBS, {
    get(target, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === '__esModule') return true
      if (prop in target) return target[prop]
      return anyProxy(`require:${id}.${String(prop)}`)
    },
    ownKeys: () => INTEROP_KEYS,
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'symbol') return undefined
      return {
        configurable: true,
        enumerable: true,
        get: () => (prop in target ? target[prop] : anyProxy(`require:${id}.${String(prop)}`)),
      }
    },
    has: () => true,
    set: () => true,
  })
}

/**
 * Подменяет глобальное свойство. В новых версиях Node `navigator` и
 * `localStorage` объявлены как get-only, поэтому обычное присваивание не
 * подходит. Модули дополнительно получают эти объекты параметрами
 * (см. {@link loadModuleSource}), так что неудачная подмена не критична.
 */
function defineGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  } catch {
    globalThis[name] = value
  }
}

/**
 * Создаёт песочницу и подменяет браузерные глобальные объекты процесса.
 * @param {object} [options]
 * @param {string[]} [options.languages] - `navigator.languages`, влияет на выбор языка.
 * @param {Record<string, string>} [options.storage] - начальное содержимое localStorage.
 * @returns {{ modules: Map<string, object>, errors: Array<[string, string]>, storage: Record<string, string>, flushTimeouts: () => void }}
 */
export function createSandbox(options = {}) {
  const languages = options.languages ?? ['en']
  const storage = { ...(options.storage ?? {}) }
  const timeouts = []
  const errors = []
  const modules = new Map()

  const navigatorStub = { languages, language: languages[0], userAgent: 'node' }
  const localStorageStub = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value) },
    removeItem: (key) => { delete storage[key] },
  }

  const windowStub = {
    navigator: navigatorStub,
    localStorage: localStorageStub,
    setTimeout: (fn) => { timeouts.push(fn); return timeouts.length },
    clearTimeout() {},
    __ModuleLoader__: {
      /** Загрузчик dsh: вызывает фабрику модуля и запоминает её экспорт. */
      load(spec) {
        try {
          modules.set(spec.id, spec.factory(fakeRequire))
        } catch (error) {
          errors.push([spec.id, error.message])
        }
      },
    },
  }

  defineGlobal('window', windowStub)
  defineGlobal('navigator', navigatorStub)
  defineGlobal('localStorage', localStorageStub)
  defineGlobal('document', {
    querySelector: () => null, querySelectorAll: () => [],
    createElement, createTextNode: () => ({}),
    head: createElement(), body: createElement(), documentElement: createElement(),
    addEventListener() {}, removeEventListener() {},
  })
  defineGlobal('location', { href: 'http://localhost/', protocol: 'http:', hostname: 'localhost', search: '' })
  defineGlobal('EventSource', class { close() {} addEventListener() {} })
  defineGlobal('requestAnimationFrame', (fn) => { timeouts.push(fn); return timeouts.length })
  defineGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
  defineGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  defineGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  defineGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  defineGlobal('MutationObserver', class { observe() {} disconnect() {} })

  return {
    modules,
    errors,
    storage,
    /** Выполняет отложенные колбэки setTimeout/requestAnimationFrame. */
    flushTimeouts() { while (timeouts.length) timeouts.shift()() },
  }
}

/**
 * Загружает исходник клиентского модуля dsh (выполняется фабрика модуля).
 * @param {string} source - содержимое `lib/client.js`.
 * @param {object} sandbox - песочница из {@link createSandbox}.
 * @returns {{ id: string, exports: object }} идентификатор и экспорт модуля.
 */
export function loadModuleSource(source, sandbox) {
  let id = 'unknown'
  const loader = {
    load(spec) {
      id = spec.id
      sandbox.modules.set(spec.id, spec.factory(fakeRequire))
    },
  }
  const previous = globalThis.window.__ModuleLoader__
  globalThis.window.__ModuleLoader__ = loader
  try {
    new Function('window', 'document', 'navigator', 'localStorage', 'location', source)(
      globalThis.window, globalThis.document, globalThis.navigator, globalThis.localStorage, globalThis.location,
    )
  } finally {
    globalThis.window.__ModuleLoader__ = previous
  }
  return { id, exports: sandbox.modules.get(id) }
}

/**
 * Выполняет `apply(ctx)` модуля. Ошибка не прерывает скрипт: она попадает в
 * `sandbox.errors`, потому что служебным скриптам важны словари, а не UI.
 * @param {{ id: string, exports: object }} module - результат {@link loadModuleSource}.
 * @param {object} ctx - контекст плагина.
 * @param {object} sandbox - песочница для отчёта об ошибках.
 */
export function runApply({ id, exports }, ctx, sandbox) {
  const apply = exports?.apply ?? exports?.default?.apply
  if (typeof apply !== 'function') return
  try {
    const result = apply(ctx)
    if (result && typeof result.catch === 'function') {
      result.catch((error) => sandbox.errors.push([id, error.message]))
    }
  } catch (error) {
    sandbox.errors.push([id, error.message])
  }
}

/** Заглушка области настроек: без сохранённых значений, но с рабочим интерфейсом. */
function createSettingsScope() {
  const listeners = new Set()
  return {
    value: undefined,
    getSnapshot() { return { value: this.value } },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(field, value) {
      this.value = { ...(this.value ?? {}), [field]: value }
      for (const fn of listeners) fn()
    },
  }
}

/**
 * Контекст-заглушка для сбора словарей: `ctx.effect` откладывается (модуль
 * успевает загрузиться, даже если `apply` падает на середине), а
 * `ctx.locale.register` записывает пары «namespace + язык → словарь».
 * @param {(namespace: string, locale: string, dict: object) => void} onRegister
 * @returns {object} контекст с методом `runDeferredEffects()`.
 */
export function stubContext(onRegister) {
  const deferred = []
  const ctx = {
    locale: {
      register(namespace, localeOrDicts, dict) {
        const pairs = typeof localeOrDicts === 'string' ? [[localeOrDicts, dict]] : Object.entries(localeOrDicts)
        for (const [locale, entries] of pairs) onRegister(namespace, locale, entries)
        return () => {}
      },
      addLanguage() { return () => {} },
      bind: () => (key) => key,
      getSnapshot: () => ({ active: 'en', locales: [], revision: 0 }),
      subscribe: () => () => {},
    },
    effect(fn) { deferred.push(fn); return () => {} },
    // Разделяемая область настроек: некоторые плагины (например тема) читают
    // её уже в конструкторе и падают на заглушке-прокси.
    settingsScope: { bind: () => createSettingsScope() },
    inject: () => () => {},
    provide() {}, emit() {}, on() {}, off() {}, once() {},
  }
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop in target) return target[prop]
      if (prop === 'runDeferredEffects') {
        return () => {
          for (const fn of deferred) {
            try { fn() } catch { /* словари уже собраны */ }
          }
        }
      }
      if (typeof prop === 'symbol') return undefined
      return anyProxy(String(prop))
    },
  })
}
