# Security

This plugin runs entirely in the browser (client half) plus a no-op server half. It does not read files, reach the network, or touch credentials: it only registers translation dictionaries and patches the in-memory locale runtime.

No API keys, tokens, or configuration leave the machine. The plugin does not write to `~/.dsh` or `~/.modlens` / `~/.modsearch` configuration files.

The language choice is stored in the browser's `localStorage` only.
