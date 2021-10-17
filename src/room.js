const EasyStar = require('@misterhat/easystarjs');
const rooms = require('coke-music-data/rooms.json');

class Room {
    constructor(server, { id, ownerID, ownerName, studio, name, wall, tile }) {
        this.server = server;

        this.id = id;

        if (!rooms[name]) {
            throw new Error(`invalid room name ${name}`);
        }

        this.ownerID = ownerID;
        this.ownerName = ownerName;
        this.studio = studio;
        this.name = name;
        this.tile = tile;
        this.wall = wall;

        this.updateRoomType();

        // TODO clone this.map into obstacle map and add players

        this.characters = new Set();

        this.pathInterval = setInterval(() => {
            this.easystar.calculate();
        }, 1000 / 30);
    }

    updateRoomType() {
        Object.assign(this, rooms[this.name]);

        this.easystar = new EasyStar.js();
        this.easystar.setGrid(this.map);
        this.easystar.setAcceptableTiles([0]);
        this.easystar.enableDiagonals();
        this.easystar.disableCornerCutting();
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

        this.broadcast({ type: 'remove-character', id: character.id });
        this.characters.delete(character);
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

    // remove all of the characters from the room
    clear() {
        for (const character of this.characters) {
            character.exitRoom();
        }
    }

    save() {
        this.server.queryHandler.updateRoom({
            id: this.id,
            name: this.name,
            studio: this.studio,
            tile: this.tile,
            wall: this.carpet
        });
    }

    remove() {
        this.server.queryHandler.deleteRoom(this.id);
    }

    encode() {
        return {
            id: this.id,
            ownerID: this.ownerID,
            ownerName: this.ownerName,
            studio: this.studio,
            name: this.name,
            wall: this.wall,
            tile: this.tile,
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

module.exports = Room;
