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

// Define order for card colors
const colorOrder = ['red', 'green', 'blue', 'white', 'yellow'];

// Sorts a player's hand by color, then by value (wagers first, then 2-10)
function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const colorComparison = colorOrder.indexOf(a.color) - colorOrder.indexOf(b.color);
    if (colorComparison !== 0) {
      return colorComparison;
    }
    // Wager cards (value 0) come before numbered cards
    if (a.value === 0 && b.value !== 0) return -1;
    if (a.value !== 0 && b.value === 0) return 1;
    return a.value - b.value;
  });
}

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
  const details = { red: 0, green: 0, blue: 0, white: 0, yellow: 0 };

  Object.keys(expeditions).forEach(color => {
    const expedition = expeditions[color];
    let expeditionScore = 0;

    if (expedition.length === 0) {
      details[color] = 0;
      return;
    }

    expeditionScore = -20; // Starting cost for expedition
    let multiplier = 1;

    expedition.forEach(card => {
      if (card.value === 0) { // Investment card
        multiplier++;
      } else { // Number card
        expeditionScore += card.value;
      }
    });

    if (expedition.length >= 8) {
      expeditionScore += 20; // Expedition bonus
    }

    expeditionScore *= multiplier;
    
    // Ensure score is not less than 0 after multiplier if initial sum was negative (e.g. -20 * 1)
    // However, the rules imply that the cost is part of the sum before multiplication.
    // E.g. (-20 + 5) * 2 = -30. If only one wager, (-20) * 2 = -40. This seems correct.
    details[color] = expeditionScore;
    totalScore += expeditionScore;
  });

  return { total: totalScore, details };
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

  const playerScoreData = calculateScore(playerState.expeditions);
  const opponentScoreData = opponentState 
    ? calculateScore(opponentState.expeditions) 
    : { total: 0, details: { red: 0, green: 0, blue: 0, white: 0, yellow: 0 } };
  
  return {
    currentTurn: game.currentTurn, // This will be a persistentPlayerId
    gamePhase: game.gamePhase,
    hand: playerState.hand,
    playerExpeditions: playerState.expeditions,
    opponentExpeditions: opponentState ? opponentState.expeditions : {},
    discardPiles: game.discardPiles,
    deckCount: game.deck.length,
    playerScore: playerScoreData.total,
    playerScoreDetails: playerScoreData.details,
    opponentScore: opponentScoreData.total,
    opponentScoreDetails: opponentScoreData.details,
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
      gamePhase: 'waiting',
      lastMoveDiscardInfo: null // To track the card just discarded in the current turn
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
    
    // Store info about this discard for the current turn
    game.lastMoveDiscardInfo = {
      playerId: persistentPlayerId,
      card: { color: discardedCard.color, value: discardedCard.value }, // Store a copy of card details
      pileColor: color // The color of the pile it was discarded to
    };
    
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
      // Check if trying to draw the card just discarded this turn by the same player
      if (game.lastMoveDiscardInfo &&
          game.lastMoveDiscardInfo.playerId === persistentPlayerId &&
          game.lastMoveDiscardInfo.pileColor === color) {
        
        const pile = game.discardPiles[color];
        // Ensure the pile is not empty and the top card matches the one recorded as just discarded
        if (pile.length > 0) {
            const topCardOnPile = pile[pile.length - 1];
            if (topCardOnPile.color === game.lastMoveDiscardInfo.card.color && 
                topCardOnPile.value === game.lastMoveDiscardInfo.card.value) {
                
                socket.emit('error', { message: 'You cannot draw the card you just discarded this turn.' });
                return;
            }
        }
      }

      // Draw from discard pile
      if (!color || !game.discardPiles[color] || game.discardPiles[color].length === 0) { // Added check for existence of discardPiles[color]
        socket.emit('error', { message: 'Invalid or empty discard pile' });
        return;
      }
      
      drawnCard = game.discardPiles[color].pop();
    } else {
      socket.emit('error', { message: 'Invalid draw source' });
      return;
    }
    
    // Add card to hand
    playerData.hand.push(drawnCard);
    playerData.hand = sortHand(playerData.hand); // Sort the hand after drawing

    // Clear the last discard info as a draw action has been successfully completed
    game.lastMoveDiscardInfo = null;

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
      if (game) {
        const disconnectedPlayerDetails = game.players[persistentPlayerId];
        const disconnectedPlayerName = disconnectedPlayerDetails ? disconnectedPlayerDetails.name : 'A player';

        console.log(`Player ${persistentPlayerId} (${disconnectedPlayerName}) disconnected from game ${gameId}.`);

        // Remove the disconnected player from the game
        if (disconnectedPlayerDetails) {
          delete game.players[persistentPlayerId];
        }

        // Notify the other player, if any, that their opponent has left and the game is over.
        const remainingPlayers = Object.values(game.players);
        if (remainingPlayers.length > 0) {
          const otherPlayer = remainingPlayers[0]; // Assuming a 2-player game, only one would be left.
          if (otherPlayer.currentSocketId) {
            io.to(otherPlayer.currentSocketId).emit('opponentDisconnected', {
              message: `${disconnectedPlayerName} has disconnected. The game is over.`,
              playerName: disconnectedPlayerName
            });
          }
        }
        
        // Clean up the game since it can't continue without the disconnected player
        console.log(`Game ${gameId} ended due to disconnection. Cleaning up.`);
        // Remove any other players associated with this game from the global players map
        Object.values(game.players).forEach(p => {
          if (p.currentSocketId && players[p.currentSocketId]) {
            delete players[p.currentSocketId];
          }
        });
        delete games[gameId];
      }
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
    player.hand = sortHand(player.hand); // Sort the hand after dealing
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

// Start the server only if this script is run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Local IP: ${getLocalIpAddress()}`);
  });
}

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
