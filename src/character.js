const log = require('bole')('character');

const STEP_TIMEOUT = 500;

class Character {
    constructor(server, { id, username }) {
        this.server = server;

        this.username = username;
        this.id = id;

        this.room = null;
        this.x = 0;
        this.y = 0;

        // TODO angle

        // when to send the next step
        this.stepTimeout = null;

        this.exitTimeout = null;
    }

    move(x, y) {
        clearTimeout(this.exitTimeout);

        this.x = x;
        this.y = y;

        this.room.moveCharacter(this, x, y);

        if (this.x === this.room.exit.x && this.y === this.room.exit.y) {
            this.exitTimeout = setTimeout(this.exitRoom.bind(this), 750);
        }
    }

    step() {
        if (!this.path.length) {
            this.stepTimeout = null;
            return;
        }

        const lastX = this.x;
        const lastY = this.y;

        const { x, y } = this.path.shift();

        const deltaX = x - lastX;
        const deltaY = y - lastY;

        let timeout = STEP_TIMEOUT;

        if (Math.abs(deltaX) === 1 && Math.abs(deltaY) === 1) {
            timeout *= 1.5;
        }

        this.move(x, y);

        this.stepTimeout = setTimeout(this.step.bind(this), timeout);
    }

    walkTo(x, y) {
        if (this.stepTimeout) {
            return;
        }

        this.room.easystar.findPath(this.x, this.y, x, y, (path) => {
            if (!path) {
                return;
            }

            this.path = path;
            this.path.shift();

            this.step();
        });
    }

    chat(message) {
        this.room.chat(this, message);
    }

    joinRoom(room) {
        if (this.room === room) {
            log.error('already in room');
            return;
        }

        if (this.room) {
            this.exitRoom();
        }

        this.socket.send(
            JSON.stringify({
                type: 'join-room',
                ...room.encode()
            })
        );

        room.addCharacter(this);
    }

    exitRoom() {
        clearTimeout(this.stepTimeout);
        this.stepTimeout = null;

        this.room.removeCharacter(this);
    }
}

module.exports = Character;
