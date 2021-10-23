const furniture = require('coke-music-data/furniture.json');

class GameObject {
    constructor(server, room, { name, x, y, angle }) {
        this.server = server;
        this.room = room;

        this.name = name;

        Object.assign(this, furniture[this.name]);

        // characters sitting down
        //this.sitters = new Set();

        this.x = x;
        this.y = y;
        this.angle = angle || 0;
    }

    getTileWidth() {
        return this.angle <= 1 ? this.tileWidth : this.tileHeight;
    }

    getTileHeight() {
        return this.angle <= 1 ? this.tileHeight : this.tileWidth;
    }

    rotate() {
        this.angle = (this.angle + 1) % this.angles;
    }

    isBlocked() {
        if (this.x < 0 || this.y < 0) {
            return true;
        }

        const width = this.getTileWidth();
        const height = this.getTileHeight();

        for (let y = this.y; y < this.y + height; y += 1) {
            if (y >= this.room.height) {
                return true;
            }

            for (let x = this.x; x < this.x + width; x += 1) {
                if (x >= this.room.width) {
                    return true;
                }

                if (this.room.map[y][x]) {
                    return true;
                }

                const tileEntity = this.room.objectMap[y][x];

                if (
                    tileEntity &&
                    tileEntity !== this &&
                    tileEntity.constructor.name === 'GameObject'
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    toJSON() {
        return {
            name: this.name,
            x: this.x,
            y: this.y,
            angle: this.angle
        };
    }
}

module.exports = GameObject;
