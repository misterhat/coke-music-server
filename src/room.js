const EasyStar = require('@misterhat/easystarjs');
const rooms = require('coke-music-data/rooms.json');

class Room {
    constructor(server, { id, ownerID, ownerName, studio, name }) {
        this.server = server;

        this.id = id;

        if (!rooms[name]) {
            throw new Error(`invalid room name ${name}`);
        }

        this.ownerID = ownerID;
        this.ownerName = ownerName;
        this.studio = studio;
        this.name = name;

        Object.assign(this, rooms[name]);

        // TODO clone this.map into obstacle map and add players

        this.easystar = new EasyStar.js();
        this.easystar.setGrid(this.map);
        this.easystar.setAcceptableTiles([0]);
        this.easystar.enableDiagonals();
        this.easystar.disableCornerCutting();

        this.characters = new Set();

        this.pathInterval = setInterval(() => {
            this.easystar.calculate();
        }, 1000 / 30);
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
            ownerID: this.ownerID,
            ownerName: this.ownerName,
            studio: this.studio,
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

module.exports = Room;
