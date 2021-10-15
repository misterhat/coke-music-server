const Character = require('./character');
const Database = require('better-sqlite3');
const QueryHandler = require('./query-handler');
const Room = require('./room');
const bcrypt = require('bcryptjs');
const camelcaseKeys = require('camelcase-keys');
const log = require('bole')('server');
const promisify = require('util').promisify;
const { WebSocketServer } = require('ws');

const bcryptCompare = promisify(bcrypt.compare);
const bcryptHash = promisify(bcrypt.hash);

class Server {
    constructor({ port, databaseFile, hashRounds, trustProxy }) {
        this.port = port || 43594;
        this.hashRounds = hashRounds || 10;
        this.trustProxy = !!trustProxy;

        this.server = new WebSocketServer({ port: this.port });
        this.database = new Database(databaseFile || './coke-music.sqlite');
        this.queryHandler = new QueryHandler(this.database);

        this.characters = new Set();
        this.rooms = new Map();

        const studioA = new Room(this, { id: 0, name: 'studio_a' });
        this.rooms.set(0, studioA);
    }

    async handleMessage(socket, message) {
        try {
            switch (message.type) {
                case 'login': {
                    const data = this.queryHandler.getCharacter(
                        message.username
                    );

                    if (
                        !data ||
                        !(await bcryptCompare(message.password, data.password))
                    ) {
                        socket.send(
                            JSON.stringify({
                                type: 'login-response',
                                success: false,
                                message: 'Invalid username or password.'
                            })
                        );

                        break;
                    }

                    const character = new Character(this, camelcaseKeys(data));

                    character.socket = socket;
                    socket.character = character;

                    this.characters.add(character);

                    socket.send(JSON.stringify({
                        type: 'login-response',
                        id: character.id,
                        success: true
                    }));
                    break;
                }
                case 'register': {
                    const { username, password, email } = message;

                    // client-side should check these first
                    if (
                        !username.length ||
                        username.length >= 20 ||
                        !password.length ||
                        password.length > 1000 ||
                        !email.length ||
                        email.length > 1000
                    ) {
                        throw new Error('invalid register');
                    }

                    // TODO throttling

                    if (this.queryHandler.characterExists(username)) {
                        socket.send(
                            JSON.stringify({
                                type: 'register-response',
                                success: false,
                                message: 'Username already taken.'
                            })
                        );

                        return;
                    }

                    const hashedPassword = await bcryptHash(
                        password,
                        this.hashRounds
                    );

                    this.queryHandler.insertCharacter({
                        username,
                        password: hashedPassword,
                        email,
                        ip: socket.ip
                    });

                    socket.send(
                        JSON.stringify({
                            type: 'register-response',
                            success: true
                        })
                    );
                    break;
                }
                case 'get-rooms': {
                    const rooms = [];

                    for (const [id, room] of this.rooms.entries()) {
                        rooms.push({
                            id,
                            name: room.name,
                            characterCount: room.characters.size,
                            ownerID: room.ownerID
                        });
                    }

                    socket.send(JSON.stringify({ type: 'rooms', rooms }));
                    break;
                }
                case 'join-room': {
                    const room = this.rooms.get(message.id);

                    if (!room) {
                        log.error(`invalid room id ${message.id}`);
                        break;
                    }

                    const { character } = socket;

                    if (!character) {
                        log.error('no character for socket');
                        return;
                    }

                    if (character.room) {
                        log.error('already in room');
                        return;
                    }

                    socket.send(
                        JSON.stringify({
                            type: 'join-room',
                            ...room.encode()
                        })
                    );

                    room.addCharacter(socket.character);
                    break;
                }
                case 'walk': {
                    const { character } = socket;

                    if (!character) {
                        log.error('no character for socket');
                        break;
                    }

                    if (!character.room) {
                        log.error('character not in room');
                        break;
                    }

                    character.walkTo(message.x, message.y);
                    break;
                }
                case 'chat': {
                    const { character } = socket;

                    if (!character) {
                        log.error('no character for socket');
                        break;
                    }

                    if (!character.room) {
                        log.error('character not in room');
                        break;
                    }

                    character.chat(message.message);
                    break;
                }
                default:
                    log.error('unhandled message', message);
                    break;
            }
        } catch (e) {
            log.error(e);
        }
    }

    start() {
        log.info(`listening for websocket connections on port ${this.port}`);

        this.server.on('connection', (socket) => {
            socket.ip = socket._socket.remoteAddress;

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
                if (socket.character && socket.character.room) {
                    socket.character.exitRoom();
                }
            });
        });
    }
}

module.exports = Server;
