let board = [];
let score = 0;
const size = 4;

function initGame() {
    board = Array(size).fill().map(() => Array(size).fill(0));
    score = 0;
    document.getElementById('score').textContent = score;
    document.getElementById('gameOver').style.display = 'none';

    // 添加初始的1
    addNewTile();
    updateDisplay();
}

function addNewTile() {
    let emptyCells = [];
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (board[i][j] === 0) {
                emptyCells.push({ x: i, y: j });
            }
        }
    }

    if (emptyCells.length > 0) {
        let randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        board[randomCell.x][randomCell.y] = 1;
        return true;
    }
    return false;
}

function updateDisplay() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.setAttribute('data-value', board[i][j]);
            cell.textContent = board[i][j] === 0 ? '' : board[i][j];
            grid.appendChild(cell);
        }
    }
}

function move(direction) {
    let moved = false;
    let newBoard = board.map(row => [...row]);

    if (direction === 'left') {
        for (let i = 0; i < size; i++) {
            let row = newBoard[i].filter(val => val !== 0);
            for (let j = 0; j < row.length - 1; j++) {
                if (row[j] === row[j + 1]) {
                    row[j] *= 2;
                    score += row[j];
                    row.splice(j + 1, 1);
                }
            }
            while (row.length < size) {
                row.push(0);
            }
            newBoard[i] = row;
        }
    } else if (direction === 'right') {
        for (let i = 0; i < size; i++) {
            let row = newBoard[i].filter(val => val !== 0);
            for (let j = row.length - 1; j > 0; j--) {
                if (row[j] === row[j - 1]) {
                    row[j] *= 2;
                    score += row[j];
                    row.splice(j - 1, 1);
                    j--;
                }
            }
            while (row.length < size) {
                row.unshift(0);
            }
            newBoard[i] = row;
        }
    } else if (direction === 'up') {
        for (let j = 0; j < size; j++) {
            let col = [];
            for (let i = 0; i < size; i++) {
                if (newBoard[i][j] !== 0) {
                    col.push(newBoard[i][j]);
                }
            }
            for (let i = 0; i < col.length - 1; i++) {
                if (col[i] === col[i + 1]) {
                    col[i] *= 2;
                    score += col[i];
                    col.splice(i + 1, 1);
                }
            }
            while (col.length < size) {
                col.push(0);
            }
            for (let i = 0; i < size; i++) {
                newBoard[i][j] = col[i];
            }
        }
    } else if (direction === 'down') {
        for (let j = 0; j < size; j++) {
            let col = [];
            for (let i = 0; i < size; i++) {
                if (newBoard[i][j] !== 0) {
                    col.push(newBoard[i][j]);
                }
            }
            for (let i = col.length - 1; i > 0; i--) {
                if (col[i] === col[i - 1]) {
                    col[i] *= 2;
                    score += col[i];
                    col.splice(i - 1, 1);
                    i--;
                }
            }
            while (col.length < size) {
                col.unshift(0);
            }
            for (let i = 0; i < size; i++) {
                newBoard[i][j] = col[i];
            }
        }
    }

    // 检查是否有变化
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (newBoard[i][j] !== board[i][j]) {
                moved = true;
                break;
            }
        }
    }

    if (moved) {
        board = newBoard;
        document.getElementById('score').textContent = score;
        addNewTile();
        updateDisplay();

        if (isGameOver()) {
            document.getElementById('gameOver').style.display = 'flex';
        }
    }
}

function isGameOver() {
    // 检查是否有空单元格
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (board[i][j] === 0) {
                return false;
            }
        }
    }

    // 检查是否还有可合并的相邻单元格
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (j < size - 1 && board[i][j] === board[i][j + 1]) {
                return false;
            }
            if (i < size - 1 && board[i][j] === board[i + 1][j]) {
                return false;
            }
        }
    }

    return true;
}

// 键盘事件监听
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        move('up');
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        move('down');
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        move('left');
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        move('right');
    }
});

// 初始化游戏
initGame();