require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.WEB_PORT || 3001;

// Public landing page
app.use(express.static(path.join(__dirname, '../website')));

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`🌐 DropBot web server on port ${PORT}`));
