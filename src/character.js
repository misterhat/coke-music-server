const log = require('bole')('character');

const STEP_TIMEOUT = 500;

// [deltaX][deltaY] = spriteOffset
// to determine which direction should display which sprite
const WALK_ANGLE_DELTAS = {
    '-1': {
        1: 1,
        '-1': 3,
        0: 2
    },
    1: {
        1: 4,
        '-1': 6,
        0: 5
    },
    0: {
        1: 0,
        '-1': 7,
        0: 3
    }
};

class Character {
    constructor(server, { id, username, inventory }) {
        this.server = server;

        this.username = username;
        this.id = id;
        this.inventory = inventory;

        this.room = null;

        this.angle = 0;
        this.x = 0;
        this.y = 0;

        // when to send the next step
        this.stepTimeout = null;

        this.exitTimeout = null;
    }

    move(x, y) {
        clearTimeout(this.exitTimeout);

        this.room.moveCharacter(this, x, y);

        const deltaX = this.x - x;
        const deltaY = this.y - y;

        this.angle = WALK_ANGLE_DELTAS[deltaX][deltaY];
        this.x = x;
        this.y = y;

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
            JSON.stringify({ type: 'join-room', ...room.toJSON() })
        );

        room.addCharacter(this);
    }

    exitRoom() {
        clearTimeout(this.stepTimeout);
        this.stepTimeout = null;

        this.room.removeCharacter(this);
    }

    sendInventory() {
        this.socket.send(
            JSON.stringify({ type: 'inventory', items: this.inventory })
        );
    }

    addItem(type, name) {
        this.inventory.push({ type, name });
        this.sendInventory();
    }

    hasItem(type, name) {
        let hasItem = false;

        for (const item of this.inventory) {
            if (item.type === type && item.name === name) {
                hasItem = true;
            }
        }

        return hasItem;
    }

    removeItem(type, name) {
        let removed = false;

        for (let i = 0; i < this.inventory.length; i += 1) {
            const item = this.inventory[i];

            if (item.type === type && item.name === name) {
                removed = true;
                this.inventory.splice(i, 1);
                this.sendInventory();
                break;
            }
        }

        return removed;
    }

    save() {
        this.server.queryHandler.updateCharacter(this);
    }

    toJSON() {
        return {
            id: this.id,
            username: this.username,
            angle: this.angle,
            x: this.x,
            y: this.y
        };
    }
}

module.exports = Character;
