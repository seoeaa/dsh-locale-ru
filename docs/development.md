# Development

## Layout

```
dsh-locale-ru/
├── package.json           # dsh.bundle + dsh.client manifest, npm test scripts
├── cordis.patch.yml       # bundle patch: mounts the plugin row
├── dsh/
│   ├── index.js           # server half (empty; mounts the bundle)
│   └── client.js          # client half: RU dictionaries + locale registration
└── scripts/
    ├── verify.mjs         # runs the plugin against the real dsh locale service
    ├── check-coverage.mjs # compares the dictionaries with the installed dsh
    └── lib/               # browser sandbox + access to the installed dsh
```

## Adding or fixing translations

Edit the `RU` object in `dsh/client.js`. Keys must match the English dictionaries of the owning
dsh UI package: the namespace and the key are the lookup contract.

Then check the result:

```bash
npm run check   # missing / stale keys, {placeholders}, empty values
npm test        # the same plus the runtime verification
```

`npm run check` prints every key of the installed dsh that is missing from the translation and
every translated key that the installed dsh no longer knows, so updating after a dsh release is a
mechanical step: translate the listed keys, delete the stale ones, rerun.

## How the scripts work

`scripts/lib/browser-sandbox.mjs` substitutes `window`, `document`, `navigator` and `require`, so
the client modules of dsh (`lib/client.js`, a `window.__ModuleLoader__.load({ id, factory })`
bundle) can be loaded in Node. `scripts/lib/dsh-dicts.mjs` uses that sandbox to read the English
dictionaries of the installed dsh and the Russian dictionaries of this plugin.

The scripts find dsh automatically (via `which dsh`). To point them at another installation, pass
the path explicitly:

```bash
node scripts/verify.mjs /path/to/node_modules/@deepseek-ai
node scripts/check-coverage.mjs /path/to/node_modules/@deepseek-ai
```

## Testing locally

```bash
git clone https://github.com/seoeaa/dsh-locale-ru.git ~/.dsh/profiles/web/plugins/dsh-locale-ru
cd ~/.dsh/profiles/web
dsh plugin --profile web add file:./plugins/dsh-locale-ru
# restart dsh web and hard-refresh the browser (Ctrl+Shift+R)
```

## Releasing

1. `npm test` must be green.
2. Update `CHANGELOG.md` and the namespace/string counts in both READMEs if they changed.
3. Bump `version` in `package.json`, commit, push.
4. On the machine that uses the plugin:

```bash
cd ~/.dsh/profiles/web/plugins/dsh-locale-ru && git pull
cd ~/.dsh/profiles/web && pnpm add file:./plugins/dsh-locale-ru
# restart dsh web
```
