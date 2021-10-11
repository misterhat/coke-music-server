const rooms = require('coke-music-data/rooms.json');

const bole = require('bole');
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

class Character {
    constructor(server, { id }) {
        this.server = server;

        this.id = id;

        this.room = null;
        this.x = 0;
        this.y = 0;
    }

    move(x, y) {
        this.room.moveCharacter(this, x, y);
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

        this.characters = new Set();
        this.ownerID = null;
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

    chat(character, message ) {
        this.broadcast({ type: 'chat', id: character.id, message });
    }

    encode() {
        return {
            id: this.id,
            name: this.name,
            characters: Array.from(this.characters).map((character) => {
                return {
                    id: character.id,
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
                //JSON.stringify(this.room.entries(this.rooms));
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
                const character = socket.character;

                if (!character) {
                    log.error('no character for socket');
                    break;
                }

                if (!character.room) {
                    log.error('character not in room');
                    break;
                }

                character.move(message.x, message.y);
                break;
            }
            case 'chat': {
                const character = socket.character;

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
