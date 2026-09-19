# dsh-locale-ru — Russian interface for DeepSeek Harness

A custom locale plugin that adds a full **Russian locale** to the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) web UI.

## Features

- **Full translation of the dictionary-driven UI**: 42 namespaces, 1257 strings — chat and
  trajectory, settings (models, plugins, permissions, agent presets, appearance), sidebars,
  files, background jobs, schedule, subagents, skills, feedback.
- **Public locale API only**: the plugin registers a language and dictionaries
  (`addLanguage` + `register`) without patching dsh internals, so dsh upgrades cannot break it.
- **Automatic**: activates Russian when the browser prefers it.
- Manual switch: **Settings → General → Language → Русский**.
- The choice is **persisted by dsh in `~/.dsh/settings.yaml`** (`locale.preference`) and applies to every browser.
- A key missing from the dictionaries falls back to English, so partial coverage is safe.
- **Survives dsh updates**: lives in the profile (`~/.dsh/profiles/web/`), never touches framework code.

## Compatibility

- DeepSeek Harness **0.1.2-rc.1 or newer** (verified on 0.1.5-rc.1 / 0.1.5-rc.2 and 0.1.2-rc.1).
- Requires the `@deepseek-ai/dsh-client-locale` service, shipped with dsh.
- Third-party plugin UIs (e.g. `dsh-better-sidebar`, `dsh-cron`, `dsh-mcp-panel`) are not included:
  their own dictionaries stay English. They can be added as extra namespaces.

## Install

```bash
git clone https://github.com/seoeaa/dsh-locale-ru.git ~/.dsh/profiles/web/plugins/dsh-locale-ru
cd ~/.dsh/profiles/web
dsh plugin --profile web add link:./plugins/dsh-locale-ru
# restart dsh web and reload the page (Ctrl+R)
```

After the restart the UI turns Russian automatically when the browser prefers it; otherwise pick
**Settings → General → Language → Русский**.

`link:` matters: `add file:...` copies the plugin into the profile's `node_modules`, so a later
`git pull` in the clone has no effect on the running harness. With `link:` the clone itself is the
package — `git pull` plus a restart is all an update needs. Installs created with `file:` can be
switched once with:

```bash
cd ~/.dsh/profiles/web
rm -rf node_modules/@dsh-local/locale-ru
dsh plugin --profile web add link:./plugins/dsh-locale-ru
```

## How it works

The dsh web UI is localized by `@deepseek-ai/dsh-client-locale` through a dictionary registry.
Its public `ctx.locale` service lets a plugin add a whole language:

```js
exports.inject = ['locale']

exports.apply = function (ctx) {
  ctx.effect(() => ctx.locale.addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' }))
  ctx.effect(() => ctx.locale.register('common', 'ru', { cancel: 'Отмена' }))
}
```

This repository does exactly that for 42 UI namespaces: it registers the `ru` language with an
`en` fallback, registers the Russian dictionaries, and removes both when the plugin unloads.
Lookup walks the `ru → en` chain, and the host persists the language choice itself.
See [docs/how-it-works.md](docs/how-it-works.md).

## Checking and updating the translation

The helper scripts run without a browser and without starting dsh — they load the installed dsh
client modules in a sandbox:

```bash
npm run verify   # the plugin works on the real dsh locale service (20 checks)
npm run check    # coverage: 42/42 namespaces, 1257/1257 keys, 0 mismatches
npm test          # both
```

## Limitations

- Text hardcoded in plugin source (outside the dictionaries) stays English — true for the shipped `zh`/`en` too.
- Third-party plugin dictionaries are out of scope.
- dsh dictionaries support only `one`/`other` plurals, so counters are worded to read correctly for any number.

## License

[MIT](LICENSE). Based on the DeepSeek Harness locale plugin API (`@deepseek-ai/dsh-client-locale`, MIT, © 2026 DeepSeek).
Translations and integration by the repository author.
