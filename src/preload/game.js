/* eslint-disable no-undef */
import { promises as fs } from 'fs';
import { ipcRenderer } from 'electron';
import { resolve } from 'path';

/**
 * Fires when the document is readyState `interactive` or `complete`
 * @returns Promise that resolves upon content loaded
 */
const contentLoaded = () => new Promise(promiseResolve => {
	if (document.readyState === 'interactive' || document.readyState === 'complete') promiseResolve();
	else document.addEventListener('DOMContentLoaded', () => promiseResolve());
});

/**
 * Fires when the `main()` function is done on TankTrouble.
 * @returns Promise that resolves upon content initialized
 */
const contentInitalized = () => new Promise(promiseResolve => {
	contentLoaded().then(() => {
		const contentInitHook = Content.init;
		Reflect.defineProperty(Content, 'init', {
			/**
			 * 
			 *
			 * @param args Arguments to pass on
			 */
			value: (...args) => {
				contentInitHook(...args);

				promiseResolve();
			}
		});
	});
});

class ServerInfoBox {

	wrapper = $('<div id="serverInfoBox"></div>').zIndex(1);

	serverInfoWrapper = $('<div></div>').svg({ settings: { width: 100, height: 18 } });

	serverInfo = $([
		this.serverInfoWrapper.svg('get').text(100, 4, 'Server', {
			fontFamily: 'Arial',
			fontWeight: 'bold',
			fontSize: 12,
			direction: 'rtl',
			style: 'dominant-baseline: text-before-edge;',
			fill: 'none',
			stroke: 'white',
			strokeLineJoin: 'round',
			strokeWidth: 3
		}),
		this.serverInfoWrapper.svg('get').text(100, 4, 'Server', {
			fontFamily: 'Arial',
			fontWeight: 'bold',
			fontSize: 12,
			direction: 'rtl',
			style: 'dominant-baseline: text-before-edge;',
			fill: 'black'
		})]);

	connectionStrengthImage = $(`<img width='24px' height='24px'
		src='/assets/images/game/pingTimeNoConnection.png'
		srcset='/assets/images/game/pingTimeNoConnection@2x.png 2x'/>`);


	/** * Add event listener, append and start server stats interval */
	init() {
		this.wrapper.on('mouseup', () => this.openSettingsBox());
		this.serverInfo.text(ClientManager.multiplayerServerId);

		this.wrapper.append(this.serverInfoWrapper, this.connectionStrengthImage);
		this.wrapper.insertBefore('#header');

		// Refresh the server list every minute.
		this.refreshServerStatsInterval = setInterval(() => this._refreshServerStats(), UIConstants.REFRESH_SERVER_STATS_INTERVAL);

		// Refresh it with a slight delay to get more accurate timings.
		setTimeout(() => this._refreshServerStats(), UIConstants.INITIAL_SERVER_STATS_DELAY);
	}

	/** Event handler to open settings box */
	openSettingsBox() {
		const position = this.wrapper.offset();
		TankTrouble.SettingsBox.show(position.left + (this.wrapper.width() * 0.5), position.top + (this.wrapper.height() * 0.5), 20);
	}

	/**
	 * Mark the current server as online and
	 * show online ping icon adjusted to latency
	 * @param serverId Server id to enable
	 * @param latency Server latency
	 */
	enableServer(serverId, latency) {
		const server = ClientManager.getAvailableServers()[serverId];
		this.serverInfo.text(`${server.name} - ${latency}ms`);

		if (latency < UIConstants.MAXIMUM_GOOD_LATENCY) {
			this.connectionStrengthImage.attr('src', '/assets/images/game/pingTimeGood.png');
			this.connectionStrengthImage.attr('srcset', '/assets/images/game/pingTimeGood@2x.png 2x');
		} else if (latency < UIConstants.MAXIMUM_AVERAGE_LATENCY) {
			this.connectionStrengthImage.attr('src', '/assets/images/game/pingTimeAverage.png');
			this.connectionStrengthImage.attr('srcset', '/assets/images/game/pingTimeAverage@2x.png 2x');
		} else {
			this.connectionStrengthImage.attr('src', '/assets/images/game/pingTimeBad.png');
			this.connectionStrengthImage.attr('srcset', '/assets/images/game/pingTimeBad@2x.png 2x');
		}
	}

	/**
	 * Mark the current server as offline and
	 * show "No Connection"-ping icon
	 * @param serverId Server id to disable
	 */
	disableServer(serverId) {
		const server = ClientManager.getAvailableServers()[serverId];
		this.serverInfo.text(`${server.name} - offline`);

		this.connectionStrengthImage.attr('src', '/assets/images/game/pingTimeNoConnection.png');
		this.connectionStrengthImage.attr('srcset', '/assets/images/game/pingTimeNoConnection@2x.png 2x');
	}

	/**
	 * Gets server stats of all servers one-by-one and callbacks for each.
	 * 
	 * Finds the current server and handles
	 */
	_refreshServerStats() {
		ClientManager.getAvailableServerStats((success, serverId, latency) => {
			if (serverId === ClientManager.multiplayerServerId) {
				if (success) this.enableServer(serverId, latency);
				else this.disableServer(serverId);
			}
		});
	}

}

/** Injects main styling to head on readyState complete */
const injectStyling = async() => {
	const [css] = await Promise.all([
		fs.readFile(resolve(__dirname, '../renderer/styles/main.css'), 'utf8'),
		contentLoaded()
	]);

	const injectElement = document.createElement('style');
	injectElement.innerHTML = css;
	document.head.appendChild(injectElement);
};

/**
 * Hides the Leave Game [X] button from 
 * UIGameState
 * 
 * Hides the login icon and local players
 * from the player panel
 */
const declutterUI = () => {
	// Hide the Leave Game button
	UIConstants.LEAVE_GAME_MARGIN = -50;

	// Remove own presence and login icon from player panel
	PlayerPanel.UIMainState.wrapFields({
		get showLoginIcon() { return this._get(); },
		set showLoginIcon(value) { return this._set(false); },

		get localPlayerIds() { return this._get(); },
		set localPlayerIds(value) { return this._set([]); },

		get localPlayerIdsToAdd() { return this._get(); },
		set localPlayerIdsToAdd(value) { return this._set([]); },

		get onlinePlayerIds() { return this._get(); },
		set onlinePlayerIds(value) {
			if (value instanceof Array) {
				return this._set(new Proxy(value, {
					set(target, index, playerId) {
						if (Users.getAllPlayerIds().includes(playerId)) return playerId;
						Reflect.set(target, index, playerId);
						return playerId;
					}
				}));
			}
			return this._set(value);
		}
	});
};

/** Load user from credentials provided by configuration */
const loadUser = () => {
	ipcRenderer.invoke('get-config').then(config => {
		if (!TankTrouble.LoginOverlay.initialized) TankTrouble.LoginOverlay._initialize();
		TankTrouble.LoginOverlay.loginUsernameOrEmailInput.val(config.name);
		TankTrouble.LoginOverlay.loginPasswordInput.val(config.pass);

		TankTrouble.LoginOverlay._sendLogin();

		for (const playerId of Inputs._unassignedPlayerIds) {
			Inputs.addInputManager(playerId, Inputs.getAvailableInputSetId());
			TankTrouble.ControlsOverlay._updateOptions();
		}
	});
};

/** Open chatbox by default, fix chat message rendering */
const initializeChatMods = () => {
	// Fix for chat messages not rendering
	// when order is reversed
	(hook => {
		TankTrouble.ChatBox._renderChatMessage = function(...args) {
			// animateHeight false
			args[9] = false;
			return hook(...args);
		};
	})(TankTrouble.ChatBox._renderChatMessage.bind(TankTrouble.ChatBox));

	TankTrouble.ChatBox.open();
};

(async function() {
	injectStyling();

	await contentLoaded();

	declutterUI();

	await contentInitalized();

	loadUser();
	initializeChatMods();

	const serverInfoBox = new ServerInfoBox();
	serverInfoBox.init();
}());
