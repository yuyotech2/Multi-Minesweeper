const ROWS = 16;
const COLS = 16;
const MINES = 40;

let gameActive = false;

// WebRTC Networking Variables
let peer = null;
let conn = null;
let isHost = false;
let localPlayerId = '';

// Initialize PeerJS
function initNetwork() {
    peer = new Peer(); // Use free public PeerJS server
    
    peer.on('open', (id) => {
        document.getElementById('connection-status').classList.add('hidden');
        document.getElementById('menu-buttons').classList.remove('hidden');
    });
    
    peer.on('error', (err) => {
        console.error(err);
        document.getElementById('connection-status').textContent = "Connection Error. Please refresh.";
    });
}

function generateRoomCode() {
    return 'NEON-' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function setupConnection() {
    conn.on('open', () => {
        document.getElementById('matchmaking-overlay').classList.add('hidden');
        
        if (isHost) {
            let mineSeed = generateMines();
            let seedArr = Array.from(mineSeed);
            conn.send({ type: 'INIT', seed: seedArr });
            startGame(mineSeed);
        }
    });

    conn.on('data', (data) => {
        if (data.type === 'INIT') {
            document.getElementById('matchmaking-overlay').classList.add('hidden');
            let mineSeed = new Set(data.seed);
            startGame(mineSeed);
        } else if (data.type === 'REVEAL') {
            let board = data.player === 'p1' ? p1Board : p2Board;
            board.reveal(data.r, data.c, true);
        } else if (data.type === 'FLAG') {
            let board = data.player === 'p1' ? p1Board : p2Board;
            board.toggleFlag(data.r, data.c, true);
        } else if (data.type === 'PENALTY') {
            let board = data.player === 'p1' ? p1Board : p2Board;
            board.triggerPenalty(true);
        } else if (data.type === 'REMATCH') {
            if (isHost) {
                let mineSeed = generateMines();
                conn.send({ type: 'INIT', seed: Array.from(mineSeed) });
                startGame(mineSeed);
            }
        }
    });
    
    conn.on('close', () => {
        alert("Opponent disconnected!");
        location.reload();
    });
}

// UI Buttons for Matchmaking
document.getElementById('btn-host').onclick = () => {
    isHost = true;
    localPlayerId = 'p1';
    let roomCode = generateRoomCode();
    
    peer.destroy(); // Reconnect with a specific beautiful ID
    peer = new Peer(roomCode);
    
    peer.on('open', (id) => {
        document.getElementById('menu-buttons').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');
        document.getElementById('display-room-code').textContent = id;
    });

    peer.on('connection', (connection) => {
        if (conn) return;
        conn = connection;
        setupConnection();
    });
};

document.getElementById('btn-join').onclick = () => {
    let code = document.getElementById('join-code').value.toUpperCase().trim();
    if (!code) return;
    
    isHost = false;
    localPlayerId = 'p2';
    document.getElementById('btn-join').textContent = "CONNECTING...";
    
    conn = peer.connect(code);
    setupConnection();
};

function generateMines() {
    let minePositions = new Set();
    while (minePositions.size < MINES) {
        let r = Math.floor(Math.random() * ROWS);
        let c = Math.floor(Math.random() * COLS);
        minePositions.add(`${r},${c}`);
    }
    return minePositions;
}

// Game Logic
let p1Board, p2Board;

class Board {
    constructor(playerId, minePositions, isLocal) {
        this.playerId = playerId;
        this.isLocal = isLocal;
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

        // Visual distinction for the remote player's board
        if (!this.isLocal) {
            document.getElementById(`${playerId}-side`).style.opacity = '0.5';
            this.container.style.pointerEvents = 'none';
        } else {
            document.getElementById(`${playerId}-side`).style.opacity = '1';
            this.container.style.pointerEvents = 'auto';
        }
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

        // Pre-calculate numbers
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
        if (!gameActive || this.isFrozen || !this.isLocal) return;
        
        let cell = this.grid[r][c];
        
        // Right click
        if (e.button === 2) {
            this.toggleFlag(r, c, false);
            return;
        }
        
        // Left click
        if (e.button === 0) {
            if (cell.isFlagged || cell.isRevealed) return;
            
            if (cell.isMine) {
                this.triggerPenalty(false);
            } else {
                this.reveal(r, c, false);
                this.checkWin();
            }
        }
    }

    toggleFlag(r, c, fromNetwork) {
        let cell = this.grid[r][c];
        if (cell.isRevealed) return;
        
        cell.isFlagged = !cell.isFlagged;
        this.flagsPlaced += cell.isFlagged ? 1 : -1;
        this.updateCellUI(r, c);
        this.updateHUD();

        if (this.isLocal && !fromNetwork && conn) {
            conn.send({ type: 'FLAG', player: this.playerId, r, c });
        }
    }

    reveal(r, c, fromNetwork) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
        let cell = this.grid[r][c];
        
        if (cell.isRevealed || cell.isFlagged) return;
        
        cell.isRevealed = true;
        this.revealedCount++;
        this.updateCellUI(r, c);

        if (this.isLocal && !fromNetwork && conn) {
            conn.send({ type: 'REVEAL', player: this.playerId, r, c });
        }
        
        if (cell.neighborMines === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    this.reveal(r + dr, c + dc, fromNetwork);
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
            cellEl.textContent = '';
        } else {
            cellEl.classList.remove('flagged');
            cellEl.textContent = '';
        }
    }

    triggerPenalty(fromNetwork) {
        this.isFrozen = true;
        this.overlay.classList.remove('hidden');
        let timeLeft = 5;
        this.timerSpan.textContent = timeLeft;
        
        if (this.isLocal && !fromNetwork && conn) {
            conn.send({ type: 'PENALTY', player: this.playerId });
        }

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

function startGame(seed) {
    p1Board = new Board('p1', seed, localPlayerId === 'p1');
    p2Board = new Board('p2', seed, localPlayerId === 'p2');
    gameActive = true;
    document.getElementById('winner-modal').classList.add('hidden');
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

document.getElementById('rematch-btn').addEventListener('click', () => {
    document.getElementById('winner-text').textContent = "WAITING...";
    if (conn) {
        conn.send({ type: 'REMATCH' });
    }
    // If host, also trigger init locally handled in conn.on('REMATCH') equivalent, but we put it there
    if (isHost) {
        let mineSeed = generateMines();
        conn.send({ type: 'INIT', seed: Array.from(mineSeed) });
        startGame(mineSeed);
    }
});

// Initialize empty boards so it looks nice before starting
p1Board = new Board('p1', new Set(), false);
p2Board = new Board('p2', new Set(), false);

// Prevent global right click menu
window.addEventListener('contextmenu', e => e.preventDefault());

// Start networking
initNetwork();
