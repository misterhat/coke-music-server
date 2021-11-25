const Character = require('../entities/character');
const bcrypt = require('bcryptjs');
const log = require('bole')('packet-handlers');
const { promisify } = require('util');

const bcryptCompare = promisify(bcrypt.compare);
const bcryptHash = promisify(bcrypt.hash);

module.exports = {
    login: async (server, socket, message) => {
        const data = server.queryHandler.getCharacter(message.username);

        if (!data || !(await bcryptCompare(message.password, data.password))) {
            socket.send(
                JSON.stringify({
                    type: 'login-response',
                    success: false,
                    message: 'Invalid username or password.'
                })
            );

            return;
        }

        if (server.characters.get(data.id)) {
            socket.send(
                JSON.stringify({
                    type: 'login-response',
                    success: false,
                    message: 'Character already logged in.'
                })
            );

            return;
        }

        const character = new Character(server, data);

        character.socket = socket;
        socket.character = character;

        server.characters.set(data.id, character);

        socket.send(
            JSON.stringify({
                type: 'login-response',
                id: character.id,
                success: true,
                ...character.toJSON()
            })
        );

        character.sendInventory();

        log.debug(`character ${character.username} logged in`);
    },

    register: async (server, socket, message) => {
        const { username, password, email } = message;

        // client-side should check these first
        if (
            !username.length ||
            username.length >= 20 ||
            !password.length ||
            password.length > 1000 ||
            !email.length ||
            email.length > 1000
        ) {
            throw new Error('invalid register');
        }

        // TODO throttling

        if (server.queryHandler.characterExists(username)) {
            socket.send(
                JSON.stringify({
                    type: 'register-response',
                    success: false,
                    message: 'Username already taken.'
                })
            );

            return;
        }

        const hashedPassword = await bcryptHash(password, server.hashRounds);

        server.queryHandler.insertCharacter({
            username,
            password: hashedPassword,
            email,
            ip: socket.ip
        });

        socket.send(
            JSON.stringify({ type: 'register-response', success: true })
        );
    },

    appearance: async (server, socket, message) => {
        const { character } = socket;

        if (!Character.validateAppearance(message)) {
            log.error('invalid appearance');
            return;
        }

        character.setAppearance(message);
        character.save();
    },

    walk: async (server, socket, message) => {
        const { character } = socket;

        if (!character.room) {
            log.error('character not in room');
        } else {
            character.walkTo(message.x, message.y);
        }
    },

    chat: async (server, socket, message) => {
        const { character } = socket;

        if (!character.room) {
            log.error('character not in room');
        } else {
            character.chat(message.message);
        }
    }
};
