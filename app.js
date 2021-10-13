const EasyStar = require('@misterhat/easystarjs');
const bole = require('bole');
const rooms = require('coke-music-data/rooms.json');
const { WebSocketServer } = require('ws');

const log = bole('app');

bole.output({
    level: 'debug',
    stream: process.stdout
});

const temp_ids = {
    test1: 0,
    test2: 1,
    test3: 2
};

const STEP_TIMEOUT = 500;

class Character {
    constructor(server, { id, username }) {
        this.server = server;

        this.username = username;
        this.id = id;

        this.room = null;
        this.x = 0;
        this.y = 0;

        this.isWalking = false;
        this.stepTimeout = null;
    }

    move(x, y) {
        this.x = x;
        this.y = y;

        this.room.moveCharacter(this, x, y);
    }

    step() {
        if (!this.path.length) {
            this.stepTimeout = null;
            this.isWalking = false;
            return;
        }

        const lastX = this.x;
        const lastY = this.y;

        const { x, y } = this.path.shift();

        const deltaX = x - lastX;
        const deltaY = y - lastY;

        let timeout = STEP_TIMEOUT;

        if (Math.abs(deltaX) === 1 && Math.abs(deltaY) === 1) {
            timeout *= 1.50;
        }

        this.move(x, y);

        this.stepTimeout = setTimeout(this.step.bind(this), timeout);
    }

    walkTo(x, y) {
        this.room.easystar.findPath(this.x, this.y, x, y, (path) => {
            if (!path) {
                return;
            }

            this.path = path;
            this.path.shift();

            if (this.isWalking) {
                if (this.stepTimeout) {
                    clearTimeout(this.stepTimeout);
                }

                this.stepTimeout = setTimeout(
                    this.step.bind(this),
                    STEP_TIMEOUT
                );
            } else {
                this.isWalking = true;
                this.step();
            }
        });
    }

    chat(message) {
        this.room.chat(this, message);
    }

    exitRoom() {
        this.room.removeCharacter(this);
    }
}

class Room {
    constructor(server, { id, name }) {
        this.server = server;

        this.id = id;

        if (!rooms[name]) {
            throw new Error(`invalid room name ${name}`);
        }

        this.name = name;

        Object.assign(this, rooms[name]);

        // TODO clone this.map into obstacle map and add players

        this.easystar = new EasyStar.js();
        this.easystar.setGrid(this.map);
        this.easystar.setAcceptableTiles([0]);
        this.easystar.enableDiagonals();

        this.characters = new Set();
        this.ownerID = null;

        this.pathInterval = setInterval(() => {
            this.easystar.calculate();
        }, 100);
    }

    broadcast(message) {
        for (const character of this.characters) {
            character.socket.send(JSON.stringify(message));
        }
    }

    addCharacter(newCharacter) {
        newCharacter.x = this.exit.x;
        newCharacter.y = this.exit.y;

        newCharacter.room = this;
        this.characters.add(newCharacter);

        setTimeout(() => {
            this.broadcast({
                type: 'add-character',
                username: newCharacter.username,
                id: newCharacter.id,
                x: newCharacter.x,
                y: newCharacter.y
            });
        }, 250);
    }

    removeCharacter(character) {
        character.room = null;
        this.characters.delete(character);

        this.broadcast({ type: 'remove-character', id: character.id });
    }

    moveCharacter(character, x, y) {
        this.broadcast({ type: 'move-character', id: character.id, x, y });
    }

    chat(character, message) {
        this.broadcast({
            type: 'chat',
            id: character.id,
            message,
            x: character.x,
            y: character.y
        });
    }

    encode() {
        return {
            id: this.id,
            name: this.name,
            characters: Array.from(this.characters).map((character) => {
                return {
                    id: character.id,
                    username: character.username,
                    x: character.x,
                    y: character.y
                };
            })
        };
    }
}

class Server {
    constructor({ port }) {
        this.port = port || 43594;

        this.server = new WebSocketServer({ port: this.port });
        this.characters = new Set();
        this.rooms = new Map();

        const studioA = new Room(this, { id: 0, name: 'studio_a' });
        this.rooms.set(0, studioA);
    }

    handleMessage(socket, message) {
        switch (message.type) {
            case 'login': {
                const character = new Character(this, {
                    username: message.username,
                    id: temp_ids[message.username]
                });

                character.socket = socket;
                socket.character = character;

                this.characters.add(character);

                socket.send(
                    JSON.stringify({
                        type: 'login-response',
                        id: temp_ids[message.username],
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

                //character.move(message.x, message.y);
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
    }

    start() {
        log.info(`listening for websocket connections on port ${this.port}`);

        this.server.on('connection', (socket) => {
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

const server = new Server({ port: 43594 });
server.start();
