# Development

## Layout

```
dsh-locale-ru/
├── package.json        # dsh.bundle + dsh.client manifest
├── cordis.patch.yml    # bundle patch: mounts the plugin row
└── dsh/
    ├── index.js        # server half (minimal; mounts the bundle)
    └── client.js       # client half: RU dictionaries + locale runtime patches
```

## Adding or fixing translations

Edit the `RU` object in `dsh/client.js`. Keys must match the English dictionaries of the corresponding dsh UI package (the namespace and key are the lookup contract).

## Testing locally

```bash
git clone https://github.com/seoeaa/dsh-locale-ru.git ~/.dsh/profiles/web/plugins/dsh-locale-ru
cd ~/.dsh/profiles/web
dsh plugin --profile web add file:./plugins/dsh-locale-ru
# restart dsh web and hard-refresh the browser (Ctrl+Shift+R)
```

## Releasing

```bash
cd ~/.dsh/profiles/web/plugins/dsh-locale-ru && git pull
cd ~/.dsh/profiles/web && pnpm add file:./plugins/dsh-locale-ru
# restart dsh web
```
