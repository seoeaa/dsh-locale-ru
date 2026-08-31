# How it works

DeepSeek Harness (dsh) is built on [Cordis](https://github.com/cordiverse/cordis): the web UI is localized by the `@deepseek-ai/dsh-client-locale` plugin through a dictionary registry.

Every UI package registers its copy as `register(ns, { zh, en })` — a namespace plus a zh/en dictionary pair. The lookup chain is `ns → active locale → en → key`, so a missing key falls back to English.

## What this plugin does

1. **Registers Russian dictionaries** for every namespace of the interface (`register(ns, { ru: {...} })`). Missing keys fall back to the English entry, so partial dictionaries are safe.
2. **Adds `ru` to the locale list** so `setLocale('ru')` validates and the language dropdown shows «Русский».
3. **Keeps the choice process-local**: the host settings schema accepts only `zh`/`en`, so picking `ru` would be rejected by the settings service. Instead the choice lives in browser `localStorage` (`dsh-locale-ru:pref`) and is applied on every page load.

## The client module

`dsh/client.js` is a client plugin loaded through `window.__ModuleLoader__.load({ id, factory })` — the lazy-CJS bundle protocol of the dsh web client. It injects `locale`, then patches the `LocaleRuntime` instance:

- `register` the `RU` dictionaries (lifecycle tied to the plugin via `ctx.effect`).
- extend `snapshot.locales` with `{ id: 'ru', label: 'Русский' }`.
- neutralise `adopt()` so a server-side zh/en preference cannot override the local choice.
- override `setLocale('ru')` to skip the host write (localStorage instead).
- activate `ru` when `navigator.language` starts with `ru`, or when the saved choice says so.
