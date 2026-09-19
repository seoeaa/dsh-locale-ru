# How it works

DeepSeek Harness (dsh) is built on [Cordis](https://github.com/cordiverse/cordis): the web UI is
localized by the `@deepseek-ai/dsh-client-locale` plugin through a dictionary registry exposed as
the `locale` service (`ctx.locale`).

Every UI package registers its own copy with `register(ns, { zh, en })` — a namespace plus a
zh/en dictionary pair. Lookup walks the fallback chain of the active language in the requested
namespace, then in the shared `common` namespace, and finally shows the key itself. A language is
described by a definition: `{ id, label, fallback }`, and the chain must terminate at `en`.

## What this plugin does

```js
exports.inject = ['locale']

exports.apply = function (ctx) {
  // 1. the language itself, with English as its fallback
  ctx.effect(() => ctx.locale.addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' }))

  // 2. Russian dictionaries, one per namespace; the per-locale register form
  ctx.effect(() => ctx.locale.register('common', 'ru', { cancel: 'Отмена' }))
}
```

1. **Registers the language** `ru`. That is what puts «Русский» into the language list and makes
   `setLocale('ru')` valid. Registration also re-resolves the active locale, so Russian applies
   immediately when it is the stored preference or the browser's preferred language.
2. **Registers Russian dictionaries** for every namespace of the interface. Missing keys fall back
   to the English entry, so partial dictionaries are safe.
3. **Owns its registrations**: every `addLanguage`/`register` call is wrapped in `ctx.effect`, so
   unloading the plugin removes the language and its dictionaries and the UI returns to the
   previously available locale.

## Who stores the choice

The Host does. The locale plugin persists the selection in the `locale` section of
`$DSH_HOME/settings.yaml` (`locale.preference`) on loopback pages, and browser-derived detection is
only a provisional value until that stored preference arrives. The plugin therefore contains no
activation logic at all: it registers the language and dictionaries and lets dsh decide.

Versions 0.1.x of this plugin stored the choice in `localStorage` (`dsh-locale-ru:pref`) instead,
because they patched the locale runtime and could not write the settings. The current version
honours such a legacy value once: it switches to Russian and removes the old key, after which the
choice lives in `settings.yaml`.

## The client module

`dsh/client.js` is a client plugin loaded through `window.__ModuleLoader__.load({ id, factory })` —
the lazy-CJS bundle protocol of the dsh web client. The factory returns an object with `name`,
`inject` and `apply`; the dictionaries themselves are plain data inside the module.

The server half (`dsh/index.js`) is intentionally empty: it only exists so the bundle mounts and
the client half is discovered.

## Comments on namespace/key ownership

`namespace + key` is the contract between this plugin and dsh. A key is shown only while the
package that owns it still registers it under the same name, so:
- new keys in a dsh release show up as English text until translated (`npm run check` lists them);
- renamed or removed keys must be dropped from the dictionaries (`npm run check` reports them as
  stale).
