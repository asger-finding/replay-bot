import * as yargs from 'yargs';
import { BrowserWindow, Session, app, globalShortcut, ipcMain, session } from 'electron';
import { ElectronBlocker, fullLists as ghosteryFullList } from '@cliqz/adblocker-electron';
import { error } from '@logger';
import fetch from 'electron-fetch';
import { promises as fs } from 'fs';
import { resolve } from 'path';

const argv = yargs
	.options('name', {
		alias: 'n',
		description: 'Login username',
		type: 'array',
		string: true,
		default: [] as string[]
	})
	.options('pass', {
		alias: 'p',
		description: 'Login password',
		type: 'array',
		string: true,
		default: [] as string[]
	})
	.options('server', {
		alias: 's',
		description: 'Server to connect to',
		type: 'array',
		string: true,
		default: ['eu-west1-mp1']
	})
	.options('dpi', {
		alias: 'ppi',
		description: 'DPI scaling factor',
		type: 'number',
		default: 1
	})
	.parseSync(process.argv);

const sessions = new WeakMap<Session, string>();

export default class Application {

	/** Preload app configurations that can be set before app.ready */
	constructor() {
		app.on('quit', () => app.quit());
		app.on('window-all-closed', () => {
			if (process.platform !== 'darwin') app.quit();

			return null;
		});
	}

	/**
	 * Initialize the app after app.ready.
	 */
	// eslint-disable-next-line complexity
	public static async launch(): Promise<void> {
		if (!app.isReady()) throw new Error('App must be ready before Application.launch()');
		if (argv.name.length !== argv.pass.length) throw new Error('Expected equal amount of names and passwords');
		Application.evaluateArguments();
		Application.setupIpcBridges();

		for (let i = 0; i < argv.name.length; i++) {
			const partition = `persist:${argv.name[i]}`;
			const browserWindow = new BrowserWindow({
				width: Math.ceil(1280 * (1 / (argv.dpi ?? 1))),
				height: Math.ceil(720 * (1 / (argv.dpi ?? 1))),

				// fullscreenable: false,
				// maximizable: false,
				// resizable: false,
				show: true,
				webPreferences: {
					preload: resolve(__dirname, './preload/game.js'),
					contextIsolation: false,
					sandbox: false,
					nodeIntegrationInSubFrames: false,
					backgroundThrottling: false,
					partition
				}
			});
			const ses = session.fromPartition(partition, { cache: true });
			sessions.set(ses, partition);

			Application.setSessionCookies(ses, i);
			Application.enableFilterlistsInSession(ses);

			globalShortcut.register('Alt+M', () => {
				browserWindow.setMenuBarVisibility(!browserWindow.isMenuBarVisible());
			});
			browserWindow.setMenuBarVisibility(false);

			browserWindow.loadURL('https://tanktrouble.com/game');
		}
	}

	/**
	 * Evaluate arguments passed to electron
	 */
	public static evaluateArguments() {
		// FIXME: Evaluate for missing configuration
		let errorMessage = '';
		for (const arg of process.argv.slice(2)) {
			const [key, value] = arg.split('=');
			switch (key) {
				case '--server':
					errorMessage += !/^[a-z]+-(?:north|south|east|west|central)[0-9]-mp[0-9]$/u.test(value)
						? 'Passed --server argument does not match server id convention\n'
						: '';
					break;
				default:
					break;
			}

			if (errorMessage.length) {
				error(errorMessage);
				process.exit(1);
			}
		}
	}

	/**
	 * Setup bridge for ipcRenderer to get its username+password+server configuration
	 */
	private static setupIpcBridges(): void {
		ipcMain.handle('get-config', async evt => {
			const { name, pass, server } = argv;

			const ses = evt.sender.session;
			const partition = sessions.get(ses);
			if (!partition) throw new Error('Session not registered in sessions WeakMap');

			const [, playerName] = partition.split(':');
			const index = argv.name.indexOf(playerName);
			const config: Record<string, string | number> = {};

			for (const [key, value] of Object.entries({ name, pass, server })) {
				if (typeof value === 'undefined') continue;

				const matchOrLast = Math.min(index, value.length);
				config[key] = value[matchOrLast];
			}

			return config;
		});
	}

	/**
	 * Enable ad- and tracker blocking in window session
	 * @param ses Session instance
	 */
	private static enableFilterlistsInSession(ses: Session): void {
		ElectronBlocker.fromLists(fetch, ghosteryFullList, { enableCompression: true }, {
			path: `${ app.getPath('userData') }/electronblocker-cache.bin`,
			read: fs.readFile,
			write: fs.writeFile
		}).then(blocker => blocker.enableBlockingInSession(ses));
	}

	/**
	 * Preload session cookies in window session
	 * @param ses Session instance
	 * @param sessionIndex Session instance index (to handle multiple instances)
	 */
	private static async setSessionCookies(ses: Session, sessionIndex: number): Promise<void> {
		const cookies = [
			{
				url: 'https://tanktrouble.com',
				name: 'multiplayerserverid',
				value: argv.server[sessionIndex]
			},
			{
				url: 'https://tanktrouble.com',
				name: 'sound',
				value: 'medium'
			},
			{
				url: 'https://tanktrouble.com',
				name: 'quality',
				value: 'high'
			},
			{
				url: 'https://tanktrouble.com',
				name: 'consent',
				value: 'dismiss'
			}
		];
		for (const cookie of cookies) ses.cookies.set(cookie);
	}

}

export type ApplicationType = typeof Application;
