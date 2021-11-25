module.exports = {
    command: async (server, socket, message) => {
        // TODO check ranks

        const { character } = socket;

        switch (message.command) {
            case 'appearance':
                character.sendAppearancePanel();
                break;
            case 'item': {
                const [type, name] = message.args;
                let amount = Number(message.args[2]) || 1;
                character.addItem(type, name, amount);
                character.save();
                break;
            }
        }
    }
};
