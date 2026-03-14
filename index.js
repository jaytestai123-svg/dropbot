require('dotenv').config();
// Web server must bind port FIRST — Render kills process if port not claimed quickly
require('./web/server');
// Bot runs after
require('./bot/index');
