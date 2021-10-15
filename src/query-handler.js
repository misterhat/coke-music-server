const STATEMENTS = {
    characterExists: 'SELECT 1 FROM `characters` WHERE `username` = ?',
    insertCharacter:
        'INSERT INTO `characters` ' +
        '(`username`, `password`, `register_date`, `register_ip`) ' +
        'VALUES (:username, :password, :date, :ip)',
    getCharacter: 'SELECT * FROM `characters` WHERE `username` = ? LIMIT 1'
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
}

module.exports = QueryHandler;
