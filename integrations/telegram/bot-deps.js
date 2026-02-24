/**
 * Lazy-load heavy deps so telegram-bot.js can be required from server or run standalone.
 */
const path = require('path');

module.exports = {
    get db() { return () => require(path.join(__dirname, '../../core/db/database')); },
    get paContext() { return require(path.join(__dirname, '../pa/context')); },
};
