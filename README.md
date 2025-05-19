# Lost Cities - Local Network Multiplayer Game

A web-based implementation of the classic card game Lost Cities that runs on your local network, allowing you and your wife to play against each other.

## Setup Instructions

### Prerequisites
- Node.js installed on your computer (download from [nodejs.org](https://nodejs.org/)) (for local non-Docker setup)
- Docker and Docker Compose installed (for Docker setup - download from [docker.com](https://www.docker.com/products/docker-desktop))

### Installation (Without Docker)

1. Create a new folder for your game
2. Create two files:
   - `server.js` - Copy the server code from the "Lost Cities Server" artifact
   - `public/index.html` - Create a `public` folder and copy the HTML code from the "Lost Cities - Local Network Multiplayer" artifact

3. Install the required packages:
```bash
npm init -y
npm install express socket.io
npm install --save-dev jest 
```

### Running the Game (Without Docker)

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

## Running with Docker

This is the recommended way to run the game as it simplifies setup and ensures a consistent environment.

### Prerequisites for Docker
- Docker installed on your computer.
- Docker Compose installed (usually comes with Docker Desktop).

### Setup
1.  Ensure you have the following files in your project's root directory:
    *   `Dockerfile`
    *   `compose.yaml`
    *   `server.js`
    *   `package.json`
    *   `package-lock.json`
    *   The `public` directory with `index.html` inside it.
    (These files should already be present if you cloned the repository after the Docker setup was added.)

### Running the Game with Docker

1.  Open a terminal or command prompt in the root directory of the project.

2.  Build and start the Docker containers:
    ```bash
    docker-compose up --build
    ```
    To run in the background (detached mode):
    ```bash
    docker-compose up --build -d
    ```

3.  The server will be running inside a Docker container. It will display its local IP address and port (typically 3000) in the Docker logs if you are not running in detached mode. If you are running in detached mode, you can view logs with `docker-compose logs -f lost-cities-server`.

4.  On both devices (your computer and your wife's device):
    *   Open a web browser.
    *   Navigate to `http://YOUR_HOST_IP:3000` (replacing `YOUR_HOST_IP` with the IP address of the computer running the Docker container on your local network).

5.  On your device:
    *   Enter your name.
    *   The server address should be `http://YOUR_HOST_IP:3000`.
    *   Click "Create Game".

6.  On your wife's device:
    *   Enter her name.
    *   Enter the same server address (`http://YOUR_HOST_IP:3000`).
    *   Click "Join Game".

7.  The game will start automatically once both players have joined!

### Stopping the Game (Docker)

To stop the Docker containers:
```bash
docker-compose down
```
If you ran in detached mode, this command will stop and remove the containers. If you ran in attached mode (without `-d`), you can usually stop it by pressing `Ctrl+C` in the terminal where it's running, and then run `docker-compose down` to ensure containers are removed.

## Troubleshooting

### General
- If you cannot connect, make sure both devices are on the same network.
- Check your firewall settings on the computer running the server/Docker container. Ensure incoming connections on port 3000 are allowed.
- Restart the server (or Docker containers) if any issues occur.

### Docker Specific
- If `docker-compose up` fails, check the error messages. It might be due to port 3000 already being in use on your host machine, or issues with the Docker installation.
- Ensure Docker Desktop (or Docker daemon) is running.

Enjoy playing Lost Cities with your wife!

## Running Tests (Server Logic)

To run the automated tests for the server logic:

```bash
npm test
```
