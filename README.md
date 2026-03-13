# 🎉 DropBot — Discord Giveaway Bot

> The only giveaway bot with built-in VerifyGuard anti-cheat, entry requirements, bonus entries, and a web dashboard.

## Features
- 🛡️ VerifyGuard anti-cheat (alt blocking, VPN detection, risk scoring)
- 📋 Entry requirements (role, boost, membership age, account age)
- ✨ Bonus entries (role multipliers, boost rewards)
- 🌐 Web dashboard
- 🤝 Collab giveaways
- 📊 Analytics
- 🔁 Recurring giveaways
- 📨 Auto-DM winners

## Commands
| Command | Description |
|---|---|
| `/gstart` | Start a new giveaway |
| `/gend` | End a giveaway early |
| `/gdelete` | Delete a giveaway |
| `/greroll` | Reroll winners |
| `/glist` | List active giveaways |
| `/gsettings` | Configure DropBot |

## Setup
1. Clone repo
2. Copy `.env.example` to `.env` and fill in values
3. `npm install`
4. `npm run deploy` (deploy slash commands)
5. `npm start`

## VerifyGuard Integration
DropBot connects to VerifyGuard's database to verify users before they can enter giveaways. Point `VERIFYGUARD_DB` to your VerifyGuard SQLite database path.
