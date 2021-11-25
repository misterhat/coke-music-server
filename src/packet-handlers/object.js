const GameObject = require('../entities/game-object');
const log = require('bole')('packet-handlers');

async function removeObject(server, socket, message) {
    const { character } = socket;

    if (!character.isRoomOwner()) {
        log.error('not room owner');
        return;
    }

    const { room } = character;

    const object = room.getObject(message.x, message.y, message.name);

    if (object) {
        room.removeObject(object);
        room.save();

        if (message.type === 'pick-up-object') {
            character.addItem('furniture', message.name);
            character.save();
        }
    } else {
        log.error('character removing non-existent object');
    }
}

module.exports = {
    'add-object': async (server, socket, message) => {
        const { character } = socket;

        if (!character.isRoomOwner()) {
            log.error('not room owner');
            return;
        }

        const { room } = character;

        if (
            message.x < 0 ||
            message.x > room.width ||
            message.y < 0 ||
            message.y > room.height ||
            room.obstacleMap[message.y][message.x]
        ) {
            log.error('out of bounds');
            return;
        }

        if (!character.removeItem('furniture', message.name)) {
            log.error('character does not have item');
            return;
        }

        const object = new GameObject(server, character.room, {
            name: message.name,
            x: message.x,
            y: message.y,
            angle: message.angle
        });

        if (!object.isBlocked()) {
            room.addObject(object);
            room.save();
        }

        character.save();
    },

    'pick-up-object': removeObject,
    'remove-object': removeObject,

    'rotate-object': async (server, socket, message) => {
        const { character } = socket;

        if (!character.isRoomOwner()) {
            log.error('not room owner');
            return;
        }

        const { room } = character;

        const object = room.getObject(message.x, message.y, message.name);

        if (object) {
            room.removeObject(object);

            const oldAngle = object.angle;
            object.rotate();

            if (!object.isBlocked()) {
                room.addObject(object);
                room.save();
            } else {
                object.angle = oldAngle;
                room.addObject(object);
            }
        }
    }
};
