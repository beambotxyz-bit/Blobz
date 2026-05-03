'use strict';
const Readline = require('readline');
const VERSION = '17.6.0';
// require('./cpu.js').init('./data')
const Multiverse = require('./core/Multiverse');
let multiverse = new Multiverse(VERSION);
//throw error
// Init variables
let showConsole = true;
process.stdout.write("\u001b[2J\u001b[0;0H");
// Handle arguments
process.argv.forEach(function (val) {
  if (val == "--noconsole") {
    showConsole = false;
  } else if (val.indexOf("--port=") === 0) {
    process.env.BLOBZ_WORLD_PORT = val.slice("--port=".length);
  } else if (val.indexOf("--world=") === 0) {
    process.env.BLOBZ_WORLD_SLUG = val.slice("--world=".length);
  } else if (val.indexOf("--region=") === 0) {
    process.env.BLOBZ_WORLD_REGION = val.slice("--region=".length);
  } else if (val == "--help") {
    console.log("Proper Usage: node index.js");
    console.log("    --noconsole         Disables the console");
    console.log("    --port=10000        Runs this world on a specific websocket port");
    console.log("    --world=eu-2        Sets the Blobz world slug used by the API");
    console.log("    --region=eu         Sets the Blobz world region used by the API");
    console.log("    --help              Help menu.");
    console.log("    --expose-gc         Enables garbage collection")
    console.log("");
  }
});
if (global.gc) {
    global.gc();
} else {
    console.log('[\x1b[34mINFO\x1b[0m] Garbage collection unavailable.  Pass --expose-gc '
      + 'when launching node to enable garbage collection.(memory leak)');
}

// There is no stopping an exit so clean up
// NO ASYNC CODE HERE - only use SYNC or it will not happen
process.on('exit', (code) => {
  console.log("[\x1b[34mINFO\x1b[0m] Blobz terminated with code: " + code);
  multiverse.stop();
});

// init/start the control server
multiverse.init();
setTimeout(function() {multiverse.start()},1500);

// Initialize the server console
if (showConsole) {
  let streamsInterface = Readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  setTimeout(multiverse.prompt(streamsInterface), 100);
}
