const {
  createDeck,
  shuffleDeck,
  dealHand,
  calculateScore,
  isGameOver
} = require('./server'); // Assuming server.js is in the same directory

describe('Game Logic Tests', () => {
  describe('createDeck', () => {
    it('should create a deck with 60 cards', () => {
      const deck = createDeck();
      expect(deck.length).toBe(60);
    });

    it('should have 12 cards of each color', () => {
      const deck = createDeck();
      const colors = ['red', 'green', 'blue', 'white', 'yellow'];
      colors.forEach(color => {
        expect(deck.filter(card => card.color === color).length).toBe(12);
      });
    });

    it('should have 3 wager cards (value 0) for each color', () => {
      const deck = createDeck();
      const colors = ['red', 'green', 'blue', 'white', 'yellow'];
      colors.forEach(color => {
        expect(deck.filter(card => card.color === color && card.value === 0).length).toBe(3);
      });
    });

    it('should have number cards 2-10 for each color', () => {
      const deck = createDeck();
      const colors = ['red', 'green', 'blue', 'white', 'yellow'];
      colors.forEach(color => {
        for (let value = 2; value <= 10; value++) {
          expect(deck.filter(card => card.color === color && card.value === value).length).toBe(1);
        }
      });
    });
  });

  describe('shuffleDeck', () => {
    it('should shuffle the deck (not be in the exact same order)', () => {
      const deck1 = createDeck(); // createDeck already shuffles, so let's make a simple ordered one for testing shuffle
      const orderedDeck = [];
      const colors = ['red', 'green', 'blue', 'white', 'yellow'];
      colors.forEach(color => {
        for (let i = 0; i < 3; i++) { orderedDeck.push({ color, value: 0 }); }
        for (let value = 2; value <= 10; value++) { orderedDeck.push({ color, value }); }
      });
      
      const deckSnapshot = JSON.stringify(orderedDeck);
      const shuffledDeck = shuffleDeck([...orderedDeck]); // Use a copy
      expect(JSON.stringify(shuffledDeck)).not.toBe(deckSnapshot);
      expect(shuffledDeck.length).toBe(orderedDeck.length);
    });

    it('should contain the same cards after shuffling', () => {
      const deck = createDeck();
      const originalCards = JSON.stringify(deck.sort((a,b) => a.color.localeCompare(b.color) || a.value - b.value));
      const shuffledDeck = shuffleDeck([...deck]);
      const shuffledCards = JSON.stringify(shuffledDeck.sort((a,b) => a.color.localeCompare(b.color) || a.value - b.value));
      expect(shuffledCards).toBe(originalCards);
    });
  });

  describe('dealHand', () => {
    it('should deal the specified number of cards', () => {
      const deck = createDeck();
      const hand = dealHand(deck, 8);
      expect(hand.length).toBe(8);
      expect(deck.length).toBe(60 - 8);
    });

    it('should deal 8 cards by default', () => {
      const deck = createDeck();
      const hand = dealHand(deck);
      expect(hand.length).toBe(8);
      expect(deck.length).toBe(60 - 8);
    });
  });

  describe('calculateScore', () => {
    it('should return 0 for empty expeditions', () => {
      const expeditions = { red: [], green: [], white: [], blue: [], yellow: [] };
      expect(calculateScore(expeditions)).toBe(0);
    });

    it('should calculate score correctly for a single expedition with numbers', () => {
      const expeditions = { red: [{color: 'red', value: 2}, {color: 'red', value: 5}, {color: 'red', value: 10}], green: [], white: [], blue: [], yellow: [] };
      // Score: -20 (cost) + 2 + 5 + 10 = -3. Multiplier = 1. Total = -3
      expect(calculateScore(expeditions)).toBe(-3);
    });

    it('should calculate score correctly with wager cards', () => {
      const expeditions = { blue: [{color: 'blue', value: 0}, {color: 'blue', value: 3}, {color: 'blue', value: 7}], red: [], green: [], white: [], yellow: [] };
      // Score: -20 (cost) + 3 + 7 = -10. Multiplier = 1 (base) + 1 (wager) = 2. Total = -10 * 2 = -20
      expect(calculateScore(expeditions)).toBe(-20);
    });
    
    it('should apply 8-card bonus', () => {
      const expeditions = { 
        yellow: [
          {color: 'yellow', value: 0}, {color: 'yellow', value: 2}, {color: 'yellow', value: 3}, {color: 'yellow', value: 4}, 
          {color: 'yellow', value: 5}, {color: 'yellow', value: 6}, {color: 'yellow', value: 7}, {color: 'yellow', value: 8}
        ],
        red: [], green: [], white: [], blue: []
      };
      // Values: 2+3+4+5+6+7+8 = 35
      // Cost: -20. Sum before bonus: 35 - 20 = 15
      // Bonus: +20. Sum after bonus: 15 + 20 = 35
      // Multiplier: 1 (base) + 1 (wager) = 2
      // Total: 35 * 2 = 70
      expect(calculateScore(expeditions)).toBe(70);
    });

    it('should calculate score for multiple expeditions', () => {
      const expeditions = {
        red: [{color: 'red', value: 5}, {color: 'red', value: 10}], // -20 + 15 = -5. -5 * 1 = -5
        blue: [{color: 'blue', value: 0}, {color: 'blue', value: 8}]  // -20 + 8 = -12. -12 * 2 = -24
      };
      expect(calculateScore(expeditions)).toBe(-5 - 24); // -29
    });
  });

  describe('isGameOver', () => {
    it('should return true if deck is empty', () => {
      const gameState = { deck: [] };
      expect(isGameOver(gameState)).toBe(true);
    });

    it('should return false if deck is not empty', () => {
      const gameState = { deck: [{color: 'red', value: 2}] };
      expect(isGameOver(gameState)).toBe(false);
    });
  });
});
