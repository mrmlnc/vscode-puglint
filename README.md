# VS Code plugin for pug-lint

> This linter plugin for VS Code provides an interface to [pug-lint](https://github.com/pugjs/pug-lint).

![puglint](https://cloud.githubusercontent.com/assets/7034281/14941231/f0b87bd8-0f9c-11e6-844e-565de4f560f4.png)

## Installation

First, install `pug-lint` use `npm i --save-dev pug-lint` or `npm i -g pug-lint`.

Next, to install extension, press `F1` and select `Extensions: Install Extensions`, then search and choose `puglint`.

See the [extension installation guide](https://code.visualstudio.com/docs/editor/extension-gallery) for details.

## Usage

Enable the linter in the VS Code [settings](https://code.visualstudio.com/docs/customization/userandworkspace).

```json
{
  "puglint.enable": true
}
```

## Configurations

The plugin supports the following files:

  * `.jade-lintrc` or `.jade-lint.json`
  * `.pug-lintrc` or `.pug-lint.json`
  * `package.json`

The rules for determining the configuration file:

  1. Workspace config (current project)
  2. Package file (current project)
  3. Global config ($HOME directory)
  4. Editor settings
  5. Default config (preset "clock")

## Supported settings

**puglint.enable**

Type: `Boolean`
Default: `false`

Control whether puglint is enabled for Pug/Jade files or not.

**puglint.config**

Type: `Object`
Default: `null`

Will be directly passed to [config option](https://github.com/pugjs/pug-lint/blob/master/docs/rules.md).

For example:

```json
{
  "puglint.enable": true,
  "puglint.config": {
    "requireClassLiteralsBeforeIdLiterals": true
  }
}
```

Examples for use `extends` (don't forget to install config, for example [`pug-lint-config-clock`](https://github.com/clocklimited/pug-lint-config-clock)):

```json
{
  "puglint.enable": true,
  "puglint.config": {
    "extends": "clock"
  }
}
```

More information: [pug-lint: extends](https://github.com/pugjs/pug-lint#extends)

## Changelog

See the [Releases section of our GitHub project](https://github.com/mrmlnc/vscode-puglint/releases) for changelogs for each release version.

## License

This software is released under the terms of the MIT license.
