const Character = require('./character');
const Database = require('better-sqlite3');
const QueryHandler = require('./query-handler');
const Room = require('./room');
const bcrypt = require('bcryptjs');
const camelcaseKeys = require('camelcase-keys');
const log = require('bole')('server');
const promisify = require('util').promisify;
const rooms = require('coke-music-data/rooms.json');
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

        // characters currently connected
        this.characters = new Map();

        // all of the rooms from the database
        this.rooms = new Map();

        const studioA = new Room(this, {
            id: 0,
            studio: 'Test',
            name: 'studio_a'
        });

        this.rooms.set(0, studioA);
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

                    if (this.characters.get(data.id)) {
                        socket.send(
                            JSON.stringify({
                                type: 'login-response',
                                success: false,
                                message: 'Character already logged in.'
                            })
                        );

                        break;
                    }

                    const character = new Character(this, camelcaseKeys(data));

                    character.socket = socket;
                    socket.character = character;

                    this.characters.set(data.id, character);

                    socket.send(
                        JSON.stringify({
                            type: 'login-response',
                            id: character.id,
                            success: true
                        })
                    );
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
                            studio: room.studio,
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

                    socket.character.joinRoom(room);

                    break;
                }
                case 'create-room': {
                    const { character } = socket;

                    if (character.room) {
                        log.error('already in room');
                        break;
                    }

                    const studio = `${character.username}'s Studio`;
                    const name = 'studio_a';

                    const id = this.queryHandler.insertRoom({
                        owner_id: character.id,
                        studio,
                        name
                    });

                    const room = new Room(this, {
                        id,
                        studio,
                        name
                    });

                    this.rooms.set(id, room);

                    await this.handleMessage(socket, { type: 'join-room', id });
                    break;
                }
                case 'leave-room': {
                    const { character } = socket;

                    if (!character.room) {
                        log.error('not in room');
                        break;
                    }

                    character.exitRoom();

                    break;
                }

                // save changes made in the studio settings
                case 'save-room': {
                    const { character } = socket;

                    if (
                        !character.room ||
                        character.room.ownerID !== character.id
                    ) {
                        log.error('not owner of room');
                        break;
                    }

                    const studio = message.studio;

                    if (studio.length > 50) {
                        log.error('studio name too long');
                        break;
                    }

                    const name = message.name;

                    if (!rooms[name]) {
                        log.error(`invalid room name ${name}`);
                        break;
                    }

                    const { room } = character;

                    const oldCharacters = new Set(room.characters);

                    room.clear();

                    room.name = message.name;
                    room.studio = message.studio;

                    room.updateRoomType();

                    room.save();

                    for (const character of oldCharacters) {
                        character.joinRoom(room);
                    }

                    break;
                }

                case 'walk': {
                    const { character } = socket;

                    if (!character.room) {
                        log.error('character not in room');
                        break;
                    }

                    character.walkTo(message.x, message.y);
                    break;
                }
                case 'chat': {
                    const { character } = socket;

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
