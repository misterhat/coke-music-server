const Character = require('./character');
const Database = require('better-sqlite3');
const QueryHandler = require('./query-handler');
const Room = require('./room');
const bcrypt = require('bcryptjs');
const camelcaseKeys = require('camelcase-keys');
const log = require('bole')('server');
const promisify = require('util').promisify;
const rooms = require('coke-music-data/rooms.json');
const tiles = require('coke-music-data/tiles.json').map(({ file }) => file);
const walls = require('coke-music-data/walls.json').map(({ file }) => file);
const { WebSocketServer } = require('ws');
const GameObject = require('./game-object');
const Rug = require('./rug');

const bcryptCompare = promisify(bcrypt.compare);
const bcryptHash = promisify(bcrypt.hash);

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
        this.characters = new Map();

        // all of the rooms from the database
        this.rooms = new Map();
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

                    const character = new Character(this, data);

                    character.socket = socket;
                    socket.character = character;

                    this.characters.set(data.id, character);

                    socket.send(
                        JSON.stringify({
                            type: 'login-response',
                            id: character.id,
                            success: true,
                            ...character.toJSON()
                        })
                    );

                    character.sendInventory();

                    log.debug(`character ${character.username} logged in`);
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
                    const { character } = socket;
                    const showActive = message.active;
                    const showMine = message.mine;

                    const rooms = [];

                    for (const [id, room] of this.rooms.entries()) {
                        if (showActive && !room.characters.size) {
                            continue;
                        }

                        if (showMine && room.ownerID !== character.id) {
                            continue;
                        }

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
                        name,
                        ownerID: character.id,
                        ownerName: character.username
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

                    if (!character.isRoomOwner()) {
                        log.error('not room owner');
                        break;
                    }

                    const studio = message.studio;

                    if (studio.length > 50) {
                        log.error('studio name too long');
                        break;
                    }

                    if (!rooms[message.name]) {
                        log.error(`invalid room name ${message.name}`);
                        break;
                    }

                    if (message.tile && tiles.indexOf(message.tile) === -1) {
                        log.error(`invalid tile ${message.tile}`);
                        break;
                    }

                    if (message.wall && walls.indexOf(message.wall) === -1) {
                        log.error(`invalid wall ${message.wall}`);
                        break;
                    }

                    const { room } = character;

                    const oldCharacters = new Set(room.characters);
                    const oldObjects = room.objects;
                    const oldRugs = room.rugs;

                    room.clear();

                    room.name = message.name;
                    room.studio = message.studio;
                    room.tile = message.tile;
                    room.wall = message.wall;

                    room.updateRoomType();

                    for (const object of oldObjects) {
                        room.addObject(object);
                    }

                    for (const rug of oldRugs) {
                        room.addRug(rug);
                    }

                    room.save();

                    for (const character of oldCharacters) {
                        character.joinRoom(room);
                    }

                    break;
                }

                case 'delete-room': {
                    const { character } = socket;

                    if (!character.isRoomOwner()) {
                        log.error('not room owner');
                        break;
                    }

                    this.rooms.delete(character.room.id);
                    character.room.remove();
                    character.exitRoom();
                    break;
                }

                case 'add-object': {
                    const { character } = socket;

                    if (!character.isRoomOwner()) {
                        log.error('not room owner');
                        break;
                    }

                    const { room } = character;

                    if (
                        message.x < 0 ||
                        message.x > room.width ||
                        message.y < 0 ||
                        message.y > room.height ||
                        room.obstacleMap[message.y][message.x]
                    ) {
                        log.error('out of bounds');
                        break;
                    }

                    if (!character.removeItem('furniture', message.name)) {
                        log.error('character does not have item');
                        break;
                    }

                    const object = new GameObject(this, character.room, {
                        name: message.name,
                        x: message.x,
                        y: message.y,
                        angle: message.angle
                    });

                    // the checks this
                    if (!object.isBlocked()) {
                        room.addObject(object);
                        room.save();
                    }

                    character.save();

                    break;
                }

                case 'pick-up-object':
                case 'remove-object': {
                    const { character } = socket;

                    if (!character.isRoomOwner()) {
                        log.error('not room owner');
                        break;
                    }

                    const { room } = character;

                    const object = room.getObject(
                        message.x,
                        message.y,
                        message.name
                    );

                    if (object) {
                        room.removeObject(object);
                        room.save();

                        if (message.type === 'pick-up-object') {
                            character.addItem('furniture', message.name);
                            character.save();
                        }
                    }
                    break;
                }

                case 'rotate-object': {
                    const { character } = socket;

                    if (!character.isRoomOwner()) {
                        log.error('not room owner');
                        break;
                    }

                    const { room } = character;

                    const object = room.getObject(
                        message.x,
                        message.y,
                        message.name
                    );

                    if (object) {
                        room.removeObject(object);

                        const oldAngle = object.angle;
                        object.rotate();

                        if (!object.isBlocked()) {
                            room.addObject(object);
                            room.save();
                        } else {
                            object.angle = oldAngle;
                            room.addObject(object);
                        }
                    }
                    break;
                }

                case 'add-rug': {
                    const { character } = socket;

                    if (!character.isRoomOwner()) {
                        log.error('not room owner');
                        break;
                    }

                    if (!character.removeItem('rugs', message.name)) {
                        log.error('character does not have item');
                        break;
                    }

                    const { room } = character;

                    const rug = new Rug(this, {
                        name: message.name,
                        x: message.x,
                        y: message.y
                    });

                    room.addRug(rug);
                    room.save();
                    character.save();

                    break;
                }

                case 'pick-up-rug':
                case 'remove-rug': {
                    const { character } = socket;

                    if (!character.isRoomOwner()) {
                        log.error('not room owner');
                        break;
                    }

                    const { room } = character;

                    const rug = room.getRug(message.x, message.y, message.name);

                    if (rug) {
                        room.removeRug(rug);
                        room.save();

                        if (message.type === 'pick-up-rug') {
                            character.addItem('rugs', message.name);
                            character.save();
                        }
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

                // change character appearance
                case 'appearance': {
                    // TODO check colours and indexes
                    const { character } = socket;
                    character.setAppearance(message);
                    character.save();
                    break;
                }

                case 'command': {
                    // TODO check ranks

                    const { character } = socket;

                    switch (message.command) {
                        case 'appearance':
                            character.sendAppearancePanel();
                            break;
                        case 'item': {
                            let amount = Number(message.args[2]) || 1;

                            for (let i = 0; i < amount; i += 1) {
                                character.addItem(
                                    message.args[0],
                                    message.args[1]
                                );
                            }

                            character.save();
                            break;
                        }
                    }
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
