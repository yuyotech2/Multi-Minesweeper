const ROWS = 16;
const COLS = 16;
const MINES = 40;

let gameActive = false;

// URL Parsing for Invites
const urlParams = new URLSearchParams(window.location.search);
const joinRoomParam = urlParams.get('room');

// WebRTC Networking Variables
let peer = null;
let conn = null;
let isHost = false;
let localPlayerId = '';

// Check if player joined via URL Invite
if (joinRoomParam) {
    isHost = false;
    localPlayerId = 'p2';
    document.getElementById('menu-buttons').classList.add('hidden');
    document.getElementById('joining-screen').classList.remove('hidden');
}

// Initialize PeerJS
function initNetwork() {
    peer = new Peer(); 
    
    peer.on('open', (id) => {
        document.getElementById('connection-status').classList.add('hidden');
        
        if (joinRoomParam) {
            // Automatically connect to the host's room code from the URL
            conn = peer.connect(joinRoomParam);
            setupConnection();
        } else {
            // Show the Host button if no room in URL
            document.getElementById('menu-buttons').classList.remove('hidden');
        }
    });
    
    peer.on('error', (err) => {
        console.error(err);
        document.getElementById('connection-status').textContent = "Connection Error. Please refresh.";
    });
}

function generateRoomCode() {
    return 'NEON-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function setupConnection() {
    conn.on('open', () => {
        document.getElementById('matchmaking-overlay').classList.add('hidden');
        
        // Remove ?room=... from URL visually so it looks clean
        window.history.replaceState({}, document.title, window.location.pathname);
        
        if (isHost) {
            let seed1 = generateMines();
            let seed2 = generateMines();
            conn.send({ type: 'INIT', seed1: Array.from(seed1), seed2: Array.from(seed2) });
            startGame(seed1, seed2);
        }
    });

    conn.on('data', (data) => {
        if (data.type === 'INIT') {
            document.getElementById('matchmaking-overlay').classList.add('hidden');
            let seed1 = new Set(data.seed1);
            let seed2 = new Set(data.seed2);
            startGame(seed1, seed2);
        } else if (data.type === 'REVEAL') {
            let board = data.player === 'p1' ? p1Board : p2Board;
            board.reveal(data.r, data.c, true);
        } else if (data.type === 'FLAG') {
            let board = data.player === 'p1' ? p1Board : p2Board;
            board.toggleFlag(data.r, data.c, true);
        } else if (data.type === 'LOSS') {
            let board = data.player === 'p1' ? p1Board : p2Board;
            board.triggerLoss(true);
        } else if (data.type === 'REMATCH') {
            if (isHost) {
                let seed1 = generateMines();
                let seed2 = generateMines();
                conn.send({ type: 'INIT', seed1: Array.from(seed1), seed2: Array.from(seed2) });
                startGame(seed1, seed2);
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
    
    peer.destroy(); 
    peer = new Peer(roomCode);
    
    peer.on('open', (id) => {
        document.getElementById('menu-buttons').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');
        
        // Generate the URL Invite Link
        let currentUrl = window.location.href.split('?')[0];
        let inviteLink = `${currentUrl}?room=${id}`;
        document.getElementById('invite-link-display').value = inviteLink;
    });

    peer.on('connection', (connection) => {
        if (conn) return;
        conn = connection;
        setupConnection();
    });
};

document.getElementById('btn-copy').onclick = () => {
    let copyText = document.getElementById("invite-link-display");
    copyText.select();
    document.execCommand("copy");
    document.getElementById('btn-copy').textContent = "COPIED TO CLIPBOARD!";
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
        
        if (e.button === 2) {
            this.toggleFlag(r, c, false);
            return;
        }
        
        if (e.button === 0) {
            if (cell.isFlagged || cell.isRevealed) return;
            
            if (cell.isMine) {
                this.triggerLoss(false);
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

    triggerLoss(fromNetwork) {
        this.isFrozen = true;
        
        if (this.isLocal && !fromNetwork && conn) {
            conn.send({ type: 'LOSS', player: this.playerId });
        }
        
        // Expose all mines on this board
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (this.grid[r][c].isMine) {
                    this.grid[r][c].isRevealed = true;
                    this.updateCellUI(r, c);
                }
            }
        }

        // The opponent wins
        let winnerId = this.playerId === 'p1' ? 'p2' : 'p1';
        endGame(winnerId);
    }

    checkWin() {
        let safeCells = (ROWS * COLS) - MINES;
        if (this.revealedCount === safeCells) {
            endGame(this.playerId);
        }
    }
}

function startGame(seed1, seed2) {
    p1Board = new Board('p1', seed1, localPlayerId === 'p1');
    p2Board = new Board('p2', seed2, localPlayerId === 'p2');
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
        text.style.color = 'cyan';
    } else {
        text.textContent = 'PLAYER 2 WINS';
        text.style.color = 'orange';
    }
}

document.getElementById('rematch-btn').addEventListener('click', () => {
    document.getElementById('winner-text').textContent = "WAITING...";
    if (conn) {
        conn.send({ type: 'REMATCH' });
    }
    if (isHost) {
        let seed1 = generateMines();
        let seed2 = generateMines();
        conn.send({ type: 'INIT', seed1: Array.from(seed1), seed2: Array.from(seed2) });
        startGame(seed1, seed2);
    }
});

p1Board = new Board('p1', new Set(), false);
p2Board = new Board('p2', new Set(), false);

window.addEventListener('contextmenu', e => e.preventDefault());

initNetwork();
