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

const port = Number.parseInt(args[0]); // Get the port
const script = args[1]; // Get the script path to run

if (Number.isNaN(port) || port < 1000 || port > 75565) {
    logError('Invalid port');
    process.exit(1);
} else if (!script) {
    logError('No script specified');
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
    child = spawn(script);

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

// Start pinging MC servers on that port
setInterval(async () => {
    if (!running || !child) { // Make sure the server is running
        return;
    }

    // Try to ping the server
    try {
        await gamedig.query({
            type: 'minecraft',
            host: 'localhost',
            port: port
        });

        // Reset counter after a successful attempt
        logMsg('Pinged server!');
        failed = 0;
    } catch (e) {
        // We failed, yikes
        if (failed >= 9) { // Restart server after 8 attempts
            logError('Force restarting server');
            failed = 0;

            child.kill('SIGKILL'); // Kill the process, we hung
        } else {
            // Just increment the failed counter
            failed++;
            logError('Failed to ping server! (' + failed + '/8)');
        }
    }

}, 2 * 1000); // Every 20 secs
