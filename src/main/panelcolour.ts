import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Rgb = readonly [number, number, number];

// What Breeze, the colour scheme Plasma falls back to, gives a panel's text.
const BREEZE_FOREGROUND: Rgb = [35, 38, 41];

export function isPlasma(env: NodeJS.ProcessEnv = process.env): boolean {
	return (env.XDG_CURRENT_DESKTOP ?? '').split(':').some(name => name.toUpperCase() === 'KDE');
}

// One key of one [group] of a KDE config file, as written; null when it is not there.
export function readKdeConfig(text: string, group: string, key: string): string | null {
	let inGroup = false;
	for ( const raw of text.split('\n') ) {
		const line = raw.trim();
		if ( line.startsWith('[') ) {
			inGroup = line === `[${group}]`;
			continue;
		}
		if ( !inGroup ) continue;
		const equals = line.indexOf('=');
		if ( equals > 0 && line.slice(0, equals).trim() === key ) return line.slice(equals + 1).trim();
	}
	return null;
}

function parseRgb(value: string | null): Rgb | null {
	const [red, green, blue] = value?.split(',').map(part => Number(part.trim())) ?? [];
	const channel = (part: number | undefined): part is number => part !== undefined && Number.isInteger(part) && part >= 0 && part <= 255;
	return channel(red) && channel(green) && channel(blue) ? [red, green, blue] : null;
}

export interface PlasmaPaths {
	configHome: string;
	dataDirs: string[];
}

export function plasmaPaths(env: NodeJS.ProcessEnv = process.env): PlasmaPaths {
	const home = homedir();
	return {
		configHome: env.XDG_CONFIG_HOME || join(home, '.config'),
		dataDirs: [env.XDG_DATA_HOME || join(home, '.local', 'share'), ...(env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean)]
	};
}

const readOrNull = (path: string): string | null => {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return null;
	}
};

// The colour Plasma draws the icons and text of its panel in. A Plasma theme that brings
// a colours file of its own (Breeze Dark and Breeze Light do) paints the panel with it,
// whatever the colour scheme; one that does not, like the default Breeze, follows the
// colour scheme in kdeglobals, and with none chosen that is Breeze's light one.
export function plasmaPanelForeground(paths: PlasmaPaths = plasmaPaths(), read: (path: string) => string | null = readOrNull): Rgb {
	const theme = readKdeConfig(read(join(paths.configHome, 'plasmarc')) ?? '', 'Theme', 'name') || 'default';
	for ( const dir of paths.dataDirs ) {
		const colours = read(join(dir, 'plasma', 'desktoptheme', theme, 'colors'));
		if ( colours !== null ) return parseRgb(readKdeConfig(colours, 'Colors:Window', 'ForegroundNormal')) ?? BREEZE_FOREGROUND;
		// the theme's own folder without a colours file: it follows the scheme
		if ( read(join(dir, 'plasma', 'desktoptheme', theme, 'metadata.json')) !== null ) break;
	}
	return parseRgb(readKdeConfig(read(join(paths.configHome, 'kdeglobals')) ?? '', 'Colors:Window', 'ForegroundNormal')) ?? BREEZE_FOREGROUND;
}

// Repaints the grey pixels of a premultiplied BGRA bitmap, the white mark, in a colour,
// keeping each one's coverage; coloured ones, like the unread dot, are left as they are.
export function tintGreys(bitmap: Buffer, [red, green, blue]: Rgb): Buffer {
	const out = Buffer.from(bitmap);
	for ( let i = 0; i + 3 < out.length; i += 4 ) {
		const alpha = out.readUInt8(i + 3);
		if ( alpha === 0 ) continue;
		const channels = [out.readUInt8(i), out.readUInt8(i + 1), out.readUInt8(i + 2)];
		if ( Math.max(...channels) - Math.min(...channels) > 8 ) continue;
		out[i] = Math.round(blue * alpha / 255);
		out[i + 1] = Math.round(green * alpha / 255);
		out[i + 2] = Math.round(red * alpha / 255);
	}
	return out;
}
