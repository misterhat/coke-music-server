const camelcaseKeys = require('camelcase-keys');

const STATEMENTS = {
    characterExists: 'SELECT 1 FROM `characters` WHERE `username` = ?',
    insertCharacter:
        'INSERT INTO `characters` ' +
        '(`username`, `password`, `register_date`, `register_ip`) ' +
        'VALUES (:username, :password, :date, :ip)',
    getCharacter: 'SELECT * FROM `characters` WHERE `username` = ? LIMIT 1',
    insertRoom:
        'INSERT INTO `rooms` (`owner_id`, `studio`, `name`) ' +
        'VALUES (:owner_id, :studio, :name)',
    getLastRowID: 'SELECT last_insert_rowid() AS `id`',
    getRooms:
        'SELECT `rooms`.*, `characters`.`username` AS `owner_name` ' +
        'FROM `rooms` JOIN `characters` ' +
        'ON `characters`.`id` = `rooms`.`owner_id`'
};

class QueryHandler {
    constructor(database) {
        this.database = database;

        this.statements = {};

        for (const [name, statement] of Object.entries(STATEMENTS)) {
            this.statements[name] = this.database.prepare(statement);
        }
    }

    characterExists(username) {
        return !!this.statements.characterExists.get(username);
    }

    insertCharacter(character) {
        const values = { ...character, date: Date.now() };

        this.statements.insertCharacter.run(values);
    }

    getCharacter(username) {
        return this.statements.getCharacter.get(username);
    }

    insertRoom(room) {
        // TODO date for throttle
        this.statements.insertRoom.run(room);
        return this.statements.getLastRowID.get()['id'];
    }

    getRooms() {
        return this.statements.getRooms
            .all()
            .map((room) => camelcaseKeys(room));
    }
}

module.exports = QueryHandler;
