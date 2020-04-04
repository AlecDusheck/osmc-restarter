const chalk = require('chalk');
const clear = require('clear');
const spawn = require('child_process').spawn;
const gamedig = require('gamedig');

// Logging functions
const logError = (str) => console.log(chalk.red(`Watchdog: ${str}`));
const logMsg = (str) => console.log(chalk.blue(`Watchdog: ${str}`));
const logChild = (str) => console.log(chalk.yellow(`Child (PID: ${child.pid}): ${str}`));

clear(); // Clear the screen

const args = require('minimist')(process.argv.slice(2));

const SCRIPT = args._.join(' '); // Join just in case some weird stuff happens
const PORT = args.port || 25565;
const RETRIES = args.retries || 8;
const PING_TIME = args.pingTime || 20;

logMsg(`Start Configuration:
Script: ${SCRIPT}
Port: ${PORT}
Retries: ${RETRIES}
Ping Time: ${PING_TIME}
`);

let child; // The child process
let running = false;
let failed = 0;

// Spawn the main child process
const spawnProcess = async () => {
    // If the child is running, kill it and wait 5 seconds
    if (child) {
        if (child.exitCode === null) {
            logMsg('Previous unstopped child process detected (how?)... sending SIGKILL');
            try {
                process.kill(-child.pid, 'SIGKILL');
            } catch (e) {
                logMsg('It appears the process is dead, skipping');
            }

            await new Promise(resolve => {
                setTimeout(() => resolve(), 5000);
            });
        }

        // Remove previous listeners
        child.removeAllListeners();
        child = undefined;
    }

    // Create child
    const spawnOpts = { 'detached' : true // Allows killing of all of child's descendants.
        // http://azimi.me/2014/12/31/kill-child_process-node-js.html
        // https://github.com/nodejs/node-v0.x-archive/issues/1811
    };

    child = spawn(SCRIPT, [SCRIPT], spawnOpts);

    child.on('error', err => {
        logError(err);
        process.exit(1);
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
        // logChild(data);

        if (!running) {
            running = true;
        }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', data => logError(data));

    child.on('exit', async () => {
        running = false;
        logError('Process ended unexpectedly. Rebooting server!');
        await new Promise(resolve => {
            setTimeout(() => resolve(), 5000);
        });

        // Respawn the process. It ended
        spawnProcess();
    });
};

// Bootstrap the process
spawnProcess();

// Start pinging MC servers on that PORT
setInterval(async () => {
    if (!running || !child) { // Make sure the server is running
        return;
    }

    // Try to ping the server
    try {
        await gamedig.query({
            type: 'minecraft',
            host: 'localhost',
            port: PORT
        });

        // Reset counter after a successful attempt
        logMsg('Pinged server!');
        failed = 0;
    } catch (e) {
        if (!running || !child) { // Make sure the server is running, again!
            return;
        }

        // We failed, yikes
        if (failed >= RETRIES) { // Restart server after 8 attempts
            logError('Force restarting server');
            failed = 0;

            process.kill(-child.pid, 'SIGKILL'); // Kill the process, we hung
        } else {
            // Just increment the failed counter
            failed++;
            logError(`Failed to ping server! (${failed}/${RETRIES})`);
        }
    }

}, PING_TIME * 1000);
