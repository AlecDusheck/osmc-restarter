const chalk = require('chalk');
const clear = require('clear');
const spawn = require('child_process').spawn;
const gamedig = require('gamedig');

const logError = (str) => console.log(chalk.red(`(!) ${ str }`));
const logMsg = (str) => console.log(chalk.blue(`(*) ${ str }`));

clear();
const args = process.argv.slice(2);

const port = Number.parseInt(args[0]);
const script = args[1];

if (Number.isNaN(port) || port < 1000 || port > 55565) {
    logError('Invalid port');
    process.exit(1);
} else if (!script) {
    logError('No script specified');
    process.exit(1);
}

let child;
let running = false;
let failed = 0;

const spawnProcess = async () => {
    // If the child is running, kill it and wait 5 seconds
    if (child) {
        child.kill('SIGKILL');

        await new Promise(resolve => {
            setTimeout(() => resolve(), 5000);
        });
        child = undefined;
    }

    child = spawn(script);

    child.on('error', err => {
        logError(err);
        process.exit(1);
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
        logMsg(data);

        if (!running) {
            running = true;
        }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', data => logError(data));

    child.on('close', () => {
        // logError('Unexpected process termination. Rebooting server!');
        // spawnProcess();
    });
};

spawnProcess();

setInterval(async () => {
    if (!running) {
        return;
    }

    try {
        await gamedig.query({
            type: 'minecraft',
            host: 'oneshotmc.com',
            port: port
        });

        logMsg('Pinged server!');
        failed = 0;
    } catch (e) {
        if (failed >= 8) {
            logError('Force restarting server');
            failed = 0;
            await spawnProcess();
        } else {
            failed++;
            logError('Failed to ping server! (' + failed + '/8)');
        }
    }

}, 20000);
