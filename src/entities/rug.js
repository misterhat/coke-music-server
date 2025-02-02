const rugs = require('coke-music-data/rugs.json');

class Rug {
    constructor(server, room, { name, x, y }) {
        this.server = server;
        this.room = room;

        this.name = name;

        Object.assign(this, rugs[this.name]);

        this.x = x;
        this.y = y;
    }

    toJSON() {
        return {
            name: this.name,
            x: this.x,
            y: this.y
        };
    }
}

module.exports = Rug;
