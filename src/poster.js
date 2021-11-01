const posters = require('coke-music-data/posters.json');

class Poster {
    constructor(server, room, { name, x, y }) {
        this.server = server;
        this.room = room;

        this.name = name;

        Object.assign(this, posters[this.name]);

        this.x = x;
        this.y = y;
    }

    toJSON() {
        return {
            name: this.name,
            x: this.x,
            y: this.y
        }
    }
}

module.exports = Poster;
