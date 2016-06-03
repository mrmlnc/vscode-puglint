'use strict';

const path = require('path');
const userHome = require('os').homedir();

const vscode = require('vscode');
const {
  LanguageClient,
  SettingMonitor
} = require('vscode-languageclient');

function activate(context) {
  const serverModule = path.join(__dirname, 'server.js');
  const client = new LanguageClient('puglint', {
    run: {
      module: serverModule
    },
    debug: {
      module: serverModule,
      options: {
        execArgv: ['--nolazy']
      }
    }
  }, {
    documentSelector: ['jade', 'pug'],
    synchronize: {
      configurationSection: 'puglint',
      fileEvents: [
        vscode.workspace.createFileSystemWatcher(`{${userHome},**}/.{jade-lint,pug-lint}{rc,.js,.json}`),
        vscode.workspace.createFileSystemWatcher(`**/package.json`)
      ]
    }
  });

  context.subscriptions.push(new SettingMonitor(client, 'puglint.enable').start());
}

exports.activate = activate;
