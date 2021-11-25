const log = require('bole')('packet-handlers');
const rooms = require('coke-music-data/rooms.json');
const tiles = require('coke-music-data/tiles.json').map(({ file }) => file);
const walls = require('coke-music-data/walls.json').map(({ file }) => file);

module.exports = {
    'leave-room': async (server, socket) => {
        const { character } = socket;

        if (!character.room) {
            log.error('not in room');
            return;
        }

        character.exitRoom();
    },

    // save changes made in the studio settings
    'save-room': async (server, socket, message) => {
        const { character } = socket;

        if (!character.isRoomOwner()) {
            log.error('not room owner');
            return;
        }

        const studio = message.studio;

        if (studio.length > 50) {
            log.error('studio name too long');
            return;
        }

        if (!rooms[message.name]) {
            log.error(`invalid room name ${message.name}`);
            return;
        }

        if (message.tile && tiles.indexOf(message.tile) === -1) {
            log.error(`invalid tile ${message.tile}`);
            return;
        }

        if (message.wall && walls.indexOf(message.wall) === -1) {
            log.error(`invalid wall ${message.wall}`);
            return;
        }

        const { room } = character;

        // studio type
        const oldName = room.name;

        const oldCharacters = new Set(room.characters);
        const oldObjects = room.objects;
        const oldRugs = room.rugs;
        const oldPosters = room.posters;

        room.clear();

        room.name = message.name;
        room.studio = message.studio;
        room.tile = message.tile;
        room.wall = message.wall;

        room.updateRoomType();

        if (oldName !== room.name) {
            // pick-up all the objects if we switch room layout
            for (const object of oldObjects) {
                character.addItem('furniture', object.name);
            }

            for (const rug of oldRugs) {
                character.addItem('rugs', rug.name);
            }

            for (const poster of oldPosters) {
                character.addItem('posters', poster.name);
            }

            character.save();
        } else {
            // if room layout is the same, keep them
            for (const object of oldObjects) {
                room.addObject(object);
            }

            for (const rug of oldRugs) {
                room.addRug(rug);
            }

            for (const poster of oldPosters) {
                room.addPoster(poster);
            }
        }

        room.save();

        for (const character of oldCharacters) {
            character.joinRoom(room);
        }
    },

    'delete-room': async (server, socket) => {
        const { character } = socket;

        if (!character.isRoomOwner()) {
            log.error('not room owner');
            return;
        }

        server.rooms.delete(character.room.id);
        character.room.remove();
        character.exitRoom();
    }
};
