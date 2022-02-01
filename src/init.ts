import { buildConfigFromPackageJson } from './packageJson';
import * as vscode from 'vscode';
import { ButtonOpts, CommandOpts, Vars } from './types';
import * as path from 'path';

const registerCommand = vscode.commands.registerCommand;

const disposables: vscode.Disposable[] = [];

const init = async (context: vscode.ExtensionContext) => {
	disposables.forEach(btn => btn.dispose());
	const config = vscode.workspace.getConfiguration('actionButtons');
	const defaultColor = config.get<string>('defaultColor') || 'white';
	const reloadButton = config.get<string>('reloadButton');
	const loadNpmCommands = config.get<boolean>('loadNpmCommands') !== false;
	const cmds = config.get<CommandOpts[]>('commands');
	const customVars = config.get<Vars[]>('customVars') || {};
	const commands: CommandOpts[] = [];

	if (reloadButton !== null) {
		loadButton({
			command: 'extension.refreshButtons',
			name: reloadButton || '↻',
			tooltip: 'Refreshes the action buttons',
			color: defaultColor
		});
	}
	else {
		const onCfgChange:vscode.Disposable = vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('actionButtons')) {
				vscode.commands.executeCommand('extension.refreshButtons');
			}
		});
		context.subscriptions.push(onCfgChange);
		disposables.push(onCfgChange);
	}

	if (cmds && cmds.length) {
		commands.push(...cmds);
	}

	if (loadNpmCommands !== false) {
		commands.push(...(await buildConfigFromPackageJson(defaultColor)));
	}
	if (commands.length) {
		const terminals: { [name: string]: vscode.Terminal } = {};
		commands.forEach(
			({ cwd, command, name, tooltip, color, singleInstance, focus, useVsCodeApi, args, ignoreCwd, ignoreClear, extraCommands, terminalName }: CommandOpts) => {
				const vsCommand = `extension.${name.replace(' ', '')}`;

				const disposable = registerCommand(vsCommand, async () => {
					//const vars = {
					const vars: Vars = {

						// - the path of the folder opened in VS Code
						workspaceFolder: vscode.workspace.rootPath || '',

						// - the name of the folder opened in VS Code without any slashes (/)
						workspaceFolderBasename: (vscode.workspace.rootPath)? path.basename(vscode.workspace.rootPath) : '', // : null,

						// - the current opened file
						file: (vscode.window.activeTextEditor) ? vscode.window.activeTextEditor.document.fileName : '', // : null,

						// - the current opened file relative to workspaceFolder
						relativeFile: (vscode.window.activeTextEditor && vscode.workspace.rootPath) ? path.relative(
							vscode.workspace.rootPath,
							vscode.window.activeTextEditor.document.fileName
						) : '', // : null,

						// - the current opened file's basename
						fileBasename: (vscode.window.activeTextEditor) ? path.basename(vscode.window.activeTextEditor.document.fileName) : '', // : null,

						// - the current opened file's basename with no file extension
						fileBasenameNoExtension: (vscode.window.activeTextEditor) ? path.parse(path.basename(vscode.window.activeTextEditor.document.fileName)).name : '', // : null,

						// - the current opened file's dirname
						fileDirname: (vscode.window.activeTextEditor) ? path.dirname(vscode.window.activeTextEditor.document.fileName) : '', // : null,

						// - the current opened file's extension
						fileExtname: (vscode.window.activeTextEditor) ? path.parse(path.basename(vscode.window.activeTextEditor.document.fileName)).ext : '', // : null,

						// - the task runner's current working directory on startup
						cwd: cwd || vscode.workspace.rootPath || require('os').homedir() || '', //,

						//- the current selected line number in the active file
						lineNumber: (vscode.window.activeTextEditor) ? String(vscode.window.activeTextEditor.selection.active.line + 1) : '0', //: null,

						// - the current selected text in the active file
						selectedText: (vscode.window.activeTextEditor) ? vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection) : '', // : null,

						// - the path to the running VS Code executable
						execPath: process.execPath
					};

					if (!command) {
						vscode.window.showErrorMessage('No command to execute for this action');
						return;
					}

					if (useVsCodeApi) {
						vscode.commands.executeCommand(command, ...(args || []));
					} else {
						// find terminal or create new one
						let doClear = true;
						let assocTerminal;
						if (terminalName) {
							// extended features
							assocTerminal = vscode.window.terminals.find(x => x.name === terminalName);
							if (!assocTerminal) {
								assocTerminal = vscode.window.createTerminal(ignoreCwd ? {name: terminalName} : {name: terminalName, cwd: vars.cwd });
							}
						} else {
							// basic features
							assocTerminal = terminals[vsCommand];
							if (!assocTerminal) {
								assocTerminal = vscode.window.createTerminal(ignoreCwd ? {name} : {name, cwd: vars.cwd });
								terminals[vsCommand] = assocTerminal;
							} else {
								if (singleInstance) {
									delete terminals[vsCommand];
									assocTerminal.dispose();
									assocTerminal = vscode.window.createTerminal({ name, cwd: vars.cwd });
									terminals[vsCommand] = assocTerminal;
									doClear = false;
								} else {
									doClear = true;
								}
							}
						}
						if (assocTerminal) {
							if (doClear && !ignoreClear) {
								assocTerminal.sendText('clear');
							}
							assocTerminal.show(!focus);
							assocTerminal.sendText(interpolateString(command, vars, customVars));
							if (extraCommands) {
								let curTerminal = assocTerminal;
								extraCommands.forEach(cmd => {
									curTerminal.sendText(interpolateString(cmd, vars, customVars));
								});
							}
						} else {
							console.error("Failed to find/create terminal");
						}
					}
				});

				context.subscriptions.push(disposable);

				disposables.push(disposable);

				loadButton({
					command: vsCommand,
					name,
					tooltip: tooltip || command,
					color: color || defaultColor,
				});
			}
		);
	} else {
		vscode.window.setStatusBarMessage(
			'VSCode Action Buttons: There are no commands to run.',
			4000
		);
	}
};

function loadButton({
	command,
	name,
	tooltip,
	color,
}: ButtonOpts) {
	const runButton = vscode.window.createStatusBarItem(1, 0);
	runButton.text = name;
	runButton.color = color;
	runButton.tooltip = tooltip;

	runButton.command = command;
	runButton.show();
	disposables.push(runButton);
}

function interpolateString(tpl: string, vars: Vars, customVars: Vars): string {

	let re = /\$\{([^\}]+)\}/g, match;
	let result = tpl;
	while (match = re.exec(tpl)) {
		let path = match[1].split('.').reverse();
		if (path.length) {
			let arg = path.pop() || '';
			if (arg.length) {
				let value = vars[arg] || '';
				if (!value.length) {
					value = customVars[arg] || ''; // vars have precedence over customVars
				}
				result = result.replace(match[0], value);
			}
		}
	}
	return result;
}

export default init;
