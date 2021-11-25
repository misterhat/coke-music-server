const Room = require('../entities/room');
const log = require('bole')('packet-handlers');

module.exports = {
    'get-rooms': async (server, socket, message) => {
        const { character } = socket;
        const showActive = message.active;
        const showMine = message.mine;

        const rooms = [];

        for (const [id, room] of server.rooms.entries()) {
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
    },

    'join-room': async (server, socket, message) => {
        const room = server.rooms.get(message.id);

        if (!room) {
            log.error(`invalid room id ${message.id}`);
            return;
        }

        if (room.characters.size >= 25) {
            return;
        }

        socket.character.joinRoom(room);
    },

    'create-room': async (server, socket) => {
        const { character } = socket;

        const studio = `${character.username}'s Studio`;
        const name = 'studio_a';

        const id = server.queryHandler.insertRoom({
            owner_id: character.id,
            studio,
            name
        });

        const room = new Room(server, {
            id,
            studio,
            name,
            ownerID: character.id,
            ownerName: character.username
        });

        server.rooms.set(id, room);

        await server.handleMessage(socket, { type: 'join-room', id });
    }
};
