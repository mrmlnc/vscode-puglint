'use strict';

const path = require('path');
const userHome = require('os').homedir();

const vscode = require('vscode');
const langClient = require('vscode-languageclient');

function activate(context) {
  const serverModule = path.join(__dirname, 'server.js');
  const client = new langClient.LanguageClient('puglint', {
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
      fileEvents: vscode.workspace.createFileSystemWatcher(`{${userHome},**}/{.jade-lint,.pug-lint,package}{rc,.json}`)
    }
  });

  context.subscriptions.push(new langClient.SettingMonitor(client, 'puglint.enable').start());
}

exports.activate = activate;
