const Poster = require('../entities/poster');
const log = require('bole')('packet-handlers');

async function removePoster(server, socket, message) {
    const { character } = socket;

    if (!character.isRoomOwner()) {
        log.error('not room owner');
        return;
    }

    const { room } = character;

    const poster = room.getPoster(
        message.x,
        message.y,
        message.name
    );

    if (poster) {
        room.removePoster(poster);
        room.save();

        if (message.type === 'pick-up-poster') {
            character.addItem('posters', message.name);
            character.save();
        }
    }
}

module.exports = {
    'add-poster': async (server, socket, message) => {
        const { character } = socket;

        if (!character.isRoomOwner()) {
            log.error('not room owner');
            return;
        }

        if (!character.removeItem('posters', message.name)) {
            log.error('character does not have item');
            return;
        }

        const { room } = character;

        if (!room.walls[message.x]) {
            log.error('out of bounds');
            return;
        }

        // TODO check y

        const poster = new Poster(server, room, {
            name: message.name,
            x: message.x,
            y: message.y
        });

        room.addPoster(poster);
        room.save();
        character.save();
    },

    'pick-up-poster': removePoster,
    'remove-poster': removePoster
};

