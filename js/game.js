/**
 * Game Class - Main Game Logic v2.2
 * ВИПРАВЛЕННЯ:
 * - 1 гравець: Гр1 - Центр (в ряд, однаковий розмір)
 * - 2 гравці: Гр1 - Центр - Гр2 (в ряд)
 * - Таймер зверху по центру (для 1 гравця)
 * - Панель гравців зверху (для 2-4 гравців)
 * - Максимум 4 гравці (без 5)
 */

import { loadDeckSymbols } from './assets-loader.js';
import { CardRenderer } from './card-renderer.js';
import { t } from './translations.js';

// Раскладка поля: высота подписи под картой, доля ячейки под карту, границы размера карты (px)
const LABEL_HEIGHT = 34;
const CELL_FILL = 0.9;
const MAX_CARD_SIZE = 520;
const MIN_CARD_SIZE = 64;

export class Game {
  constructor(config) {
    this.config = config;
    this.lang = config.lang || 'ua';
    this.moveTime = config.moveTime || 60; // seconds for single player move
    this.state = {
      players: config.players,
      difficulty: config.difficulty,
      deck: null,
      currentCentralCard: null,
      playerCards: [],
      scores: [],
      isPaused: false,
      isGameOver: false,
      timerInterval: null,
      timeRemaining: this.moveTime,
      timeElapsed: 0,
      correctClicks: 0,
      wrongClicks: 0,
      moveExpired: false, // Track if current move timed out
      roundState: {
        selectedPlayerCard: null,
        selectedSymbolId: null,
        firstClickTimestamp: null,
        clickedPlayers: []
      }
    };

    this.assets = config.assets;
    this.board = null;
    this.renderer = new CardRenderer();
    this.eventHandlers = new Map();
    // Колбэк конца игры: main.js показывает экран результатов
    this.onGameOver = config.onGameOver || null;
    // После destroy() отложенные таймеры ничего не должны делать
    this.isDestroyed = false;
    this.elapsedInterval = null;
    this.resizeObserver = null;
    this.lastBoardSize = null;
  }

  async init(boardElement) {
    console.log('🎮 Game.init() v2.2 - 1 player in row + Timer top');
    this.board = boardElement;

    const deckData = this.assets.decks[this.config.difficulty];
    if (!deckData) {
      throw new Error(`Deck not found for difficulty: ${this.config.difficulty}`);
    }

    await loadDeckSymbols(deckData, this.assets);
    this.state.deck = this.shuffleArray([...deckData.cards]);
    
    console.log(`🎴 Deck loaded: ${this.state.deck.length} cards`);

    this.state.scores = Array(this.config.players).fill(0).map((_, i) => ({
      playerId: i + 1,
      playerIndex: i,
      cards: 1,
      color: this.getPlayerColor(i),
      name: `${t('player', this.lang)} ${i + 1}`
    }));

    this.dealInitialCards();

    // Add multiplayer class for minimal spacing
    if (this.config.players >= 3) {
      this.board.classList.add(`multiplayer-${this.config.players}`);
    }

    this.renderBoard();
    this.updateCardsRemaining();
    this.watchBoardSize();
    this.startElapsedTimer();

    // Показуємо таймер або панель гравців
    if (this.config.players === 1) {
      this.showTimer();
      this.startTimer();
    } else {
      this.renderPlayerScoresTop();
    }
  }

  dealInitialCards() {
    this.state.playerCards = [];
    
    for (let i = 0; i < this.config.players; i++) {
      if (this.state.deck.length > 0) {
        this.state.playerCards.push(this.state.deck.pop());
      }
    }

    if (this.state.deck.length > 0) {
      this.state.currentCentralCard = this.state.deck.pop();
    }

    console.log(`🎲 Роздано ${this.state.playerCards.length} карт, ${this.state.deck.length} залишилось`);
  }

  /**
   * Показати таймер (для 1 гравця)
   */
  showTimer() {
    const timerElement = document.getElementById('timer-display');
    const scoresTop = document.getElementById('players-scores-top');

    if (timerElement) {
      timerElement.classList.remove('hidden');
    }
    if (scoresTop) {
      scoresTop.classList.add('hidden');
    }

    this.updateTimerDisplay();
  }

  /**
   * Start countdown timer for single player
   */
  startTimer() {
    if (this.config.players !== 1 || this.moveTime === 0) return;

    this.stopTimer();
    this.state.timeRemaining = this.moveTime;
    this.state.moveExpired = false;
    this.updateTimerDisplay();

    this.state.timerInterval = setInterval(() => {
      if (this.state.isPaused || this.state.isGameOver) return;

      this.state.timeRemaining--;
      this.updateTimerDisplay();

      if (this.state.timeRemaining <= 0) {
        this.handleTimerExpired();
      }
    }, 1000);
  }

  /**
   * Stop the timer
   */
  stopTimer() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }
  }

  /**
   * Reset timer for new move
   */
  resetTimer() {
    this.state.moveExpired = false;
    this.startTimer();
  }

  /**
   * Update timer display
   */
  updateTimerDisplay() {
    const timerElement = document.getElementById('timer-display');
    if (!timerElement) return;

    const timeStrong = timerElement.querySelector('strong');
    if (!timeStrong) return;

    if (this.moveTime === 0) {
      timeStrong.textContent = '∞';
      timerElement.classList.remove('warning', 'expired');
      return;
    }

    const mins = Math.floor(this.state.timeRemaining / 60);
    const secs = this.state.timeRemaining % 60;
    timeStrong.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Add warning class when time is low
    if (this.state.timeRemaining <= 10 && this.state.timeRemaining > 0) {
      timerElement.classList.add('warning');
      timerElement.classList.remove('expired');
    } else if (this.state.timeRemaining <= 0) {
      timerElement.classList.add('expired');
      timerElement.classList.remove('warning');
    } else {
      timerElement.classList.remove('warning', 'expired');
    }
  }

  /**
   * Handle when timer expires
   */
  handleTimerExpired() {
    this.stopTimer();
    this.state.moveExpired = true;
    console.log('⏰ Time expired! Move will not count.');
  }

  renderBoard() {
    this.board.innerHTML = '';

    const layout = this.computeLayout();
    this.lastBoardSize = { w: layout.boardW, h: layout.boardH };

    layout.slots.forEach(slot => {
      if (slot.type === 'deck') {
        this.renderCentralCardAt(slot.x, slot.y, layout.size);
      } else {
        this.renderPlayerCardAt(slot.index, slot.x, slot.y, layout.size);
      }
    });

    // После перерисовки (например, при повороте телефона) возвращаем подсветку выбранной карты
    const selected = this.state.roundState.selectedPlayerCard;
    if (selected !== null) this.highlightPlayerCard(selected, true);
  }

  /**
   * Варианты раскладки поля: сетка cols × rows, в ячейках — колода и карты игроков.
   * col/row — центр карты в долях ячеек (0.5 = середина первой ячейки,
   * 1 = граница между первой и второй — так колода встаёт по центру двух ячеек).
   * Горизонтальная раскладка — для широкого поля, вертикальная — для телефона.
   */
  getLayoutVariants() {
    switch (this.config.players) {
      case 1:
        return [
          // Гравець — Колода в ряд
          { cols: 2, rows: 1, slots: [{ type: 'player', index: 0, col: 0.5, row: 0.5 }, { type: 'deck', col: 1.5, row: 0.5 }] },
          // Колода сверху, игрок снизу
          { cols: 1, rows: 2, slots: [{ type: 'deck', col: 0.5, row: 0.5 }, { type: 'player', index: 0, col: 0.5, row: 1.5 }] }
        ];
      case 2:
        return [
          // Гравець 1 — Колода — Гравець 2
          { cols: 3, rows: 1, slots: [{ type: 'player', index: 0, col: 0.5, row: 0.5 }, { type: 'deck', col: 1.5, row: 0.5 }, { type: 'player', index: 1, col: 2.5, row: 0.5 }] },
          // Столбиком
          { cols: 1, rows: 3, slots: [{ type: 'player', index: 0, col: 0.5, row: 0.5 }, { type: 'deck', col: 0.5, row: 1.5 }, { type: 'player', index: 1, col: 0.5, row: 2.5 }] },
          // Телефон: колода сверху, игроки рядом снизу
          { cols: 2, rows: 2, slots: [{ type: 'deck', col: 1, row: 0.5 }, { type: 'player', index: 0, col: 0.5, row: 1.5 }, { type: 'player', index: 1, col: 1.5, row: 1.5 }] }
        ];
      case 3:
        return [
          // Колода сверху, три игрока в ряд снизу
          { cols: 3, rows: 2, slots: [{ type: 'deck', col: 1.5, row: 0.5 }, { type: 'player', index: 0, col: 0.5, row: 1.5 }, { type: 'player', index: 1, col: 1.5, row: 1.5 }, { type: 'player', index: 2, col: 2.5, row: 1.5 }] },
          // Колода сверху, игроки 1-2 в ряд, игрок 3 снизу по центру
          { cols: 2, rows: 3, slots: [{ type: 'deck', col: 1, row: 0.5 }, { type: 'player', index: 0, col: 0.5, row: 1.5 }, { type: 'player', index: 1, col: 1.5, row: 1.5 }, { type: 'player', index: 2, col: 1, row: 2.5 }] },
          // Телефон: сетка 2×2, колода в левом верхнем углу
          { cols: 2, rows: 2, slots: [{ type: 'deck', col: 0.5, row: 0.5 }, { type: 'player', index: 0, col: 1.5, row: 0.5 }, { type: 'player', index: 1, col: 0.5, row: 1.5 }, { type: 'player', index: 2, col: 1.5, row: 1.5 }] },
          // Низкий широкий экран (телефон горизонтально): все в один ряд, колода второй
          { cols: 4, rows: 1, slots: [{ type: 'player', index: 0, col: 0.5, row: 0.5 }, { type: 'deck', col: 1.5, row: 0.5 }, { type: 'player', index: 1, col: 2.5, row: 0.5 }, { type: 'player', index: 2, col: 3.5, row: 0.5 }] }
        ];
      case 4:
      default:
        return [
          // Игроки по углам, колода в центре
          { cols: 3, rows: 2, slots: [{ type: 'player', index: 0, col: 0.5, row: 0.5 }, { type: 'player', index: 1, col: 0.5, row: 1.5 }, { type: 'deck', col: 1.5, row: 1 }, { type: 'player', index: 2, col: 2.5, row: 0.5 }, { type: 'player', index: 3, col: 2.5, row: 1.5 }] },
          // Телефон: игроки 1-3 сверху, колода в центре, игроки 2-4 снизу
          { cols: 2, rows: 3, slots: [{ type: 'player', index: 0, col: 0.5, row: 0.5 }, { type: 'player', index: 2, col: 1.5, row: 0.5 }, { type: 'deck', col: 1, row: 1.5 }, { type: 'player', index: 1, col: 0.5, row: 2.5 }, { type: 'player', index: 3, col: 1.5, row: 2.5 }] },
          // Низкий широкий экран (телефон горизонтально): все в один ряд, колода по центру
          { cols: 5, rows: 1, slots: [{ type: 'player', index: 0, col: 0.5, row: 0.5 }, { type: 'player', index: 1, col: 1.5, row: 0.5 }, { type: 'deck', col: 2.5, row: 0.5 }, { type: 'player', index: 2, col: 3.5, row: 0.5 }, { type: 'player', index: 3, col: 4.5, row: 0.5 }] }
        ];
    }
  }

  /**
   * Выбор раскладки и размера карт по реальному размеру поля:
   * берём вариант, где карты получаются крупнее, и считаем размер так,
   * чтобы карта с подписью целиком помещалась в свою ячейку — без наложений.
   */
  computeLayout() {
    const boardW = this.board.clientWidth || window.innerWidth;
    const boardH = this.board.clientHeight || (window.innerHeight - 70);
    const labelH = LABEL_HEIGHT;

    let best = null;
    this.getLayoutVariants().forEach(variant => {
      const cellW = boardW / variant.cols;
      const cellH = boardH / variant.rows;
      const size = Math.min(cellW * CELL_FILL, (cellH - labelH) * CELL_FILL, MAX_CARD_SIZE);
      if (!best || size > best.size) best = { variant, cellW, cellH, size };
    });

    const size = Math.max(Math.floor(best.size), MIN_CARD_SIZE);
    // Центр карты сдвигаем вверх на половину подписи, чтобы пара «карта + подпись» стояла по центру ячейки
    const slots = best.variant.slots.map(slot => ({
      ...slot,
      x: slot.col * best.cellW,
      y: slot.row * best.cellH - labelH / 2
    }));

    return { size, slots, boardW, boardH };
  }

  /**
   * Перерисовка поля при изменении его размера: поворот телефона,
   * сворачивание меню кабинета (панель меняет ширину), изменение окна.
   */
  watchBoardSize() {
    if (typeof ResizeObserver === 'undefined') return;
    let frame = null;
    this.resizeObserver = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        if (this.isDestroyed || this.state.isGameOver || !this.lastBoardSize) return;
        const w = this.board.clientWidth;
        const h = this.board.clientHeight;
        // Мелкие колебания (полоса прокрутки, адресная строка) не перерисовываем —
        // иначе символы на картах прыгают
        if (Math.abs(w - this.lastBoardSize.w) < 8 && Math.abs(h - this.lastBoardSize.h) < 8) return;
        this.renderBoard();
      });
    });
    this.resizeObserver.observe(this.board);
  }

  /**
   * Общее время партии (для экрана результатов), пауза не считается
   */
  startElapsedTimer() {
    this.stopElapsedTimer();
    this.elapsedInterval = setInterval(() => {
      if (this.state.isPaused || this.state.isGameOver) return;
      this.state.timeElapsed++;
    }, 1000);
  }

  stopElapsedTimer() {
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
    }
  }

  /**
   * Рендер карти гравця на вказаній позиції
   */
  renderPlayerCardAt(index, x, y, size) {
    const card = this.state.playerCards[index];
    const container = document.createElement('div');
    container.className = 'card-container player-card';
    container.style.cssText = `
      left: ${x}px;
      top: ${y}px;
      transform: translate(-50%, -${size / 2}px);
    `;

    const cardDiv = document.createElement('div');
    cardDiv.className = 'card player';
    cardDiv.dataset.playerId = index + 1;
    cardDiv.dataset.playerIndex = index;
    cardDiv.style.cssText = `
      width: ${size}px;
      height: ${size}px;
    `;

    const playerColor = this.state.scores[index].color;
    cardDiv.style.boxShadow = `0 0 0 4px ${playerColor}40`;

    const svg = this.renderer.render(
      card,
      this.assets,
      {
        size: size,
        onSymbolClick: (symbolId) => this.handlePlayerCardClick(index, symbolId)
      }
    );
    
    cardDiv.appendChild(svg);

    // Подпись всегда под картой: место под неё заложено в computeLayout()
    const label = document.createElement('div');
    label.className = 'card-label';
    label.style.color = playerColor;
    label.textContent = this.state.scores[index].name;

    container.appendChild(cardDiv);
    container.appendChild(label);
    this.board.appendChild(container);
  }

  /**
   * Рендер центральної карти на вказаній позиції
   */
  renderCentralCardAt(x, y, size) {
    const container = document.createElement('div');
    container.className = 'card-container central-card';
    container.style.cssText = `
      left: ${x}px;
      top: ${y}px;
      transform: translate(-50%, -${size / 2}px);
    `;

    const cardDiv = document.createElement('div');
    cardDiv.className = 'card central';
    cardDiv.dataset.cardType = 'central';
    cardDiv.style.cssText = `
      width: ${size}px;
      height: ${size}px;
    `;

    const svg = this.renderer.render(
      this.state.currentCentralCard,
      this.assets,
      {
        size: size,
        onSymbolClick: (symbolId) => this.handleCentralCardClick(symbolId)
      }
    );
    
    cardDiv.appendChild(svg);

    const label = document.createElement('div');
    label.className = 'card-label';
    label.textContent = `${t('deck', this.lang)} (${this.state.deck.length})`;

    container.appendChild(cardDiv);
    container.appendChild(label);
    this.board.appendChild(container);
  }

  /**
   * Рендер панелі гравців ВГОРІ (для 2-4 гравців)
   */
  renderPlayerScoresTop() {
    const scoresContainer = document.getElementById('players-scores-top');
    const timerElement = document.getElementById('timer-display');
    
    if (!scoresContainer) return;
    
    // Ховаємо таймер, показуємо панель
    if (timerElement) {
      timerElement.classList.add('hidden');
    }
    scoresContainer.classList.remove('hidden');
    scoresContainer.innerHTML = '';

    this.state.scores.forEach(score => {
      const div = document.createElement('div');
      div.className = 'player-score-top';
      div.id = `player-score-${score.playerIndex}`;
      
      const hasClicked = this.state.roundState.clickedPlayers.some(
        p => p.playerIndex === score.playerIndex
      );
      if (hasClicked) {
        div.classList.add('has-clicked');
      }
      
      div.innerHTML = `
        <div class="player-color-dot" style="background: ${score.color}"></div>
        <span class="player-name-top">${score.name}</span>
        <span class="player-cards-count">×${score.cards}</span>
      `;
      scoresContainer.appendChild(div);
    });
  }

  handlePlayerCardClick(playerIndex, symbolId) {
    if (this.state.isPaused || this.state.isGameOver) return;

    console.log(`🎯 Етап 1: Гравець ${playerIndex + 1} вибрав символ ${symbolId}`);

    const isOnCentralCard = this.state.currentCentralCard.includes(symbolId);
    
    if (!isOnCentralCard) {
      console.log('❌ Символ НЕ на центральній карті');
      this.handleWrongAnswer(playerIndex);
      return;
    }

    const timestamp = Date.now();
    
    if (!this.state.roundState.clickedPlayers.some(p => p.playerIndex === playerIndex)) {
      this.state.roundState.clickedPlayers.push({
        playerIndex,
        symbolId,
        timestamp,
        step: 1
      });
      
      if (!this.state.roundState.firstClickTimestamp) {
        this.state.roundState.firstClickTimestamp = timestamp;
      }
      
      if (this.config.players > 1) {
        this.updatePlayerHighlight(playerIndex);
      }
    }

    this.state.roundState.selectedPlayerCard = playerIndex;
    this.state.roundState.selectedSymbolId = symbolId;
    this.highlightPlayerCard(playerIndex, true);

    console.log('✅ Етап 1 пройдено. Тепер клікни на центральну карту!');
  }

  handleCentralCardClick(symbolId) {
    if (this.state.isPaused || this.state.isGameOver) return;

    const playerIndex = this.state.roundState.selectedPlayerCard;
    const selectedSymbol = this.state.roundState.selectedSymbolId;

    if (playerIndex === null || selectedSymbol === null) {
      console.log('⚠️ Спочатку вибери символ на своїй карті!');
      return;
    }

    console.log(`🎯 Етап 2: Гравець ${playerIndex + 1} клікнув символ ${symbolId}`);

    if (symbolId !== selectedSymbol) {
      console.log('❌ Це не той символ!');
      this.handleWrongAnswer(playerIndex);
      this.resetRoundState();
      return;
    }

    console.log('✅✅ ПРАВИЛЬНО!');

    const clickData = this.state.roundState.clickedPlayers.find(
      p => p.playerIndex === playerIndex
    );
    if (clickData) {
      clickData.step = 2;
      clickData.completedTimestamp = Date.now();
    }

    this.handleCorrectAnswer(playerIndex);
  }

  updatePlayerHighlight(playerIndex) {
    const scoreElement = document.getElementById(`player-score-${playerIndex}`);
    if (scoreElement) {
      scoreElement.classList.add('first-clicked');
      
      if (!scoreElement.querySelector('.first-indicator')) {
        const indicator = document.createElement('span');
        indicator.className = 'first-indicator';
        indicator.textContent = '⚡';
        scoreElement.querySelector('.player-name-top').appendChild(indicator);
      }
    }
  }

  highlightPlayerCard(playerIndex, highlight) {
    const cardElement = this.board.querySelector(`[data-player-index="${playerIndex}"]`);
    if (cardElement) {
      if (highlight) {
        cardElement.classList.add('selected');
      } else {
        cardElement.classList.remove('selected');
      }
    }
  }

  resetRoundState() {
    this.state.roundState = {
      selectedPlayerCard: null,
      selectedSymbolId: null,
      firstClickTimestamp: null,
      clickedPlayers: []
    };
    
    const allCards = this.board.querySelectorAll('.card.player');
    allCards.forEach(card => card.classList.remove('selected'));
    
    const allScores = document.querySelectorAll('.player-score-top');
    allScores.forEach(score => {
      score.classList.remove('first-clicked', 'has-clicked');
      const indicator = score.querySelector('.first-indicator');
      if (indicator) indicator.remove();
    });
  }

  handleCorrectAnswer(playerIndex) {
    console.log(`✅ Правильна відповідь від Гравця ${playerIndex + 1}`);

    // Check if move was expired (for single player) - don't count points
    const countPoints = !this.state.moveExpired;

    if (countPoints) {
      this.state.correctClicks++;
      this.state.scores[playerIndex].cards++;
    } else {
      console.log('⏰ Move was expired - no points awarded');
      this.state.wrongClicks++; // Count as wrong
    }

    this.state.playerCards[playerIndex] = this.state.currentCentralCard;

    if (this.state.deck.length > 0) {
      this.state.currentCentralCard = this.state.deck.pop();
    } else {
      this.endGame();
      return;
    }

    this.animateCardTransfer(playerIndex);

    setTimeout(() => {
      if (this.isDestroyed) return;
      this.resetRoundState();
      this.renderBoard();
      if (this.config.players > 1) {
        this.renderPlayerScoresTop();
      }
      this.updateCardsRemaining();

      // Reset timer for single player
      if (this.config.players === 1) {
        this.resetTimer();
      }
    }, 800);
  }

  handleWrongAnswer(playerIndex) {
    console.log(`❌ Помилка від Гравця ${playerIndex + 1}`);
    this.state.wrongClicks++;

    const cardElement = this.board.querySelector(`[data-player-index="${playerIndex}"]`);
    if (cardElement) {
      cardElement.classList.add('shake');
      setTimeout(() => cardElement.classList.remove('shake'), 500);
    }

    if (this.config.players >= 2) {
      this.state.roundState.clickedPlayers = this.state.roundState.clickedPlayers.filter(
        p => p.playerIndex !== playerIndex
      );
      
      if (this.state.roundState.selectedPlayerCard === playerIndex) {
        this.state.roundState.selectedPlayerCard = null;
        this.state.roundState.selectedSymbolId = null;
      }
      
      console.log(`⏭️ Гравець ${playerIndex + 1} вибув з раунду`);
    }
  }

  animateCardTransfer(playerIndex) {
    const centralCard = this.board.querySelector('.central-card .card');
    const playerCard = this.board.querySelector(`[data-player-index="${playerIndex}"]`);
    
    if (centralCard && playerCard) {
      const color = this.state.scores[playerIndex].color;
      centralCard.style.boxShadow = `0 0 30px 10px ${color}`;
      playerCard.style.boxShadow = `0 0 30px 10px ${color}`;
      
      setTimeout(() => {
        centralCard.style.boxShadow = '';
        playerCard.style.boxShadow = `0 0 0 4px ${color}40`;
      }, 400);
    }
  }

  updateCardsRemaining() {
    const element = document.getElementById('cards-remaining');
    if (element) {
      element.textContent = this.state.deck.length;
    }
  }

  endGame() {
    this.state.isGameOver = true;
    
    const winner = this.state.scores.reduce((max, player) => 
      player.cards > max.cards ? player : max
    );

    console.log(`🏆 Гра закінчена! Переможець: Гравець ${winner.playerId} з ${winner.cards} картами`);

    this.stopTimer();
    this.stopElapsedTimer();

    setTimeout(() => {
      if (this.isDestroyed) return;
      this.showResults(winner);
    }, 500);
  }

  /**
   * Итоги партии отдаём в main.js — он показывает экран результатов
   * (раньше здесь было отдельное окно только на украинском с перезагрузкой страницы)
   */
  showResults(winner) {
    if (!this.onGameOver) return;
    this.onGameOver({
      players: this.config.players,
      winner,
      scores: this.state.scores.map(score => ({ ...score })),
      correctClicks: this.state.correctClicks,
      wrongClicks: this.state.wrongClicks,
      timeElapsed: this.state.timeElapsed
    });
  }

  getPlayerColor(index) {
    const colors = [
      '#FF6B35',
      '#4ECDC4',
      '#FFD166',
      '#9B59B6'
    ];
    return colors[index % colors.length];
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  destroy() {
    this.isDestroyed = true;

    // Stop timer
    this.stopTimer();
    this.stopElapsedTimer();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.eventHandlers.forEach((handler, key) => {
      const [element, event] = key.split(':');
      const el = document.getElementById(element);
      if (el) el.removeEventListener(event, handler);
    });
    this.eventHandlers.clear();

    if (this.board) {
      this.board.innerHTML = '';
      this.board.classList.remove('multiplayer-2', 'multiplayer-3', 'multiplayer-4');
    }
  }
}