'use strict';

import * as path from 'path';

import { ExtensionContext, workspace } from 'vscode';
import {
	TransportKind,
	LanguageClient,
	SettingMonitor,
	LanguageClientOptions,
	ServerOptions
} from 'vscode-languageclient';

export function activate(context: ExtensionContext) {
	const serverModule = path.join(__dirname, 'server.js');

	const clientOptions: LanguageClientOptions = {
		documentSelector: ['jade', 'pug'],
		synchronize: {
			configurationSection: 'puglint',
			fileEvents: [
				workspace.createFileSystemWatcher('**/.pug-lint{rc,rc.js,rc.json,.json}'),
				workspace.createFileSystemWatcher('**/.jade-lint{rc,.json}'),
				workspace.createFileSystemWatcher('**/package.json')
			]
		},
		diagnosticCollectionName: 'puglint'
	};

	const serverOptions: ServerOptions = {
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

	const client = new LanguageClient('puglint', 'Puglint language server', serverOptions, clientOptions);

	// Go to the world
	context.subscriptions.push(
		new SettingMonitor(client, 'puglint.enable').start()
	);
}
