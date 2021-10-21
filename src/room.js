const EasyStar = require('@misterhat/easystarjs');
const GameObject = require('./game-object');
const Rug = require('./rug');
const rooms = require('coke-music-data/rooms.json');

class Room {
    constructor(server, data) {
        const {
            id,
            ownerID,
            ownerName,
            studio,
            name,
            wall,
            tile,
            objects,
            rugs
        } = data;

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

        this.characters = new Set();

        this.objects = [];
        this.rugs = [];

        for (const data of JSON.parse(objects)) {
            this.addObject(new GameObject(this.server, data));
        }

        for (const data of JSON.parse(rugs)) {
            this.addRug(new Rug(this.server, data));
        }

        this.pathInterval = setInterval(() => {
            this.easystar.calculate();
        }, 1000 / 30);
    }

    updateRoomType() {
        Object.assign(this, rooms[this.name]);

        this.width = this.map[0].length;
        this.height = this.map.length;

        this.obstacleMap = [];

        for (let y = 0; y < this.height; y += 1) {
            this.obstacleMap.push([]);

            for (let x = 0; x < this.width; x += 1) {
                this.obstacleMap[y][x] = this.map[y][x];
            }
        }

        this.easystar = new EasyStar.js();
        this.easystar.setGrid(this.obstacleMap);
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

        this.obstacleMap[this.exit.y][this.exit.x] = newCharacter;

        setTimeout(() => {
            this.broadcast({
                type: 'add-character',
                ...newCharacter.toJSON()
            });
        }, 250);
    }

    removeCharacter(character) {
        character.room = null;

        this.obstacleMap[character.y][character.x] = 0;

        this.broadcast({ type: 'remove-character', id: character.id });
        this.characters.delete(character);
    }

    moveCharacter(character, x, y) {
        this.obstacleMap[character.y][character.x] = 0;
        this.obstacleMap[y][x] = 1;

        this.broadcast({ type: 'move-character', id: character.id, x, y });
    }

    updateCharacterAppearance(character) {
        this.broadcast({
            type: 'character-appearance',
            id: character.id,
            hairIndex: character.hairIndex,
            hairColour: character.hairColour,
            shirtIndex: character.shirtIndex,
            shirtColour: character.shirtColour,
            pantsIndex: character.pantsIndex,
            pantsColour: character.pantsColour,
            shoesIndex: character.shoesIndex,
            shoesColour: character.shoesColour,
            skinTone: character.skinTone
        });
    }

    addObject(object) {
        this.objects.push(object);

        for (let y = object.y; y < object.y + object.getTileHeight(); y += 1) {
            for (
                let x = object.x;
                x < object.x + object.getTileWidth();
                x += 1
            ) {
                this.obstacleMap[y][x] = object;
            }
        }

        // TODO broadcast to the users who aren't the owner
    }

    removeObject(object) {
        for (let i = 0; i < this.objects.length; i += 1) {
            if (this.objects[i] === object) {
                this.objects.splice(i, 1);
                break;
            }
        }

        for (let y = object.y; y < object.y + object.getTileHeight(); y += 1) {
            for (
                let x = object.x;
                x < object.x + object.getTileWidth();
                x += 1
            ) {
                this.obstacleMap[y][x] = 0;
            }
        }

        // TODO broadcast to the users who aren't the owner
    }

    getObject(x, y, name) {
        for (const object of this.objects) {
            if (object.x === x && object.y === y && object.name === name) {
                return object;
            }
        }
    }

    addRug(rug) {
        this.rugs.push(rug);
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

        this.objects = [];
    }

    save() {
        this.server.queryHandler.updateRoom({
            id: this.id,
            name: this.name,
            studio: this.studio,
            tile: this.tile,
            wall: this.wall,
            objects: JSON.stringify(this.objects),
            rugs: JSON.stringify(this.rugs)
        });
    }

    remove() {
        this.server.queryHandler.deleteRoom(this.id);
    }

    toJSON() {
        return {
            id: this.id,
            ownerID: this.ownerID,
            ownerName: this.ownerName,
            studio: this.studio,
            name: this.name,
            wall: this.wall,
            tile: this.tile,
            characters: Array.from(this.characters).map((character) => {
                return character.toJSON();
            }),
            objects: this.objects,
            rugs: this.rugs
        };
    }
}

module.exports = Room;
