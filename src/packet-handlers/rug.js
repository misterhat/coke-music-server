const Rug = require('../entities/rug');
const log = require('bole')('packet-handlers');

async function removeRug(server, socket, message) {
    const { character } = socket;

    if (!character.isRoomOwner()) {
        log.error('not room owner');
        return;
    }

    const { room } = character;

    const rug = room.getRug(message.x, message.y, message.name);

    if (rug) {
        room.removeRug(rug);
        room.save();

        if (message.type === 'pick-up-rug') {
            character.addItem('rugs', message.name);
            character.save();
        }
    }
}

module.exports = {
    'add-rug': async (server, socket, message) => {
        const { character } = socket;

        if (!character.isRoomOwner()) {
            log.error('not room owner');
            return;
        }

        if (!character.removeItem('rugs', message.name)) {
            log.error('character does not have item');
            return;
        }

        const { room } = character;

        const rug = new Rug(server, room, {
            name: message.name,
            x: message.x,
            y: message.y
        });

        room.addRug(rug);
        room.save();
        character.save();
    },

    'pick-up-rug': removeRug,
    'remove-rug': removeRug
};
