const Database = require('better-sqlite3');
const QueryHandler = require('./query-handler');
const Room = require('./entities/room');
const log = require('bole')('server');
const messageHandlers = require('./packet-handlers');
const { WebSocketServer } = require('ws');

class Server {
    constructor({ port, databaseFile, hashRounds, trustProxy }) {
        this.port = port || 43594;
        this.hashRounds = hashRounds || 10;
        this.trustProxy = !!trustProxy;

        this.server = new WebSocketServer({ port: this.port });

        this.database = new Database(databaseFile || './coke-music.sqlite', {
            verbose: log.debug
        });

        this.queryHandler = new QueryHandler(this.database);

        // characters currently connected
        // { characterID: Character }
        this.characters = new Map();

        // all of the rooms from the database
        // { roomID: Room }
        this.rooms = new Map();

        // { messageType: async (server, socket, message) => {} }
        this.messageHandlers = new Map();

        this.loadMessageHandlers();
    }

    loadMessageHandlers() {
        for (const file of Object.values(messageHandlers)) {
            for (const [name, handler] of Object.entries(file)) {
                this.messageHandlers.set(name, handler);
            }
        }
    }

    loadRooms() {
        const rooms = this.queryHandler.getRooms();

        for (const roomData of rooms) {
            roomData.ownerID = roomData.ownerId;
            delete roomData.ownerId;

            const room = new Room(this, roomData);
            this.rooms.set(room.id, room);
        }
    }

    async handleMessage(socket, message) {
        try {
            if (
                message.type !== 'login' &&
                message.type !== 'register' &&
                !socket.character
            ) {
                log.error('no character for socket');
                return;
            }

            const handler = this.messageHandlers.get(message.type);

            if (!handler) {
                log.error(`no handler for message ${message.type}`);
                return;
            }

            await handler(this, socket, message);
        } catch (e) {
            log.error(e);
        }
    }

    start() {
        this.loadRooms();

        log.info(`listening for websocket connections on port ${this.port}`);

        this.server.on('connection', (socket, req) => {
            // running behind reverse-proxy with nginx
            if (this.trustProxy) {
                socket.ip = req.headers['x-forwarded-for'].split(',')[0].trim();
            } else {
                socket.ip = req.socket.remoteAddress;
            }

            log.info(`client connected from ${socket.ip}`);

            socket.on('message', (message) => {
                try {
                    message = JSON.parse(message);
                } catch (e) {
                    log.error('malformed message', message);
                    return;
                }

                this.handleMessage(socket, message);
            });

            socket.on('close', () => {
                log.info(`client disconnected from ${socket.ip}`);

                if (socket.character) {
                    this.characters.delete(socket.character.id);

                    if (socket.character.room) {
                        socket.character.exitRoom();
                    }
                }
            });
        });
    }
}

module.exports = Server;
