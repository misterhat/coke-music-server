const EasyStar = require('@misterhat/easystarjs');
const GameObject = require('./game-object');
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
            objects
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

        for (const data of JSON.parse(objects)) {
            this.addObject(new GameObject(this.server, data));
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

        this.obstacleMap[this.exit.y][this.exit.x] = 1;

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

        this.obstacleMap[character.y][character.x] = 0;

        this.broadcast({ type: 'remove-character', id: character.id });
        this.characters.delete(character);
    }

    moveCharacter(character, x, y) {
        this.obstacleMap[character.y][character.x] = 0;
        this.obstacleMap[y][x] = 1;

        this.broadcast({ type: 'move-character', id: character.id, x, y });
    }

    addObject(object) {
        this.objects.push(object);

        const tileWidth =
            object.angle <= 1 ? object.tileWidth : object.tileHeight;

        const tileHeight =
            object.angle <= 1 ? object.tileHeight : object.tileWidth;

        for (let y = object.y; y < object.y + tileHeight; y += 1) {
            for (let x = object.x; x < object.x + tileWidth; x += 1) {
                this.obstacleMap[y][x] = object;
            }
        }
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
            wall: this.carpet,
            objects: JSON.stringify(this.objects)
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
            objects: this.objects
        };
    }
}

module.exports = Room;
