const ROWS = 16;
const COLS = 16;
const MINES = 40;

let gameActive = false;
let peer = null;
let conn = null;
let isHost = false;
let localPlayerId = 'p1';

// URL Parsing
const urlParams = new URLSearchParams(window.location.search);
const joinRoomParam = urlParams.get('room');

// Initialize Peer
function initNetwork() {
    console.log("Initializing Peer...");
    // If joining, we don't need a specific ID, just connect
    peer = new Peer();
    
    peer.on('open', (id) => {
        console.log("Peer opened with ID:", id);
        document.getElementById('connection-status').classList.add('hidden');
        
        if (joinRoomParam) {
            isHost = false;
            localPlayerId = 'p2';
            document.getElementById('joining-screen').classList.remove('hidden');
            conn = peer.connect(joinRoomParam);
            setupConnection();
        } else {
            document.getElementById('menu-buttons').classList.remove('hidden');
        }
    });
    
    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        alert("Connection Error: " + err.type);
    });
}

function setupConnection() {
    if (!conn) return;

    conn.on('open', () => {
        console.log("Connection opened!");
        document.getElementById('matchmaking-overlay').classList.add('hidden');
        window.history.replaceState({}, document.title, window.location.pathname);
        
        if (isHost) {
            let s1 = generateMines();
            let s2 = generateMines();
            conn.send({ type: 'INIT', s1: Array.from(s1), s2: Array.from(s2) });
            startGame(s1, s2);
        }
    });

    conn.on('data', (data) => {
        if (data.type === 'INIT') {
            document.getElementById('matchmaking-overlay').classList.add('hidden');
            startGame(new Set(data.s1), new Set(data.s2));
        } else if (data.type === 'REVEAL') {
            let b = data.p === 'p1' ? p1Board : p2Board;
            b.reveal(data.r, data.c, true);
        } else if (data.type === 'FLAG') {
            let b = data.p === 'p1' ? p1Board : p2Board;
            b.toggleFlag(data.r, data.c, true);
        } else if (data.type === 'LOSS') {
            let b = data.p === 'p1' ? p1Board : p2Board;
            b.triggerLoss(true);
        } else if (data.type === 'REMATCH') {
            if (isHost) {
                let s1 = generateMines();
                let s2 = generateMines();
                conn.send({ type: 'INIT', s1: Array.from(s1), s2: Array.from(s2) });
                startGame(s1, s2);
            }
        }
    });
}

document.getElementById('btn-host').onclick = () => {
    isHost = true;
    localPlayerId = 'p1';
    
    // We use the ID Peer gave us as the room code
    document.getElementById('menu-buttons').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
    
    let url = window.location.href.split('?')[0] + "?room=" + peer.id;
    document.getElementById('invite-link-display').value = url;
    
    peer.on('connection', (c) => {
        if (conn) return;
        conn = c;
        setupConnection();
    });
};

document.getElementById('btn-copy').onclick = () => {
    let inp = document.getElementById("invite-link-display");
    inp.select();
    document.execCommand("copy");
    document.getElementById('btn-copy').textContent = "COPIED!";
};

document.getElementById('btn-offline').onclick = () => {
    document.getElementById('matchmaking-overlay').classList.add('hidden');
    let s = generateMines();
    startGame(s, s); // Same seed for offline test
};

function generateMines() {
    let set = new Set();
    while (set.size < MINES) {
        set.add(`${Math.floor(Math.random()*ROWS)},${Math.floor(Math.random()*COLS)}`);
    }
    return set;
}

let p1Board, p2Board;

class Board {
    constructor(id, mines, local) {
        this.id = id;
        this.local = local;
        this.mines = mines;
        this.container = document.getElementById(`${id}-board`);
        this.overlay = document.getElementById(`${id}-overlay`);
        this.flagTxt = document.getElementById(`${id}-mines`);
        this.grid = [];
        this.revealed = 0;
        this.flags = 0;
        this.frozen = false;
        this.init();
    }

    init() {
        this.grid = Array.from({length: ROWS}, (_, r) => 
            Array.from({length: COLS}, (_, c) => ({
                isM: this.mines.has(`${r},${c}`),
                isR: false,
                isF: false,
                n: 0
            }))
        );

        for(let r=0; r<ROWS; r++) {
            for(let c=0; c<COLS; c++) {
                if(!this.grid[r][c].isM) {
                    let count = 0;
                    for(let dr=-1; dr<=1; dr++) {
                        for(let dc=-1; dc<=1; dc++) {
                            let nr=r+dr, nc=c+dc;
                            if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&this.grid[nr][nc].isM) count++;
                        }
                    }
                    this.grid[r][c].n = count;
                }
            }
        }
        this.render();
    }

    render() {
        this.container.innerHTML = '';
        this.container.style.gridTemplateColumns = `repeat(${COLS}, 24px)`;
        for(let r=0; r<ROWS; r++) {
            for(let c=0; c<COLS; c++) {
                let div = document.createElement('div');
                div.className = 'cell';
                div.onmousedown = (e) => this.click(e, r, c);
                this.container.appendChild(div);
            }
        }
        this.updateUI();
    }

    updateUI() {
        this.flagTxt.textContent = String(MINES - this.flags).padStart(3, '0');
        document.getElementById(`${this.id}-side`).style.opacity = this.local ? '1' : '0.6';
    }

    click(e, r, c) {
        if(!gameActive || this.frozen || !this.local) return;
        if(e.button === 2) this.toggleFlag(r, c, false);
        else if(e.button === 0) this.reveal(r, c, false);
    }

    toggleFlag(r, c, net) {
        let cell = this.grid[r][c];
        if(cell.isR) return;
        cell.isF = !cell.isF;
        this.flags += cell.isF ? 1 : -1;
        this.drawCell(r, c);
        this.updateUI();
        if(this.local && !net && conn) conn.send({type:'FLAG', p:this.id, r, c});
    }

    reveal(r, c, net) {
        if(r<0||r>=ROWS||c<0||c>=COLS) return;
        let cell = this.grid[r][c];
        if(cell.isR || cell.isF) return;
        
        cell.isR = true;
        this.revealed++;
        this.drawCell(r, c);

        if(this.local && !net && conn) conn.send({type:'REVEAL', p:this.id, r, c});

        if(cell.isM) {
            this.triggerLoss(net);
        } else {
            if(cell.n === 0) {
                for(let dr=-1; dr<=1; dr++)
                    for(let dc=-1; dc<=1; dc++)
                        this.reveal(r+dr, c+dc, net);
            }
            if(this.revealed === (ROWS*COLS)-MINES) endGame(this.id);
        }
    }

    drawCell(r, c) {
        let cell = this.grid[r][c];
        let el = this.container.children[r*COLS + c];
        el.className = 'cell' + (cell.isR ? ' revealed' : '') + (cell.isF ? ' flagged' : '');
        el.textContent = '';
        if(cell.isR) {
            if(cell.isM) el.textContent = '💣';
            else if(cell.n > 0) {
                el.textContent = cell.n;
                el.classList.add('num-'+cell.n);
            }
        }
    }

    triggerLoss(net) {
        this.frozen = true;
        if(this.local && !net && conn) conn.send({type:'LOSS', p:this.id});
        for(let r=0; r<ROWS; r++)
            for(let c=0; c<COLS; c++)
                if(this.grid[r][c].isM) { this.grid[r][c].isR = true; this.drawCell(r, c); }
        endGame(this.id === 'p1' ? 'p2' : 'p1');
    }
}

function startGame(s1, s2) {
    p1Board = new Board('p1', s1, localPlayerId === 'p1');
    p2Board = new Board('p2', s2, localPlayerId === 'p2');
    gameActive = true;
    document.getElementById('winner-modal').classList.add('hidden');
}

function endGame(winId) {
    gameActive = false;
    document.getElementById('winner-modal').classList.remove('hidden');
    document.getElementById('winner-text').textContent = (winId === 'p1' ? 'PLAYER 1' : 'PLAYER 2') + " WINS!";
}

document.getElementById('rematch-btn').onclick = () => {
    if(conn) conn.send({type:'REMATCH'});
    if(isHost) {
        let s1 = generateMines(), s2 = generateMines();
        conn.send({type:'INIT', s1: Array.from(s1), s2: Array.from(s2)});
        startGame(s1, s2);
    }
};

initNetwork();
window.oncontextmenu = (e) => e.preventDefault();
