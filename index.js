const chalk = require('chalk');
const clear = require('clear');
const spawn = require('child_process').spawn;
const gamedig = require('gamedig');

// Logging functions
const logError = (str) => console.log(chalk.red(`Watchdog: (!) ${str}`));
const logMsg = (str) => console.log(chalk.blue(`Watchdog: (*) ${str}`));
const logChild = (str) => console.log(chalk.yellow(`Child (PID: ${child.pid}): ${str}`));

clear(); // Clear the screen
const args = process.argv.slice(2);

const PORT = Number.parseInt(args[0]); // Get the PORT
const SCRIPT = args[1]; // Get the SCRIPT path to run
const RETRIES = Number.parseInt(args[2]) || 8;
const PING_TIME = Number.parseInt(args[3]) || 20;

if (Number.isNaN(PORT) || PORT < 1000 || PORT > 75565) {
    logError('Invalid PORT');
    process.exit(1);
} else if (!SCRIPT) {
    logError('No SCRIPT specified');
    process.exit(1);
} else if (Number.isNaN(RETRIES)) {
    logError('Invalid RETRIES');
    process.exit(1);
} else if (Number.isNaN(PING_TIME)) {
    logError('Invalid PING_TIME');
    process.exit(1);
}

let child; // The child process
let running = false;
let failed = 0;

// Spawn the main child process
const spawnProcess = async () => {
    // If the child is running, kill it and wait 5 seconds
    if (child) {
        if (child.exitCode === null) {
            logMsg('Previous unstopped child process detected (how?)... sending SIGKILL');
            child.kill('SIGKILL');

            await new Promise(resolve => {
                setTimeout(() => resolve(), 5000);
            });
        }

        // Remove previous listeners
        child.removeAllListeners();
        child = undefined;
    }

    // Create child
    child = spawn(SCRIPT);

    child.on('error', err => {
        logError(err);
        process.exit(1);
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
        logChild(data);

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

            child.kill('SIGKILL'); // Kill the process, we hung
        } else {
            // Just increment the failed counter
            failed++;
            logError(`Failed to ping server! (${failed}/${RETRIES})`);
        }
    }

}, PING_TIME * 1000);
