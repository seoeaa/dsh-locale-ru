# Security

This plugin runs entirely in the browser (client half) plus an empty server half. It does not read
files, reach the network, or touch credentials: it only registers a language and translation
dictionaries through the public locale API of dsh.

No API keys, tokens, or configuration leave the machine. The plugin does not write to `~/.dsh`,
`~/.modlens`, or `~/.modsearch` configuration files.

The language choice is stored by dsh itself in `~/.dsh/settings.yaml` (`locale.preference`). The
only browser storage the plugin touches is a one-time migration of the `dsh-locale-ru:pref`
`localStorage` key written by versions 0.1.x, which it removes after moving the choice into the
settings.

The helper scripts under `scripts/` are developer tools: they run Node locally, read the installed
dsh client modules, and never start dsh or a browser. They are not part of the installed plugin.
