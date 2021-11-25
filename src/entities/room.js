const EasyStar = require('@misterhat/easystarjs');
const GameObject = require('./game-object');
const Poster = require('./poster');
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
            rugs,
            posters
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
        this.posters = [];

        for (const data of JSON.parse(objects || '[]')) {
            this.addObject(new GameObject(this.server, this, data));
        }

        for (const data of JSON.parse(rugs || '[]')) {
            this.addRug(new Rug(this.server, this, data));
        }

        for (const data of JSON.parse(posters || '[]')) {
            this.addPoster(new Poster(this.server, this, data));
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
        this.objectMap = [];

        for (let y = 0; y < this.height; y += 1) {
            this.obstacleMap.push([]);
            this.objectMap.push([]);

            for (let x = 0; x < this.width; x += 1) {
                this.obstacleMap[y][x] = this.map[y][x];
                this.objectMap[y][x] = null;
            }
        }

        this.easystar = new EasyStar.js();
        this.easystar.setGrid(this.obstacleMap);
        this.easystar.setAcceptableTiles([0]);
        this.easystar.enableDiagonals();
        this.easystar.disableCornerCutting();
    }

    broadcast(message, ignoreOwner = false) {
        for (const character of this.characters) {
            if (ignoreOwner && this.ownerID === character.id) {
                continue;
            }

            character.socket.send(JSON.stringify(message));
        }
    }

    addCharacter(newCharacter) {
        newCharacter.x = this.exit.x;
        newCharacter.y = this.exit.y;
        newCharacter.room = this;

        this.characters.add(newCharacter);

        this.obstacleMap[this.exit.y][this.exit.x] = 1;
        this.objectMap[this.exit.y][this.exit.x] = newCharacter;

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

        if (!character.isSitting) {
            this.objectMap[character.y][character.x] = null;
        }

        this.broadcast({ type: 'remove-character', id: character.id });
        this.characters.delete(character);
    }

    moveCharacter(character, x, y) {
        this.obstacleMap[character.y][character.x] = 0;
        this.obstacleMap[y][x] = 1;

        if (this.objectMap[character.y][character.x] === character) {
            this.objectMap[character.y][character.x] = null;
        }

        this.objectMap[y][x] = character;

        this.broadcast({ type: 'move-character', id: character.id, x, y });
    }

    updateCharacterAppearance(character) {
        this.broadcast({
            type: 'character-appearance',
            id: character.id,
            faceIndex: character.faceIndex,
            hairIndex: character.hairIndex,
            hairColour: character.hairColour,
            shirtIndex: character.shirtIndex,
            shirtColour: character.shirtColour,
            pantsIndex: character.pantsIndex,
            pantsColour: character.pantsColour,
            shoesIndex: character.shoesIndex,
            shoesColour: character.shoesColour,
            skinTone: character.skinTone,
            isFemale: character.isFemale
        });
    }

    sitCharacter(character, x, y) {
        this.broadcast({ type: 'character-sit', id: character.id, x, y });
    }

    addObject(object) {
        this.objects.push(object);

        for (let y = object.y; y < object.y + object.getTileHeight(); y += 1) {
            for (
                let x = object.x;
                x < object.x + object.getTileWidth();
                x += 1
            ) {
                if (!object.sit) {
                    this.obstacleMap[y][x] = 1;
                }

                this.objectMap[y][x] = object;
            }
        }

        this.broadcast(
            {
                type: 'add-object',
                name: object.name,
                x: object.x,
                y: object.y,
                angle: object.angle
            },
            true
        );
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
                if (!object.sit) {
                    this.obstacleMap[y][x] = 0;
                }

                this.objectMap[y][x] = null;
            }
        }

        this.broadcast(
            {
                type: 'remove-object',
                name: object.name,
                x: object.x,
                y: object.y
            },
            true
        );
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

        this.broadcast(
            {
                type: 'add-rug',
                name: rug.name,
                x: rug.x,
                y: rug.y
            },
            true
        );
    }

    getRug(x, y, name) {
        for (const rug of this.rugs) {
            if (rug.x === x && rug.y === y && rug.name === name) {
                return rug;
            }
        }
    }

    removeRug(rug) {
        for (let i = 0; i < this.rugs.length; i += 1) {
            if (this.rugs[i] === rug) {
                this.rugs.splice(i, 1);
                break;
            }
        }

        this.broadcast(
            {
                type: 'remove-rug',
                name: rug.name,
                x: rug.x,
                y: rug.y
            },
            true
        );
    }

    addPoster(poster) {
        this.posters.push(poster);

        this.broadcast(
            {
                type: 'add-poster',
                name: poster.name,
                x: poster.x,
                y: poster.y
            },
            true
        );
    }

    getPoster(x, y, name) {
        for (const poster of this.posters) {
            if (poster.x === x && poster.y === y && poster.name === name) {
                return poster;
            }
        }
    }

    removePoster(poster) {
        for (let i = 0; i < this.posters.length; i += 1) {
            if (this.posters[i] === poster) {
                this.posters.splice(i, 1);
                break;
            }
        }

        this.broadcast(
            {
                type: 'remove-poster',
                name: poster.name,
                x: poster.x,
                y: poster.y
            },
            true
        );
    }

    chat(character, message) {
        const chat = {
            type: 'chat',
            id: character.id,
            message,
            x: character.x,
            y: character.y,
            colour: character.shirtColour,
            room_id: character.room.id
        };

        this.server.queryHandler.addChatLog(chat);

        delete chat.room_id;

        this.broadcast(chat);
    }

    // remove all of the characters from the room
    clear() {
        for (const character of this.characters) {
            character.exitRoom();
        }

        this.objects = [];
        this.rugs = [];
        this.posters = [];
    }

    save() {
        this.server.queryHandler.updateRoom({
            id: this.id,
            name: this.name,
            studio: this.studio,
            tile: this.tile,
            wall: this.wall,
            objects: JSON.stringify(this.objects),
            rugs: JSON.stringify(this.rugs),
            posters: JSON.stringify(this.posters)
        });
    }

    remove() {
        this.server.queryHandler.deleteRoom(this.id);
    }

    // used to send to client
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
            rugs: this.rugs,
            posters: this.posters
        };
    }
}

module.exports = Room;
