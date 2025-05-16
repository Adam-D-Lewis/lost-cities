const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the index.html file for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const { networkInterfaces } = require('os'); // Moved for consistency

// Game state
const games = {}; // Stores game states, keyed by gameId
const players = {}; // Maps current socket.id to { gameId, persistentPlayerId }

// Helper functions
function createDeck() {
  const deck = [];
  const colors = ['red', 'green', 'blue', 'white', 'yellow'];
  
  // Create cards for each color
  colors.forEach(color => {
    // Investment/wager cards (value 0)
    for (let i = 0; i < 3; i++) {
      deck.push({ color, value: 0 });
    }
    
    // Number cards (values 2-10)
    for (let value = 2; value <= 10; value++) {
      deck.push({ color, value });
    }
  });
  
  return shuffleDeck(deck);
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function dealHand(deck, numCards = 8) {
  return deck.splice(0, numCards);
}

function calculateScore(expeditions) {
  let totalScore = 0;
  
  // Calculate score for each expedition
  Object.keys(expeditions).forEach(color => {
    const expedition = expeditions[color];
    
    // Skip empty expeditions
    if (expedition.length === 0) {
      return;
    }
    
    let score = -20; // Starting cost for expedition
    let multiplier = 1;
    
    // Calculate score for each card
    expedition.forEach(card => {
      if (card.value === 0) {
        // Investment card (wager)
        multiplier++;
      } else {
        // Number card
        score += card.value;
      }
    });
    
    // Add expedition bonus if 8 or more cards
    if (expedition.length >= 8) {
      score += 20;
    }
    
    // Apply multiplier
    score *= multiplier;
    
    // Add to total score
    totalScore += score;
  });
  
  return totalScore;
}

function isGameOver(gameState) {
  return gameState.deck.length === 0;
}

function getGameStateForPlayer(gameId, playerId) {
  const game = games[gameId];
  if (!game) return null;
  
  const playerState = game.players[playerId];
  if (!playerState) return null; // Player not found in game

  const opponentId = Object.keys(game.players).find(id => id !== playerId);
  const opponentState = opponentId ? game.players[opponentId] : null;
  
  return {
    currentTurn: game.currentTurn, // This will be a persistentPlayerId
    gamePhase: game.gamePhase,
    hand: playerState.hand,
    playerExpeditions: playerState.expeditions,
    opponentExpeditions: opponentState ? opponentState.expeditions : {},
    discardPiles: game.discardPiles,
    deckCount: game.deck.length,
    playerScore: calculateScore(playerState.expeditions),
    opponentScore: opponentState ? calculateScore(opponentState.expeditions) : 0,
    playerName: playerState.name,
    opponentName: opponentState ? opponentState.name : 'Opponent'
    // Note: The client's own persistentPlayerId is already known by the client or sent during join/create/reconnect.
  };
}

// Send game state to a single player
function sendGameStateToPlayer(gameId, persistentPlayerId, targetSocketId) {
  const playerGameState = getGameStateForPlayer(gameId, persistentPlayerId);
  if (playerGameState && targetSocketId) {
    io.to(targetSocketId).emit('gameState', playerGameState);
  }
}

// Send game state to all players in a game
function sendGameStateToPlayers(gameId) {
  const game = games[gameId];
  if (!game) return;
  
  Object.values(game.players).forEach(player => {
    if (player.currentSocketId) { // Only send to connected players
      sendGameStateToPlayer(gameId, player.id, player.currentSocketId);
    }
  });
}

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  
  // Create a new game
  socket.on('createGame', (data) => {
    const persistentPlayerId = socket.id; // Use initial socket.id as persistentPlayerId
    const gameId = `game_${Date.now()}`;
    const playerName = data.playerName || 'Player 1';
    
    // Create new game
    games[gameId] = {
      id: gameId,
      host: persistentPlayerId, // Store persistentPlayerId of host
      players: {
        [persistentPlayerId]: {
          id: persistentPlayerId, // Store persistentPlayerId
          name: playerName,
          currentSocketId: socket.id, // Store current socket for communication
          hand: [],
          expeditions: {
            red: [],
            green: [],
            white: [],
            blue: [],
            yellow: []
          }
        }
      },
      deck: [],
      discardPiles: {
        red: [],
        green: [],
        white: [],
        blue: [],
        yellow: []
      },
      currentTurn: null,
      gamePhase: 'waiting'
    };
    
    // Associate player with game
    players[socket.id] = { // Map current socket.id
      gameId,
      persistentPlayerId
    };
    
    // Join the game room
    socket.join(gameId);
    
    console.log(`Game created: ${gameId}, Host: ${persistentPlayerId} (Socket: ${socket.id})`);
    
    // Notify client
    socket.emit('gameCreated', {
      gameId,
      playerId: persistentPlayerId // Send persistentPlayerId to client
    });
  });
  
  // Join an existing game
  socket.on('joinGame', (data) => {
    const persistentPlayerId = socket.id; // Use initial socket.id as persistentPlayerId
    const playerName = data.playerName || 'Player 2';
    
    // Find an available game
    const availableGames = Object.values(games).filter(game => Object.keys(game.players).length < 2);
    
    if (availableGames.length === 0) {
      socket.emit('error', { message: 'No available games to join' });
      return;
    }
    
    const game = availableGames[0];
    const gameId = game.id;
    const hostPersistentId = game.host;
    
    // Add player to game
    game.players[persistentPlayerId] = {
      id: persistentPlayerId, // Store persistentPlayerId
      name: playerName,
      currentSocketId: socket.id, // Store current socket for communication
      hand: [],
      expeditions: {
        red: [],
        green: [],
        white: [],
        blue: [],
        yellow: []
      }
    };
    
    // Associate player with game
    players[socket.id] = { // Map current socket.id
      gameId,
      persistentPlayerId
    };
    
    // Join the game room
    socket.join(gameId);
    
    console.log(`Player ${persistentPlayerId} (Socket: ${socket.id}) joined game ${gameId}`);
    
    // Notify client
    socket.emit('gameJoined', {
      gameId,
      playerId: persistentPlayerId, // Send persistentPlayerId to client
      hostName: game.players[hostPersistentId].name
    });
    
    // Notify host
    const hostPlayer = game.players[hostPersistentId];
    if (hostPlayer && hostPlayer.currentSocketId) {
      socket.to(hostPlayer.currentSocketId).emit('playerJoined', {
        playerId: persistentPlayerId, // Send persistentPlayerId
        playerName
      });
    }
    
    // If we now have 2 players, start the game
    if (Object.keys(game.players).length === 2) {
      startGame(gameId);
    }
  });
  
  // Play a card
  socket.on('playCard', (data) => {
    const playerInfo = players[socket.id];
    if (!playerInfo) {
      socket.emit('error', { message: 'Player not recognized.' });
      return;
    }
    const { gameId, persistentPlayerId } = playerInfo;
    const game = games[gameId];
    
    if (!game || game.currentTurn !== persistentPlayerId || game.gamePhase !== 'selectCard') {
      socket.emit('error', { message: 'Invalid move (not your turn or wrong game phase).' });
      return;
    }
    
    const { cardIndex, target } = data;
    const playerData = game.players[persistentPlayerId];
    
    // Check if card index is valid
    if (cardIndex < 0 || cardIndex >= playerData.hand.length) {
      socket.emit('error', { message: 'Invalid card index' });
      return;
    }
    
    const card = playerData.hand[cardIndex];
    
    // Check if target is valid
    if (card.color !== target) {
      socket.emit('error', { message: `Can only play ${card.color} cards on the ${card.color} expedition` });
      return;
    }
    
    // Check if card value is valid (must be ascending)
    const expedition = playerData.expeditions[target];
    if (expedition.length > 0) {
      const lastCardValue = expedition[expedition.length - 1].value;
      if (card.value <= lastCardValue && lastCardValue !== 0) {
        socket.emit('error', { message: `Card value must be higher than the last card (${lastCardValue})` });
        return;
      }
    }
    
    // Remove card from hand
    const playedCard = playerData.hand.splice(cardIndex, 1)[0];
    
    // Add card to expedition
    playerData.expeditions[target].push(playedCard);
    
    // Notify all players
    io.to(gameId).emit('cardPlayed', {
      playerId: persistentPlayerId, // Send persistentPlayerId
      card: playedCard,
      target
    });
    
    // Update game phase
    game.gamePhase = 'drawCard';
    
    // Send updated game state to players
    sendGameStateToPlayers(gameId);
  });
  
  // Discard a card
  socket.on('discardCard', (data) => {
    const playerInfo = players[socket.id];
    if (!playerInfo) {
      socket.emit('error', { message: 'Player not recognized.' });
      return;
    }
    const { gameId, persistentPlayerId } = playerInfo;
    const game = games[gameId];
    
    if (!game || game.currentTurn !== persistentPlayerId || game.gamePhase !== 'selectCard') {
      socket.emit('error', { message: 'Invalid move (not your turn or wrong game phase).' });
      return;
    }
    
    const { cardIndex, color } = data;
    const playerData = game.players[persistentPlayerId];
    
    // Check if card index is valid
    if (cardIndex < 0 || cardIndex >= playerData.hand.length) {
      socket.emit('error', { message: 'Invalid card index' });
      return;
    }
    
    // Remove card from hand
    const discardedCard = playerData.hand.splice(cardIndex, 1)[0];
    
    // Add card to discard pile
    game.discardPiles[color].push(discardedCard);
    
    // Notify all players
    io.to(gameId).emit('cardDiscarded', {
      playerId: persistentPlayerId, // Send persistentPlayerId
      card: discardedCard,
      color
    });
    
    // Update game phase
    game.gamePhase = 'drawCard';
    
    // Send updated game state to players
    sendGameStateToPlayers(gameId);
  });
  
  // Draw a card
  socket.on('drawCard', (data) => {
    const playerInfo = players[socket.id];
    if (!playerInfo) {
      socket.emit('error', { message: 'Player not recognized.' });
      return;
    }
    const { gameId, persistentPlayerId } = playerInfo;
    const game = games[gameId];
    
    if (!game || game.currentTurn !== persistentPlayerId || game.gamePhase !== 'drawCard') {
      socket.emit('error', { message: 'Invalid move (not your turn or wrong game phase).' });
      return;
    }
    
    const { source, color } = data; // color is for discard pile source
    const playerData = game.players[persistentPlayerId];
    
    let drawnCard;
    
    if (source === 'deck') {
      // Draw from deck
      if (game.deck.length === 0) {
        socket.emit('error', { message: 'Deck is empty' });
        return;
      }
      
      drawnCard = game.deck.pop();
    } else if (source === 'discard') {
      // Draw from discard pile
      if (!color || game.discardPiles[color].length === 0) {
        socket.emit('error', { message: 'Invalid discard pile' });
        return;
      }
      
      drawnCard = game.discardPiles[color].pop();
    } else {
      socket.emit('error', { message: 'Invalid draw source' });
      return;
    }
    
    // Add card to hand
    playerData.hand.push(drawnCard);
    
    // Notify all players
    io.to(gameId).emit('cardDrawn', {
      playerId: persistentPlayerId, // Send persistentPlayerId
      source,
      color // color of the discard pile drawn from, if applicable
    });
    
    // Check if game is over
    if (isGameOver(game)) {
      // Calculate final scores
      const finalScores = {};
      Object.keys(game.players).forEach(pId => {
        finalScores[pId] = calculateScore(game.players[pId].expeditions);
      });
      
      // Notify all players
      io.to(gameId).emit('gameOver', { scores: finalScores });
      
      // Clean up game (and associated player mappings)
      Object.keys(game.players).forEach(pId => {
        const playerSocketId = game.players[pId].currentSocketId;
        if (playerSocketId && players[playerSocketId]) {
          delete players[playerSocketId];
        }
      });
      delete games[gameId];
      console.log(`Game ${gameId} ended and cleaned up.`);
      return;
    }
    
    // Change turn to next player
    const persistentPlayerIds = Object.keys(game.players);
    const currentIndex = persistentPlayerIds.indexOf(game.currentTurn);
    game.currentTurn = persistentPlayerIds[(currentIndex + 1) % persistentPlayerIds.length];
    
    // Update game phase
    game.gamePhase = 'selectCard';
    
    // Notify all players of turn change
    io.to(gameId).emit('turnChanged', {
      currentTurn: game.currentTurn,
      gamePhase: game.gamePhase
    });
    
    // Send updated game state to players
    sendGameStateToPlayers(gameId);
  });
  
  // Handle disconnections
  socket.on('disconnect', () => {
    const playerInfo = players[socket.id];
    console.log(`Socket disconnected: ${socket.id}`);
    
    if (playerInfo) {
      const { gameId, persistentPlayerId } = playerInfo;
      delete players[socket.id]; // Remove mapping for this socket

      const game = games[gameId];
      if (game && game.players[persistentPlayerId]) {
        console.log(`Player ${persistentPlayerId} disconnected from game ${gameId}`);
        const disconnectedPlayerName = game.players[persistentPlayerId].name;
        game.players[persistentPlayerId].currentSocketId = null; // Mark as disconnected

        // Notify other player(s)
        const otherPlayer = Object.values(game.players).find(p => p.id !== persistentPlayerId);
        if (otherPlayer && otherPlayer.currentSocketId) {
          io.to(otherPlayer.currentSocketId).emit('playerDisconnected', {
            playerId: persistentPlayerId,
            playerName: disconnectedPlayerName
          });
        }

        // Check if all players are disconnected
        const activePlayers = Object.values(game.players).filter(p => p.currentSocketId !== null);
        if (activePlayers.length === 0 && Object.keys(game.players).length > 0) { // Ensure game wasn't already cleaned up
          console.log(`Game ${gameId} has no active players. Cleaning up.`);
          delete games[gameId]; 
          // Player entries in global `players` map are already handled or will be on their disconnect
        }
      }
    }
  });

  // Reconnect to a game
  socket.on('reconnectGame', (data) => {
    const { gameId, playerId, playerName } = data; // playerId is persistentPlayerId
    const newSocketId = socket.id;

    console.log(`Attempting reconnect for player ${playerId} to game ${gameId} with new socket ${newSocketId}`);
    const game = games[gameId];

    if (game && game.players[playerId]) {
      const playerToReconnect = game.players[playerId];
      
      // Only allow reconnect if the slot is marked as disconnected or if it's the same persistentId trying to re-establish
      // This also implicitly checks if playerToReconnect.id === playerId
      if (playerToReconnect.currentSocketId === null || playerToReconnect.id === playerId) {
        // If there was an old socket for this persistentPlayerId in the global players map, remove it
        // This handles cases where a player might have an old entry in `players` if a disconnect event was missed
        for (const sockId in players) {
            if (players[sockId].persistentPlayerId === playerId && sockId !== newSocketId) {
                delete players[sockId];
                break;
            }
        }

        playerToReconnect.currentSocketId = newSocketId;
        playerToReconnect.name = playerName || playerToReconnect.name; // Update name if provided
        
        players[newSocketId] = { gameId, persistentPlayerId: playerId };
        socket.join(gameId);

        socket.emit('reconnected', { gameId, playerId, message: 'Reconnected successfully.' });
        sendGameStateToPlayer(gameId, playerId, newSocketId); // Send current game state

        // Notify other player
        const otherPlayer = Object.values(game.players).find(p => p.id !== playerId);
        if (otherPlayer && otherPlayer.currentSocketId) {
          io.to(otherPlayer.currentSocketId).emit('playerReconnected', {
            playerId,
            playerName: playerToReconnect.name
          });
        }
        console.log(`Player ${playerId} reconnected to game ${gameId} with new socket ${newSocketId}`);
      } else {
        socket.emit('error', { message: 'Failed to reconnect. Session may be active elsewhere or slot taken.' });
        console.log(`Reconnect failed for ${playerId}: slot not null or ID mismatch. Current socket for slot: ${playerToReconnect.currentSocketId}`);
      }
    } else {
      socket.emit('error', { message: 'Game or player not found for reconnection.' });
      console.log(`Reconnect failed for ${playerId}: Game ${gameId} or player not found in game.players.`);
    }
  });
});

// Start a game
function startGame(gameId) {
  const game = games[gameId];
  if (!game) return;
  
  console.log(`Starting game ${gameId}`);
  
  // Create and shuffle deck
  game.deck = createDeck();
  
  // Deal cards to players
  Object.values(game.players).forEach(player => { // Iterate over player objects
    player.hand = dealHand(game.deck);
  });
  
  // Randomly choose first player (using persistentPlayerIds)
  const persistentPlayerIds = Object.keys(game.players);
  game.currentTurn = persistentPlayerIds[Math.floor(Math.random() * persistentPlayerIds.length)];
  
  // Set initial game phase
  game.gamePhase = 'selectCard';
  
  // Notify players that game has started
  io.to(gameId).emit('gameStarted', {
    currentTurn: game.currentTurn
  });
  
  // Send initial game state to players
  sendGameStateToPlayers(gameId);
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local IP: ${getLocalIpAddress()}`);
});

// Helper function to get local IP address (os is required at the top now)
function getLocalIpAddress() {
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (loopback) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  
  return 'localhost';
}

// Export functions for testing
module.exports = {
  createDeck,
  shuffleDeck,
  dealHand,
  calculateScore,
  isGameOver
  // Note: getGameStateForPlayer, sendGameStateToPlayer, sendGameStateToPlayers, startGame, getLocalIpAddress
  // are not easily unit-testable without more significant refactoring or mocking io/games/players,
  // so they are omitted for now. Focus is on pure helper functions.
};
