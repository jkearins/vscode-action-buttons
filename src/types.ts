export interface CommandOpts {
	cwd?: string;
	command: string;
	singleInstance?: boolean;
	name: string;
	tooltip: string;
	color: string;
	focus?: boolean;
	useVsCodeApi?: boolean;
	args?: string[];
	ignoreCwd?: boolean;
	ignoreClear?: boolean;
	extraCommands?: string[];
	terminalName: string;
	timeoutAfterCreate: number;
}

export interface ButtonOpts {
	command: string;
	tooltip: string;
	name: string;
	color: string;
}

export interface Vars {
    [key: `${string}`]: string;
}
