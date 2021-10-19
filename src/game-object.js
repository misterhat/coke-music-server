const furniture = require('coke-music-data/furniture.json');

class GameObject {
    constructor(server, { name, x, y, angle }) {
        this.server = server;

        this.name = name;

        Object.assign(this, furniture[this.name]);

        this.x = x;
        this.y = y;
        this.angle = angle || 0;
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
