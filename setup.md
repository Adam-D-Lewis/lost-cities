# Lost Cities - Local Network Multiplayer Game

A web-based implementation of the classic card game Lost Cities that runs on your local network, allowing you and your wife to play against each other.

## Setup Instructions

### Prerequisites
- Node.js installed on your computer (download from [nodejs.org](https://nodejs.org/))

### Installation

1. Create a new folder for your game
2. Create two files:
   - `server.js` - Copy the server code from the "Lost Cities Server" artifact
   - `public/index.html` - Create a `public` folder and copy the HTML code from the "Lost Cities - Local Network Multiplayer" artifact

3. Install the required packages:
```bash
npm init -y
npm install express socket.io
```

### Running the Game

1. Start the server:
```bash
node server.js
```

2. The server will display its local IP address and port (typically 3000)

3. On both devices (your computer and your wife's device):
   - Open a web browser
   - Navigate to `http://YOUR_SERVER_IP:3000` (replacing YOUR_SERVER_IP with the IP address shown in the server console)

4. On your device:
   - Enter your name
   - Enter the server address (should already be correct)
   - Click "Create Game"

5. On your wife's device:
   - Enter her name
   - Enter the same server address
   - Click "Join Game"

6. The game will start automatically once both players have joined!

## Game Rules

Lost Cities is a card game for two players designed by Reiner Knizia:

- The goal is to mount profitable expeditions to five different locations
- Each expedition (color) consists of cards numbered 2-10 and investment cards
- Players can only place cards on their own expeditions
- Cards must be played in ascending order on each expedition
- Starting an expedition costs 20 points, so be careful which ones you start!
- Investment cards must be played before number cards and multiply your points
- The game ends when the draw deck is exhausted
- Expeditions with 8+ cards get a 20 point bonus

### Turn Structure

On your turn:
1. First play or discard a card from your hand
2. Then draw a card from either the deck or any discard pile
3. The game will then pass to your opponent

### Scoring

- Each expedition starts with a -20 point penalty
- Add the value of all number cards in the expedition
- Multiply the total by the number of investment cards + 1
- Add 20 points bonus if you have 8+ cards in an expedition
- Sum up all expeditions for your final score

## Troubleshooting

- If you cannot connect, make sure both devices are on the same network
- Check your firewall settings if you have connection issues
- Restart the server if any issues occur

Enjoy playing Lost Cities with your wife!