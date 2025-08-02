document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const startButton = document.getElementById('start-button');
    const restartButton = document.getElementById('restart-button');
    const startScreen = document.getElementById('start-screen');
    const endScreen = document.getElementById('end-screen');
    const gameArea = document.getElementById('game-area');
    const scoreDisplay = document.getElementById('score');
    const finalScoreDisplay = document.getElementById('final-score');
    const timerDisplay = document.getElementById('timer');
    const comboDisplay = document.getElementById('combo');
    const lineCheckboxes = document.querySelectorAll('input[type="checkbox"][id^="line-"]');
    const bonusTimeIndicator = document.getElementById('bonus-time-indicator');
    const speedUpIndicator = document.getElementById('speed-up-indicator');

    const gameDurationInput = document.getElementById('game-duration');

    const endGameButton = document.getElementById('end-game-button');

    // Game State
    let score = 0;
    let combo = 0;
    let timer = 90;
    let gameInterval = null;
    let cupInterval = null;
    let isPlaying = false;
    let lastSuccessfulClickTime = 0; // For combo timeout
    let activeBelts = []; // Stores the DOM elements of active conveyor belts
    let isBonusTime = false;
    let bonusTimeMultiplier = 1;
    let isSpeedUp = false;
    let speedMultiplier = 1;
    let lastSpeedUpCheckTime = 0;
    let fluctuatingSpeedFactor = 1; // New: for random speed fluctuation
    let speedFluctuationInterval = null; // New: to control speed fluctuation timing
    let gameEndingSoundPlayed = false; // New: flag to ensure ending sound plays once

    const BASE_GAME_SPEED = 5; // Pixels per frame
    const BASE_CUP_SPAWN_RATE = 1000; // Milliseconds
    const COMBO_TIMEOUT = 3000; // 3 seconds for combo reset
    const DEFECT_TYPES = ['crack', 'chip', 'smudge', 'wrong_color']; // New defect types
    const CUP_TYPES = ['mug', 'glass', 'tall']; // New cup types
    const GOLDEN_CUP_CHANCE = 0.01; // 1% chance for golden cup
    const BONUS_DURATION = 5000; // 5 seconds bonus time
    const SPEED_UP_CHANCE = 0.2; // 20% chance to trigger speed up
    const SPEED_UP_CHECK_INTERVAL = 5000; // Check every 5 seconds
    const SPEED_UP_DURATION = 10000; // 10 seconds speed up
    const SPEED_BOOST = 1.5; // 1.5x speed
    const FLUCTUATION_INTERVAL = 3000; // New: how often speed fluctuates
    const FLUCTUATION_MIN = 0.7; // New: minimum speed multiplier
    const FLUCTUATION_MAX = 1.3; // New: maximum speed multiplier

    // --- Sound Effects ---
    const sfxCorrect = new Audio('./sfx/correct.mp3');
    const sfxMistake = new Audio('./sfx/mistake.mp3');
    const sfxMiss = new Audio('./sfx/miss.mp3');
    const sfxGolden = new Audio('./sfx/golden.mp3');
    const sfxSpeedUp = new Audio('./sfx/speedup.mp3');
    const sfxSpeedDown = new Audio('./sfx/speeddown.mp3');

    const bgMusic = new Audio('./sfx/bg_music.mp3');
    const sfxGameEndingSoon = new Audio('./sfx/game_ending_soon.mp3'); // New: Game ending soon sound

    function playSound(audioElement) {
        audioElement.currentTime = 0; // Rewind to start
        audioElement.play();
    }

    // --- Event Listeners ---
    startButton.addEventListener('click', startGame);
    restartButton.addEventListener('click', startGame);
    endGameButton.addEventListener('click', returnToStartScreen);
    gameArea.addEventListener('click', handleCupClick);

    // --- Game Logic ---

    function startGame() {
        // Reset state
        score = 0;
        combo = 0;
        timer = parseInt(gameDurationInput.value, 10) || 90; // Use input value, default to 90
        isPlaying = true;
        lastSuccessfulClickTime = Date.now(); // Initialize for combo timeout
        isBonusTime = false;
        bonusTimeMultiplier = 1;
        bonusTimeIndicator.style.display = 'none';
        isSpeedUp = false;
        speedMultiplier = 1;
        speedUpIndicator.style.display = 'none';
        lastSpeedUpCheckTime = Date.now();
        fluctuatingSpeedFactor = 1; // Initialize fluctuating speed factor
        gameEndingSoundPlayed = false; // Reset flag for new game

        // Clear any existing intervals
        if (gameInterval) clearInterval(gameInterval);
        if (cupInterval) clearInterval(cupInterval);
        if (speedFluctuationInterval) clearInterval(speedFluctuationInterval); // Clear previous fluctuation interval
        gameArea.innerHTML = ''; // Clear all belts and cups
        gameArea.appendChild(bonusTimeIndicator); // Re-append indicator
        gameArea.appendChild(speedUpIndicator); // Re-append indicator

        // Determine active belts and create them
        activeBelts = [];
        const selectedLines = Array.from(lineCheckboxes)
                                   .filter(cb => cb.checked)
                                   .map(cb => cb.value);

        if (selectedLines.length === 0) {
            alert('請至少選擇一條生產線！');
            isPlaying = false;
            return;
        }

        selectedLines.forEach(lineType => {
            const belt = document.createElement('div');
            belt.classList.add('conveyor-belt', lineType);
            belt.dataset.lineType = lineType; // Store line type for reference
            gameArea.appendChild(belt);
            activeBelts.push(belt);
        });

        // Update UI
        updateUI();
        startScreen.style.display = 'none';
        endScreen.style.display = 'none';

        // Start game loops
        gameInterval = setInterval(gameLoop, 16); // ~60 FPS
        cupInterval = setInterval(createCup, BASE_CUP_SPAWN_RATE / (speedMultiplier * fluctuatingSpeedFactor)); // Adjust spawn rate
        startTimer();
        speedFluctuationInterval = setInterval(adjustSpeedFluctuation, FLUCTUATION_INTERVAL);
        bgMusic.loop = true;
        bgMusic.play(); // Start speed fluctuation
    }

    function endGame() {
        isPlaying = false;
        clearInterval(gameInterval);
        clearInterval(cupInterval);
        clearInterval(speedFluctuationInterval); // Clear speed fluctuation interval
        bgMusic.pause();
        bgMusic.currentTime = 0; // Reset music to start
        finalScoreDisplay.textContent = score;
        endScreen.style.display = 'flex';
        restartButton.style.display = 'block'; // Ensure restart button is visible
        endGameButton.style.display = 'block'; // Ensure end game button is visible
    }

    function startTimer() {
        const initialTimer = timer; // Store initial timer value
        const endingSoonThreshold = 10; // Play sound when 10 seconds left

        const timerInterval = setInterval(() => {
            if (!isPlaying) {
                clearInterval(timerInterval);
                return;
            }
            timer--;
            updateUI();

            if (timer === endingSoonThreshold && !gameEndingSoundPlayed) {
                playSound(sfxGameEndingSoon);
                gameEndingSoundPlayed = true;
            }

            if (timer <= 0) {
                endGame();
                clearInterval(timerInterval);
            }
        }, 1000);
    }

    function gameLoop() {
        moveCups();
        checkComboTimeout();
        checkSpeedUpTrigger();
    }

    function checkComboTimeout() {
        if (isPlaying && combo > 0 && (Date.now() - lastSuccessfulClickTime > COMBO_TIMEOUT)) {
            combo = 0;
            updateUI();
        }
    }

    function checkSpeedUpTrigger() {
        if (!isPlaying || isSpeedUp || timer < 80) return; // Don't trigger too early or if already active

        if (Date.now() - lastSpeedUpCheckTime > SPEED_UP_CHECK_INTERVAL) {
            lastSpeedUpCheckTime = Date.now();
            if (Math.random() < SPEED_UP_CHANCE) {
                startSpeedUp();
            }
        }
    }

    function startSpeedUp() {
        isSpeedUp = true;
        speedMultiplier = SPEED_BOOST;
        speedUpIndicator.style.display = 'block';
        playSound(sfxSpeedUp);
        // Adjust cup spawn rate immediately
        clearInterval(cupInterval);
        cupInterval = setInterval(createCup, BASE_CUP_SPAWN_RATE / speedMultiplier);
        setTimeout(endSpeedUp, SPEED_UP_DURATION);
    }

    function endSpeedUp() {
        isSpeedUp = false;
        speedMultiplier = 1;
        speedUpIndicator.style.display = 'none';
        playSound(sfxSpeedDown);
        // Reset cup spawn rate
        clearInterval(cupInterval);
        cupInterval = setInterval(createCup, BASE_CUP_SPAWN_RATE / (speedMultiplier * fluctuatingSpeedFactor));
    }

    function adjustSpeedFluctuation() {
        fluctuatingSpeedFactor = FLUCTUATION_MIN + (Math.random() * (FLUCTUATION_MAX - FLUCTUATION_MIN));
        // Re-adjust cup spawn rate based on new fluctuation factor
        clearInterval(cupInterval);
        cupInterval = setInterval(createCup, BASE_CUP_SPAWN_RATE / (speedMultiplier * fluctuatingSpeedFactor));
    }

    function createCup() {
        if (!isPlaying || activeBelts.length === 0) return;

        // Randomly select an active belt to spawn the cup on
        const targetBelt = activeBelts[Math.floor(Math.random() * activeBelts.length)];

        const cup = document.createElement('div');
        cup.classList.add('cup');

        const cupImg = document.createElement('img');
        cup.appendChild(cupImg);

        // Assign a random cup type
        const randomCupType = CUP_TYPES[Math.floor(Math.random() * CUP_TYPES.length)];
        cup.dataset.cupType = randomCupType; // Store type in data attribute
        cupImg.src = `images/${randomCupType}.png`;
        cupImg.alt = randomCupType;


        // Check for golden cup spawn chance
        if (Math.random() < GOLDEN_CUP_CHANCE && !isBonusTime) {
            cup.classList.add('golden-cup');
            cupImg.src = 'images/golden.png';
            cupImg.alt = 'Golden Cup';
        } else {
            // 40% chance of being defective
            if (Math.random() < 0.4) {
                cup.classList.add('defective');
                // Assign a random defect type
                const defectType = isBonusTime ? 'crack' : DEFECT_TYPES[Math.floor(Math.random() * DEFECT_TYPES.length)];
                cup.dataset.defectType = defectType; // Store type in data attribute

                // Add defect image overlay
                const defectImg = document.createElement('img');
                defectImg.classList.add('defect-overlay');
                defectImg.src = `images/${defectType}.png`;
                defectImg.alt = defectType;
                cup.appendChild(defectImg);
            }
        }

        cup.style.left = '100%'; // Start off-screen to the right of its parent belt
        // Adjust top position to be centered on the belt
        const cupHeight = 100; // from CSS
        const beltHeight = targetBelt.offsetHeight; // Get actual belt height
        cup.style.top = `${(beltHeight / 2) - (cupHeight / 2)}px`;

        targetBelt.appendChild(cup); // Append cup to the selected belt
    }

    function moveCups() {
        // Iterate over all active belts
        activeBelts.forEach(belt => {
            // Get all cups on this specific belt
            const cups = belt.querySelectorAll('.cup');
            cups.forEach(cup => {
                const currentLeft = parseFloat(cup.style.left);
                // Move cup relative to its parent belt, adjusted by speedMultiplier and fluctuation
                cup.style.left = `${currentLeft - (BASE_GAME_SPEED * speedMultiplier * fluctuatingSpeedFactor / belt.offsetWidth * 100)}%`; // Move by percentage

                if (currentLeft < -10) { // Cup is off-screen to the left (adjust threshold for percentage)
                    if (cup.classList.contains('defective')) {
                        // Missed a defective cup
                        score -= 50;
                        combo = 0; // Missed a defective cup also breaks combo
                        updateUI();
                        playSound(sfxMiss);
                    }
                    cup.remove();
                }
            });
        });
    }

    function handleCupClick(event) {
        if (!isPlaying) return;

        const clickedCup = event.target.closest('.cup'); // Find the closest parent with the .cup class
        if (!clickedCup) return; // If no .cup parent was found, exit

        let pointsChange = 0;
        let isCorrect = false;

        if (clickedCup.classList.contains('golden-cup')) {
            startBonusTime();
            pointsChange = 0; // Golden cup doesn't give points directly
            isCorrect = true; // It's a correct action to click it
            playSound(sfxGolden);
        } else if (clickedCup.classList.contains('defective')) {
            // Correctly identified a defective cup
            let basePoints = 100;
            if (combo >= 15) {
                basePoints *= 2.0; // 2.0x for 15+ combo
            } else if (combo >= 10) {
                basePoints *= 1.5; // 1.5x for 10-14 combo
            } else if (combo >= 5) {
                basePoints *= 1.2; // 1.2x for 5-9 combo
            }
            pointsChange = (basePoints * bonusTimeMultiplier);
            score += pointsChange;
            combo++;
            lastSuccessfulClickTime = Date.now(); // Update last successful click time
            isCorrect = true;
            playSound(sfxCorrect);
        } else {
            // Mistake - clicked a good cup
            pointsChange = -200;
            score += pointsChange;
            combo = 0; // Mistake breaks combo
            isCorrect = false;
            playSound(sfxMistake);
        }

        showFeedback(clickedCup, pointsChange, isCorrect);
        clickedCup.remove();
        updateUI();
    }

    function showFeedback(cupElement, points, isCorrect) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.classList.add('feedback-popup');
        feedbackDiv.textContent = (points > 0 ? '+' : '') + points;
        feedbackDiv.style.color = isCorrect ? '#4CAF50' : '#F44336'; // Green for correct, Red for incorrect

        // Position the feedback relative to the cup
        const cupRect = cupElement.getBoundingClientRect();
        const gameAreaRect = gameArea.getBoundingClientRect();

        feedbackDiv.style.left = `${cupRect.left - gameAreaRect.left + cupRect.width / 2}px`;
        feedbackDiv.style.top = `${cupRect.top - gameAreaRect.top - 20}px`; // Above the cup

        gameArea.appendChild(feedbackDiv);

        // Remove feedback after animation
        feedbackDiv.addEventListener('animationend', () => {
            feedbackDiv.remove();
        });
    }

    function startBonusTime() {
        isBonusTime = true;
        bonusTimeMultiplier = 3;
        bonusTimeIndicator.style.display = 'block';
        playSound(sfxGolden);
        setTimeout(endBonusTime, BONUS_DURATION);
    }

    function endBonusTime() {
        isBonusTime = false;
        bonusTimeMultiplier = 1;
        bonusTimeIndicator.style.display = 'none';
    }

    function updateUI() {
        scoreDisplay.textContent = score;
        timerDisplay.textContent = timer;
        comboDisplay.textContent = `${combo}x`;
    }

    function returnToStartScreen() {
        endScreen.style.display = 'none';
        startScreen.style.display = 'flex';
    }
});