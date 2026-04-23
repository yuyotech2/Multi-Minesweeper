const ROWS = 16;
const COLS = 16;
const MINES = 40;

let mineSeed = [];
let gameActive = false;

// Generate a random seed of mine coordinates
function generateMines() {
    let minePositions = new Set();
    while (minePositions.size < MINES) {
        let r = Math.floor(Math.random() * ROWS);
        let c = Math.floor(Math.random() * COLS);
        minePositions.add(`${r},${c}`);
    }
    return minePositions;
}

class Board {
    constructor(playerId, minePositions) {
        this.playerId = playerId;
        this.container = document.getElementById(`${playerId}-board`);
        this.overlay = document.getElementById(`${playerId}-overlay`);
        this.timerSpan = this.overlay.querySelector('.penalty-timer');
        this.flagsSpan = document.getElementById(`${playerId}-mines`);
        this.minePositions = minePositions;
        
        this.grid = [];
        this.revealedCount = 0;
        this.flagsPlaced = 0;
        this.isFrozen = false;
        
        this.initGrid();
        this.render();
        this.updateHUD();
    }

    initGrid() {
        for (let r = 0; r < ROWS; r++) {
            let row = [];
            for (let c = 0; c < COLS; c++) {
                row.push({
                    isMine: this.minePositions.has(`${r},${c}`),
                    isRevealed: false,
                    isFlagged: false,
                    neighborMines: 0
                });
            }
            this.grid.push(row);
        }

        // Pre-calculate neighbor numbers
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!this.grid[r][c].isMine) {
                    let count = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            let nr = r + dr;
                            let nc = c + dc;
                            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                                if (this.grid[nr][nc].isMine) count++;
                            }
                        }
                    }
                    this.grid[r][c].neighborMines = count;
                }
            }
        }
    }

    render() {
        this.container.innerHTML = '';
        this.container.style.gridTemplateColumns = `repeat(${COLS}, 30px)`;
        
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                let cellEl = document.createElement('div');
                cellEl.classList.add('cell');
                cellEl.dataset.r = r;
                cellEl.dataset.c = c;
                
                cellEl.addEventListener('mousedown', (e) => this.handleInteraction(e, r, c));
                cellEl.addEventListener('contextmenu', (e) => e.preventDefault());
                
                this.container.appendChild(cellEl);
            }
        }
    }

    updateHUD() {
        if (this.flagsSpan) {
            this.flagsSpan.textContent = `Mines: ${MINES - this.flagsPlaced}`;
        }
    }

    handleInteraction(e, r, c) {
        if (!gameActive || this.isFrozen) return;
        
        let cell = this.grid[r][c];
        
        // Right click flag
        if (e.button === 2) {
            if (!cell.isRevealed) {
                cell.isFlagged = !cell.isFlagged;
                this.flagsPlaced += cell.isFlagged ? 1 : -1;
                this.updateCellUI(r, c);
                this.updateHUD();
            }
            return;
        }
        
        // Left click
        if (e.button === 0) {
            if (cell.isFlagged || cell.isRevealed) return;
            
            if (cell.isMine) {
                this.triggerPenalty();
            } else {
                this.reveal(r, c);
                this.checkWin();
            }
        }
    }

    reveal(r, c) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
        let cell = this.grid[r][c];
        
        if (cell.isRevealed || cell.isFlagged) return;
        
        cell.isRevealed = true;
        this.revealedCount++;
        this.updateCellUI(r, c);
        
        // Auto-reveal neighbors if 0
        if (cell.neighborMines === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    this.reveal(r + dr, c + dc);
                }
            }
        }
    }

    updateCellUI(r, c) {
        let cell = this.grid[r][c];
        let idx = r * COLS + c;
        let cellEl = this.container.children[idx];
        
        if (cell.isRevealed) {
            cellEl.classList.add('revealed');
            cellEl.classList.remove('flagged');
            if (cell.isMine) {
                cellEl.classList.add('mine');
                cellEl.textContent = '💣';
            } else if (cell.neighborMines > 0) {
                cellEl.textContent = cell.neighborMines;
                cellEl.classList.add(`num-${cell.neighborMines}`);
            }
        } else if (cell.isFlagged) {
            cellEl.classList.add('flagged');
            cellEl.textContent = ''; // Managed by CSS ::after
        } else {
            cellEl.classList.remove('flagged');
            cellEl.textContent = '';
        }
    }

    triggerPenalty() {
        this.isFrozen = true;
        this.overlay.classList.remove('hidden');
        let timeLeft = 5;
        this.timerSpan.textContent = timeLeft;
        
        let interval = setInterval(() => {
            timeLeft--;
            this.timerSpan.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(interval);
                this.isFrozen = false;
                this.overlay.classList.add('hidden');
            }
        }, 1000);
    }

    checkWin() {
        let safeCells = (ROWS * COLS) - MINES;
        if (this.revealedCount === safeCells) {
            endGame(this.playerId);
        }
    }
}

let p1Board, p2Board;

function startGame() {
    mineSeed = generateMines();
    p1Board = new Board('p1', mineSeed);
    p2Board = new Board('p2', mineSeed);
    gameActive = true;
    
    document.getElementById('winner-modal').classList.add('hidden');
    document.getElementById('start-btn').textContent = "RESTART";
}

function endGame(winnerId) {
    gameActive = false;
    let modal = document.getElementById('winner-modal');
    let text = document.getElementById('winner-text');
    
    modal.classList.remove('hidden');
    if (winnerId === 'p1') {
        text.textContent = 'PLAYER 1 WINS';
        text.style.color = 'var(--p1-color)';
        text.style.textShadow = '0 0 20px var(--p1-color)';
    } else {
        text.textContent = 'PLAYER 2 WINS';
        text.style.color = 'var(--p2-color)';
        text.style.textShadow = '0 0 20px var(--p2-color)';
    }
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('rematch-btn').addEventListener('click', startGame);

// Initialize empty display boards
p1Board = new Board('p1', new Set());
p2Board = new Board('p2', new Set());

// Prevent global right click menu
window.addEventListener('contextmenu', e => e.preventDefault());
