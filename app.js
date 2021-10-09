const bole = require('bole');
const { WebSocketServer } = require('ws');

const log = bole('app');

bole.output({
    level: 'debug',
    stream: process.stdout
});

// { username: { studio, x, y } }
const users = {};

const studios = {
    studio_a: []
};

const sockets = {
    studio_a: []
};

const server = new WebSocketServer({ port: 43594 });

server.on('connection', (socket) => {
    log.info('client connected');

    socket.on('message', (data) => {
        data = data.toString();

        try {
            data = JSON.parse(data);
        } catch (e) {
            log.error('malformed data', data);
            return;
        }

        if (data.type === 'login') {
            studios['studio_a'].push({
                username: data.username,
                x: 2,
                y: 2
            });

            socket.index = studios['studio_a'].length - 1;

            for (const subsocket of sockets['studio_a']) {
                subsocket.send(JSON.stringify({ type: 'add-character', x: 2, y: 2 }));
            }

            sockets['studio_a'].push(socket);

            socket.send(
                JSON.stringify({
                    type: 'login-response',
                    success: true,
                    studio: {
                        name: 'studio_a',
                        characters: studios['studio_a']
                    }
                })
            );
        } else if (data.type === 'walk') {
            for (const subsocket of sockets['studio_a']) {
                if (socket.index !== subsocket.index) {
                    subsocket.send(JSON.stringify({
                        type: 'move-character',
                        x: data.x,
                        y: data.y,
                        index: subsocket.index
                    }));
                }
            }
        }
    });
});
