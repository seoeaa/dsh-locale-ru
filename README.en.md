# dsh-locale-ru — Russian interface for DeepSeek Harness

A custom locale plugin that adds a full **Russian locale** to the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) web UI.

## Features

- **Full translation of the dictionary-driven UI**: 26 namespaces, ~690 strings — menus, settings, chat (composer, messages, statuses, images), models, plugins, agent presets, subagents, etc.
- **Automatic**: activates Russian when the browser prefers it.
- Manual switch: **Settings → General → Language → Русский** (remembered in browser localStorage).
- **Survives dsh updates**: lives in the profile (`~/.dsh/profiles/web/`), never touches framework code.

## Install

Requires DeepSeek Harness with the `web` profile (`~/.dsh/profiles/web/`).

```bash
# 1. Clone the plugin into the profile plugin folder
git clone https://github.com/seoeaa/dsh-locale-ru.git ~/.dsh/profiles/web/plugins/dsh-locale-ru

# 2. Register the plugin (adds it to dependencies and profile bundles)
cd ~/.dsh/profiles/web
dsh plugin --profile web add file:./plugins/dsh-locale-ru

# 3. Restart dsh web and refresh the page (Ctrl+R)
```

After the restart the UI turns Russian automatically when the browser prefers it; otherwise pick **Settings → General → Language → Русский**.

## How it works

dsh is built on [Cordis](https://github.com/cordiverse/cordis); the web UI is localized by `@deepseek-ai/dsh-client-locale` through a dictionary registry (`register(ns, { zh, en })`). This plugin registers Russian dictionaries for every UI namespace, adds `ru` to the language list, and keeps the choice in browser localStorage (the host settings schema only accepts `zh`/`en`).

## License

[MIT](LICENSE). Based on the DeepSeek Harness locale plugin API (`@deepseek-ai/dsh-client-locale`, MIT, © 2026 DeepSeek). Translations and integration by the repository author.