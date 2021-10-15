const Server = require('./src/server');
const bole = require('bole');

bole.output({ level: 'debug', stream: process.stdout });

const server = new Server({ port: 43594 });
server.start();
