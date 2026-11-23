import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { Menu, Tray, nativeImage, type NativeImage } from 'electron';
import { mainMessages } from './messages.ts';
import { isPlasma, plasmaPanelForeground, plasmaPaths, tintGreys } from './panelcolour.ts';

export interface TrayActions {
	isWindowShown(): boolean;
	toggleWindow(): void;
	isDontDisturb(): boolean;
	toggleDontDisturb(): void;
	quit(): void;
}

// On Linux the monochrome masters from resources/logo, drawn the way a panel's own icons are.
// Windows' notification area expects the full-colour mark instead, and sits on a taskbar that is
// light as often as dark, where a white one would not be there at all. A Mac's menu bar takes the
// monochrome mark as a template, which it paints in its own colour, at the size its own icons are.
const MAC = process.platform === 'darwin';
const STYLE = process.platform === 'win32' ? 'Colour' : MAC ? 'Mac' : '';
// Plasma's panel is as often light as dark, and draws its own icons in its text colour,
// so there the white mark is repainted in that colour, and again when the theme changes.
const PLASMA = process.platform === 'linux' && isPlasma();
const PLASMA_CONFIGS = ['plasmarc', 'kdeglobals'];

function inPanelColour(image: NativeImage): NativeImage {
	const colour = plasmaPanelForeground();
	const { width, height } = image.getSize();
	const tinted = nativeImage.createEmpty();
	for ( const scaleFactor of image.getScaleFactors() ) {
		tinted.addRepresentation({
			scaleFactor,
			width: Math.round(width * scaleFactor),
			height: Math.round(height * scaleFactor),
			buffer: tintGreys(image.toBitmap({ scaleFactor }), colour)
		});
	}
	return tinted;
}

const icon = (unread: boolean) => {
	const image = nativeImage.createFromPath(join(__dirname, '../../resources', `IconTray${STYLE}${unread ? 'Unread' : ''}.png`));
	image.setTemplateImage(MAC);
	return PLASMA ? inPanelColour(image) : image;
};

export class TrayIcon {
	private tray: Tray | null = null;
	private unread = false;
	private themeWatcher: FSWatcher | null = null;
	private themeTimer: NodeJS.Timeout | null = null;

	constructor(private readonly actions: TrayActions) {}

	show(on: boolean): void {
		if ( on && !this.tray ) {
			this.tray = new Tray(icon(this.unread));
			this.tray.setToolTip('Tesselium');
			this.tray.on('click', () => this.actions.toggleWindow());
			this.refreshMenu();
			this.followPanelTheme();
		}
		if ( !on && this.tray ) {
			this.themeWatcher?.close();
			this.themeWatcher = null;
			if ( this.themeTimer ) clearTimeout(this.themeTimer);
			this.tray.destroy();
			this.tray = null;
		}
	}

	// KDE rewrites its config files by renaming a new one over them, so the folder is watched, not the files
	private followPanelTheme(): void {
		if ( !PLASMA ) return;
		try {
			this.themeWatcher = watch(plasmaPaths().configHome, (_event, file) => {
				if ( !file || !PLASMA_CONFIGS.includes(file.toString()) ) return;
				if ( this.themeTimer ) clearTimeout(this.themeTimer);
				this.themeTimer = setTimeout(() => this.tray?.setImage(icon(this.unread)), 250);
			});
			this.themeWatcher.on('error', () => {});
		} catch {
			// no config folder to watch: the icon keeps the colour it started with
		}
	}

	isShown(): boolean {
		return this.tray !== null;
	}

	setUnread(unread: boolean): void {
		if ( unread === this.unread ) return;
		this.unread = unread;
		this.tray?.setImage(icon(unread));
	}

	refreshMenu(): void {
		const messages = mainMessages();
		this.tray?.setContextMenu(Menu.buildFromTemplate([
			{ label: this.actions.isWindowShown() ? messages['tray.hide'] : messages['tray.show'], click: () => { this.actions.toggleWindow(); this.refreshMenu(); } },
			{ label: messages['tray.dontDisturb'], type: 'checkbox', checked: this.actions.isDontDisturb(), click: () => this.actions.toggleDontDisturb() },
			{ type: 'separator' },
			{ label: messages['tray.quit'], click: () => this.actions.quit() }
		]));
	}
}
