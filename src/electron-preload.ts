import { ApplicationType } from './app';
import { app } from 'electron';
import { join } from 'path';

if (!app.isPackaged) {
	app.setName('replay-bot');
	app.setPath('userData', join(app.getPath('appData'), 'replay-bot'));
}

app.commandLine.appendSwitch('ignore-certificate-errors');

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	(async() => {
		// Spawn the appropriate window if the client
		// was launched through a desktop action on Linux
		const Application = await ((await import('./app')).default as ApplicationType);
		app.whenReady().then(() => Application.launch());
	})();
}
