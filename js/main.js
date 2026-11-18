/**
 * Main Entry Point v2.5
 * Ініціалізація гри Spot the Same
 * + Мультимовність (UA/EN/RU/ES)
 */

import { AssetsLoader } from './assets-loader.js';
import { Game } from './game.js';
import { t } from './translations.js';

// Глобальний стан додатку
const appState = {
  currentScreen: 'loading',
  currentLang: 'ua',
  config: {
    players: 1,
    difficulty: 'medium',
    moveTime: 60 // seconds for single player move
  },
  assets: null,
  game: null
};

/**
 * Оновити всі тексти на сторінці
 */
function updateTexts(lang) {
  console.log(`🌍 Updating texts to: ${lang}`);
  
  // Оновлюємо всі елементи з data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'), lang);
  });

  // Підказки та aria-label іконок (пауза, вихід)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const translated = t(el.getAttribute('data-i18n-title'), lang);
    el.title = translated;
    el.setAttribute('aria-label', translated);
  });

  appState.currentLang = lang;
  // Гра вже йде — перекладаємо підписи на полі (імена гравців, колода), карти не перемальовуємо
  if (appState.game) relabelGame(lang);
  console.log(`✅ Texts updated to: ${lang}`);
}

function relabelGame(lang) {
  const game = appState.game;
  game.lang = lang;
  game.state.scores.forEach(score => {
    score.name = `${t('player', lang)} ${score.playerIndex + 1}`;
  });
  document.querySelectorAll('.card.player').forEach(card => {
    const score = game.state.scores[Number(card.dataset.playerIndex)];
    const label = card.parentNode.querySelector('.card-label');
    if (score && label) label.textContent = score.name;
  });
  const deck = document.querySelector('.card.central');
  const deckLabel = deck && deck.parentNode.querySelector('.card-label');
  if (deckLabel) deckLabel.textContent = `${t('deck', lang)} (${game.state.deck.length})`;
  document.querySelectorAll('.player-score-top').forEach(el => {
    const score = game.state.scores[Number(el.id.replace('player-score-', ''))];
    const name = el.querySelector('.player-name-top');
    if (score && name && name.firstChild) name.firstChild.textContent = score.name;
  });
}

/**
 * Мови: шапку з кнопками UA / EN / RU / ES малює спільна оболонка MWShell.
 * Вона ж обирає мову (?lang= → збережений вибір → мова браузера → українська)
 * і ставить <html lang> та заголовок вкладки.
 */
function initLanguages() {
  window.MWShell.init({
    mount: '#mw-header',
    title: { uk: 'Знайди першим', en: 'Find it First', ru: 'Найди первым', es: 'Encuéntralo primero' },
    tagline: {
      uk: 'Гра на увагу та швидкість реакції',
      en: 'A game for attention and quick reactions',
      ru: 'Игра на внимание и скорость реакции',
      es: 'Un juego de atención y reacción rápida'
    },
    docTitle: {
      uk: 'Знайди першим — MindWorld School',
      en: 'Find it First — MindWorld School',
      ru: 'Найди первым — MindWorld School',
      es: 'Encuéntralo primero — MindWorld School'
    },
    ukrainianCode: 'ua',
    onLangChange: updateTexts
  });
}

/**
 * Ініціалізація додатку
 */
async function init() {
  console.log('🎮 Initializing Spot the Same v2.5...');
  
  try {
    // Ініціалізуємо мови
    initLanguages();
    
    // Завантажуємо ресурси
    await loadAssets();
    
    // Ініціалізуємо меню
    initMenu();
    
    // Кнопки паузи/виходу — один раз (раніше навішувались заново при кожному старті гри)
    initGameControls();

    // Показуємо меню
    showScreen('menu');
    
    console.log('✅ Initialization complete');
  } catch (error) {
    console.error('❌ Initialization error:', error);
    showError('Помилка завантаження гри. Перезавантажте сторінку.');
  }
}

/**
 * Завантаження ресурсів
 */
async function loadAssets() {
  console.log('📦 Loading assets...');
  
  const loader = new AssetsLoader();
  appState.assets = await loader.loadAll();
  
  console.log('✅ Assets loaded:', {
    symbols: appState.assets.symbols.length,
    decks: Object.keys(appState.assets.decks)
  });
}

/**
 * Ініціалізація меню
 */
function initMenu() {
  console.log('🎛️ Initializing menu...');

  // Timer slider elements
  const timerSection = document.getElementById('timer-section');
  const timerSlider = document.getElementById('timer-slider');
  const timerValue = document.getElementById('timer-value');

  // Update timer section visibility based on player count
  function updateTimerVisibility() {
    if (timerSection) {
      if (appState.config.players === 1) {
        timerSection.classList.remove('disabled');
      } else {
        timerSection.classList.add('disabled');
      }
    }
  }

  // Кнопки вибору кількості гравців
  const playerButtons = document.querySelectorAll('[data-players]');
  playerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      playerButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.config.players = parseInt(btn.dataset.players);
      console.log(`👥 Players selected: ${appState.config.players}`);
      updateTimerVisibility();
    });
  });

  // Кнопки вибору складності
  const difficultyButtons = document.querySelectorAll('[data-difficulty]');
  difficultyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      difficultyButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.config.difficulty = btn.dataset.difficulty;
      console.log(`🎯 Difficulty selected: ${appState.config.difficulty}`);
    });
  });

  // Timer slider
  if (timerSlider && timerValue) {
    timerSlider.addEventListener('input', () => {
      const seconds = parseInt(timerSlider.value);
      appState.config.moveTime = seconds;

      // Format display
      if (seconds === 0) {
        timerValue.textContent = '∞';
      } else {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        timerValue.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      }
      console.log(`⏱️ Move time selected: ${seconds}s`);
    });
  }

  // Кнопка "Начать игру"
  const startButton = document.querySelector('.btn-start');
  if (startButton) {
    startButton.addEventListener('click', startGame);
  } else {
    console.warn('⚠️ Start button not found');
  }

  // Initial timer visibility
  updateTimerVisibility();

  console.log('✅ Menu initialized');
}

/**
 * Початок гри
 */
async function startGame() {
  console.log('🚀 Starting game...', appState.config);
  
  try {
    // Показуємо екран гри
    showScreen('game');
    fitGameScreen();
    
    // Створюємо нову гру
    const gameBoard = document.getElementById('game-board');
    if (!gameBoard) {
      throw new Error('Game board element not found');
    }
    
    // Знищуємо стару гру, якщо є
    if (appState.game) {
      appState.game.destroy();
    }
    
    // Створюємо нову гру
    appState.game = new Game({
      players: appState.config.players,
      difficulty: appState.config.difficulty,
      moveTime: appState.config.moveTime,
      assets: appState.assets,
      lang: appState.currentLang,
      onGameOver: showResults
    });
    
    // Ініціалізуємо гру
    await appState.game.init(gameBoard);

    // Поле гри — цілком на екран (на сайті прокручує сторінку блок Tilda)
    if (window.MWShell && window.MWShell.reveal) {
      setTimeout(() => window.MWShell.reveal(document.getElementById('game-screen')), 100);
    }
    
    console.log('✅ Game started');
  } catch (error) {
    console.error('❌ Error starting game:', error);
    showError('Помилка запуску гри');
    showScreen('menu');
  }
}

/**
 * Ініціалізація кнопок управління грою
 */
function initGameControls() {
  // Кнопка паузи
  const pauseButton = document.querySelector('.btn-pause');
  if (pauseButton) {
    pauseButton.addEventListener('click', () => {
      console.log('⏸️ Pause clicked');
      showPauseModal();
    });
  }
  
  // Кнопка виходу
  const exitButton = document.querySelector('.btn-exit');
  if (exitButton) {
    exitButton.addEventListener('click', () => {
      console.log('🚪 Exit clicked');
      showExitModal();
    });
  }

  console.log('✅ Game controls initialized');
}

/**
 * Показати модальне вікно підтвердження виходу
 */
function showExitModal() {
  const modal = document.getElementById('exit-modal');
  if (!modal) return;

  if (appState.game) {
    appState.game.state.isPaused = true;
  }

  modal.classList.remove('hidden');

  // Кнопка "Так, вийти"
  const confirmButton = modal.querySelector('.btn-exit-confirm');
  if (confirmButton) {
    confirmButton.onclick = () => {
      modal.classList.add('hidden');
      exitGame();
    };
  }

  // Кнопка "Скасувати"
  const cancelButton = modal.querySelector('.btn-exit-cancel');
  if (cancelButton) {
    cancelButton.onclick = () => {
      modal.classList.add('hidden');
      if (appState.game) {
        appState.game.state.isPaused = false;
      }
    };
  }
}

/**
 * Показати модальне вікно паузи
 */
function showPauseModal() {
  const modal = document.getElementById('pause-modal');
  if (!modal) return;
  
  if (appState.game) {
    appState.game.state.isPaused = true;
  }
  
  modal.classList.remove('hidden');
  
  // Кнопка "Продолжить"
  const resumeButton = modal.querySelector('.btn-resume');
  if (resumeButton) {
    resumeButton.onclick = () => {
      modal.classList.add('hidden');
      if (appState.game) {
        appState.game.state.isPaused = false;
      }
    };
  }
  
  // Кнопка "Выйти в меню"
  const exitGameButton = modal.querySelector('.btn-exit-game');
  if (exitGameButton) {
    exitGameButton.onclick = () => {
      modal.classList.add('hidden');
      exitGame();
    };
  }
}

/**
 * Вихід з гри
 */
function exitGame() {
  console.log('👋 Exiting game...');
  
  if (appState.game) {
    appState.game.destroy();
    appState.game = null;
  }
  
  showScreen('menu');
  console.log('✅ Exited to menu');
}

/**
 * Показати екран
 */
function showScreen(screenName) {
  console.log(`📺 Showing screen: ${screenName}`);
  
  // Ховаємо всі екрани
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => screen.classList.add('hidden'));
  
  // Показуємо потрібний екран
  let targetScreen;
  switch (screenName) {
    case 'loading':
      targetScreen = document.getElementById('loading-screen');
      break;
    case 'menu':
      targetScreen = document.getElementById('menu-screen');
      break;
    case 'game':
      targetScreen = document.getElementById('game-screen');
      break;
    case 'results':
      targetScreen = document.getElementById('results-screen');
      break;
  }
  
  if (targetScreen) {
    targetScreen.classList.remove('hidden');
    appState.currentScreen = screenName;
  } else {
    console.error(`❌ Screen not found: ${screenName}`);
  }
}

/**
 * Висота екрана гри.
 * Окремо (без фрейму) — висота вікна мінус шапка.
 * У фреймі на сайті 100vh — це висота самого фрейму, а фрейм підлаштовується
 * під вміст: висота росла б сама від себе. Тому беремо висоту екрана пристрою
 * мінус місце під панелі браузера, у межах 420–780 px.
 */
function fitGameScreen() {
  const screenEl = document.getElementById('game-screen');
  if (!screenEl) return;
  if (window.parent === window) {
    // Без фрейму: вікно мінус шапка, щоб і шапка, і поле були видні без прокрутки
    const header = document.querySelector('.app-header');
    const headerH = header ? header.offsetHeight : 0;
    screenEl.style.height = Math.max(420, window.innerHeight - headerH) + 'px';
    return;
  }
  // На iPhone screen.width/height не міняються при повороті — орієнтацію беремо окремо
  const sw = window.screen.width || 800, sh = window.screen.availHeight || window.screen.height || 800;
  const landscape = window.screen.orientation
    ? String(window.screen.orientation.type).indexOf('landscape') === 0
    : Math.abs(window.orientation || 0) === 90;
  const deviceH = landscape ? Math.min(sw, sh) : Math.max(sw, sh);
  const h = Math.max(420, Math.min(780, deviceH - 200));
  screenEl.style.height = h + 'px';
}

// Поворот телефона / зміна вікна — перерахувати, поки йде гра
function refitGameScreen() {
  if (appState.currentScreen === 'game') fitGameScreen();
}
window.addEventListener('orientationchange', () => setTimeout(refitGameScreen, 300));
window.addEventListener('resize', () => {
  if (window.parent === window) refitGameScreen();
});

/**
 * Показати помилку
 */
function showError(message) {
  console.error('❌ Error:', message);
  alert(message);
}

/**
 * Формат часу м:сс
 */
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Екран результатів (замість окремого вікна з перезавантаженням сторінки)
 */
function showResults(result) {
  const lang = appState.currentLang;
  const soloBlock = document.getElementById('solo-results');
  const multiBlock = document.getElementById('multi-results');

  if (result.players === 1) {
    const total = result.correctClicks + result.wrongClicks;
    const accuracy = total > 0 ? Math.round((result.correctClicks / total) * 100) : 100;
    document.getElementById('solo-cards').textContent = result.correctClicks;
    document.getElementById('solo-time').textContent = formatTime(result.timeElapsed);
    document.getElementById('solo-accuracy').textContent = `${accuracy}%`;
    soloBlock.classList.remove('hidden');
    multiBlock.classList.add('hidden');
  } else {
    // Місця за кількістю карт; однакова кількість — однакове місце
    const ranked = [...result.scores].sort((a, b) => b.cards - a.cards);
    const best = ranked[0].cards;
    const leaders = ranked.filter(score => score.cards === best);
    const winnerLine = document.getElementById('winner-line');
    winnerLine.textContent = leaders.length > 1
      ? t('draw', lang)
      : `🏆 ${t('winner', lang)}: ${leaders[0].name}`;
    winnerLine.style.color = leaders.length > 1 ? '' : leaders[0].color;

    const podium = document.getElementById('winners-podium');
    podium.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉'];
    let place = 0;
    ranked.forEach((score, i) => {
      if (i === 0 || score.cards !== ranked[i - 1].cards) place = i;
      const li = document.createElement('li');
      li.className = 'podium-row' + (score.cards === best ? ' is-winner' : '');

      const medal = document.createElement('span');
      medal.className = 'podium-place';
      medal.textContent = medals[place] || `${place + 1}`;

      const dot = document.createElement('span');
      dot.className = 'player-color-dot';
      dot.style.background = score.color;

      const name = document.createElement('span');
      name.className = 'podium-name';
      name.textContent = score.name;

      const cards = document.createElement('b');
      cards.className = 'podium-cards';
      cards.textContent = `${score.cards} ${t('cardsCount', lang)}`;

      li.append(medal, dot, name, cards);
      podium.appendChild(li);
    });

    multiBlock.classList.remove('hidden');
    soloBlock.classList.add('hidden');
  }

  showScreen('results');
}

/**
 * Ініціалізація результатів
 */
function initResults() {
  // Кнопка "Играть снова"
  const playAgainButton = document.querySelector('.btn-play-again');
  if (playAgainButton) {
    playAgainButton.addEventListener('click', () => {
      console.log('🔄 Play again clicked');
      startGame();
    });
  }
  
  // Кнопка "В меню"
  const menuButton = document.querySelector('.btn-menu');
  if (menuButton) {
    menuButton.addEventListener('click', () => {
      console.log('🏠 Menu clicked');
      exitGame();
    });
  }
}

// Запуск при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM loaded');
  init();
  initResults();

});

// Експорт для використання в інших модулях
export { appState, showScreen, exitGame };
