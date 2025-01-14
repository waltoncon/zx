import chalk from 'chalk';
import minimist from 'minimist';
import { wrap } from './util.js';

export const argv = minimist(process.argv.slice(2));

interface ArgumentConfig {
    name?: string;
    arg?: number;
    flag?: string;
    shortFlag?: string;
    type: 'string' | 'number' | 'boolean';
    default?: any;
    array?: boolean;
    alter?: (value: any) => any;
    required?: boolean;
    description?: string;
    helpHint?: string;
}

interface ArgumentsConfig {
    noHelp?: boolean;
    noExtra?: boolean;
    noVersion?: boolean;
    noVerbose?: boolean;
    helpText?: string;
    summary?: string;
    version?: string;
    usage?: string | string[];
    examples?: string | string[];
    help?: {
        showSeperator?: boolean
    }
}

interface Arguments {
    [key: string]: ArgumentConfig
}

function defineArgument(argConfig: ArgumentConfig) {
    const { name: iName, arg, flag, shortFlag, type: t = 'string', default: def, array, alter, required = false } = argConfig;
    const types = [t].flatMap(v => v.split(',')).flat();
    let value: any;

    if (arg !== undefined && flag !== undefined) {
        throw new Error('DEV: Cannot be arg and flag at the same time.');
    }

    const name = arg
        ? (iName || `Argument ${arg - 1}`)
        : (flag ? `--${flag}` : `-${shortFlag}`);

    if (arg !== undefined) {
        if (array === true) {
            value = argv._.slice(arg);
        } else if (typeof array === 'number') {
            value = argv._.slice(arg, arg + array);
        } else if (required) {
            value = argv._[arg] ?? def;
        } else {
            value = argv._[arg] ?? def ?? '';
        }
    } else {
        const camel = flag?.replaceAll(/-(\w)/g, ([, value]) => value.toUpperCase());
        const lower = flag?.replaceAll('-', '').toLowerCase();

        if (flag) {
            value = argv[flag];
        } else if (camel) {
            value = argv[camel];
        } else if (lower) {
            value = argv[lower];
        } else if (shortFlag) {
            value = argv[shortFlag];
        } else {
            value = def
        }
    }

    if (value === undefined && required) return [undefined, `${name} is required`];
    if (value === undefined && array) return [[]];
    if (value === undefined && types.includes('boolean')) return [false];

    if (array) {
        value = [value].flat().map(v => v.toString().split(',')).flat();
    }

    const invalidType = types.map((type) => {
        if (!array && typeof value !== type) return true;
        if (array && value.some((v: string) => typeof v !== type)) return true;
        return false;
    }).every(value => value === true);

    if (invalidType) {
        const formatter = new Intl.ListFormat('en', { style: 'long', type: 'disjunction' });
        const validTypes = formatter.format(types);
        return [undefined, `${name} is expected to be of type ${validTypes}`];
    }

    if (alter) {
        value = alter(value);
    }

    return [value];
}

function buildHelpOptions(config: ArgumentsConfig, entries: Array<[string, ArgumentConfig]>) {
    const { showSeperator = true } = config?.help ?? {};
    const p = '    ';

    const flags: Array<[string, ArgumentConfig & {
        helpShortFlag: string
        helpLongFlag: string
    }]> = entries
        .filter(([, flag]) => flag.flag || flag.shortFlag)
        .map(([key, flag]) => {
            let valueHint = flag.type === 'boolean' ? '' : `=${flag.helpHint ? flag.helpHint : ''}`;
            if (flag.type.includes('boolean') && valueHint) valueHint = `[${valueHint}]`;
            const comma = flag.flag ? ', ' : '';

            return [key, {
                helpShortFlag: flag.shortFlag ? `-${flag.shortFlag}${comma}` : `${p}`,
                helpLongFlag: flag.flag ? `--${flag.flag}${valueHint}` : '',
                ...flag,
            }];
        });

    const lengths = flags.map(([, { helpShortFlag, helpLongFlag }]) => helpShortFlag.length + helpLongFlag.length);
    const padLength = Math.max(...lengths) + 2;

    const lines = flags.map(([, flag]) => {
        let description = flag.description ?? '';
        if (flag.default !== undefined) {
            const defStr = JSON.stringify([flag.default].flat().join(','));
            description += ` Default: ${defStr}`;
        }
        const descLines = wrap(description.trim(), 60).split('\n');
        return descLines.map((descLine, index) => {
            if (index > 0) {
                return `${p}${''.padEnd(padLength)}  ${descLine}`;
            } else {
                const str = `${flag.helpShortFlag}${flag.helpLongFlag}`;
                const sep = descLine && showSeperator ? chalk.strikethrough(''.padEnd(padLength - str.length, ' ')) : ''.padEnd(padLength - str.length, ' ');
                return `${p}${str} ${sep} ${descLine}`;
            }
        });
    }).flat();
    return ['', chalk.bold('Options:'), ...lines];
}

function buildHelpUsage(config: ArgumentsConfig) {
    if (!config.usage) return
    const p = '    ';
    const lines = [config.usage].flat().map(line => `${p}${line}`);
    if (lines.length === 0) return [];
    return ['', chalk.bold('Usage:'), ...lines];
}

function buildHelpExamples(config: ArgumentsConfig) {
    if (!config.examples) return
    const p = '    ';
    const lines = [config.examples].flat().map(line => `${p}${line}`);
    if (lines.length === 0) return [];
    return ['', chalk.bold('Examples:'), ...lines];
}

function defineArguments(args: Arguments, config: ArgumentsConfig = {}) {
    const extraArgs: Arguments = {};

    if (!config.noHelp && !config.noExtra) {
        extraArgs.help = {
            flag: 'help',
            shortFlag: 'h',
            type: 'boolean',
            description: 'Print this help text and exit.',
        };
    }
    if (!config.noVersion && !config.noExtra) {
        extraArgs.version = {
            flag: 'version',
            shortFlag: 'v',
            type: 'boolean',
            description: 'Print the version of this command and exit.',
        };
    }
    if (!config.noVerbose && !config.noExtra) {
        extraArgs.verbose = {
            flag: 'verbose',
            shortFlag: 'V',
            type: 'boolean',
            description: 'Show more verbose output.',
        };
    }

    const internalArgs = { ...extraArgs, ...args };
    const entries = Object.entries(internalArgs);
    const argEntries = entries
        .map(([key, flagOptions]) => {
            if (flagOptions.flag?.includes('|')) {
                const [s, l, h] = flagOptions.flag.split('|');
                flagOptions.shortFlag = s;
                flagOptions.flag = l;
                flagOptions.helpHint ??= h;
            }
            if (flagOptions.arg !== undefined && !flagOptions.name) {
                flagOptions.name = key;
            }
            if (flagOptions.type === undefined) {
                flagOptions.type = 'string';
            }
            if (Array.isArray(flagOptions.default)) {
                flagOptions.array = true;
            }
            return [key, defineArgument(flagOptions)];
        });
    const b = argEntries.map((entry) => {
        return [entry[0], entry[1][0]];
    });
    const obj = Object.fromEntries(b);

    if (obj.help && !config.noHelp) {
        if (config.helpText) {
            console.log(config.helpText?.trim() ?? '');
        } else {
            const helpText = [
                config.summary,
                config.version && `Version ${config.version}`,
                buildHelpUsage(config),
                buildHelpOptions(config, entries),
                buildHelpExamples(config),
            ]
                .flat()
                .filter((line) => line !== undefined)
                .join('\n');
            console.log(helpText);
        }

        process.exit(0);
    }

    if (obj.version && !config.noVersion) {
        console.log(config.version?.trim() ?? '');
        process.exit(0);
    }

    const errors = argEntries
        .filter(entry => entry[1][1])
        .map(([, [, msg]]) => msg);

    if (errors.length) {
        for (const error of errors) {
            console.log(chalk.red(`! ${error}`));
        }
        process.exit(1);
    }

    return { _: argv._, ...obj };
}

export { defineArguments };