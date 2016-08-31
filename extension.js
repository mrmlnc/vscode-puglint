'use strict';

const path = require('path');
const userHome = require('os').homedir();

const vscode = require('vscode');
const {
  TransportKind,
  LanguageClient,
  SettingMonitor
} = require('vscode-languageclient');

function activate(context) {
  const serverModule = path.join(__dirname, 'server.js');
  const clientOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--debug=6004']
      }
    }
  };

  const serverOptions = {
    documentSelector: ['jade', 'pug'],
    synchronize: {
      configurationSection: 'puglint',
      fileEvents: [
        vscode.workspace.createFileSystemWatcher(`{${userHome},**}/.{jade-lint,pug-lint}{rc,.json,rc.json}`),
        vscode.workspace.createFileSystemWatcher(`**/package.json`)
      ]
    }
  };

  const client = new LanguageClient('puglint', clientOptions, serverOptions);

  context.subscriptions.push(new SettingMonitor(client, 'puglint.enable').start());
}

exports.activate = activate;
