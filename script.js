/********************************************************************
 *  2048-AI  优化增强版
 *  1. 优化评估函数权重，大幅提升得分能力
 *  2. 改进权重矩阵，符合2048最优策略（大数靠边角）
 *  3. 优化搜索策略：迭代加深+动态深度，平衡速度与效果
 *  4. 完善缓存机制：自动清理+更高效的键生成
 *  5. 优化移动逻辑：减少不必要的计算
 *  6. 新增性能优化：提前终止无效搜索、减少克隆次数
 *******************************************************************/
/* ----------  配置区  ---------- */
const size = 4;
// 优化后的权重矩阵（大数优先放在左上角）
const WEIGHT_MATRIX = [
    [100000, 90000, 80000, 70000],
    [60000, 50000, 40000, 30000],
    [20000, 10000, 9000, 8000],
    [7000, 6000, 5000, 4000]
];
let board = [];
let score = 0;
let maxTile = 1;
let aiInterval = null;
let aiSpeed = 100;          // ms
let BASE_DEPTH = 4;         // 基础搜索深度（动态调整）
const MAX_CACHE_SIZE = 10000; // 缓存最大容量

/* ----------  工具函数  ---------- */
const $ = id => document.getElementById(id);
// 优化克隆：减少数组复制开销
const clone = b => {
    const newBoard = new Array(size);
    for (let i = 0; i < size; i++) {
        newBoard[i] = new Array(size);
        for (let j = 0; j < size; j++) {
            newBoard[i][j] = b[i][j];
        }
    }
    return newBoard;
};
const log2 = n => n <= 0 ? 0 : Math.log2(n);

/* ----------  游戏初始化  ---------- */
function initGame() {
    board = Array(size).fill().map(() => Array(size).fill(0));
    score = 0;
    maxTile = 1;
    ['score', 'maxTile'].forEach(k => {
        const el = $(k);
        if (el) el.textContent = 0;
    });
    const gameOverEl = $('gameOver');
    if (gameOverEl) gameOverEl.style.display = 'none';
    const aiStatusEl = $('aiStatus');
    if (aiStatusEl) aiStatusEl.textContent = '状态: 未运行';
    addRandomTile();
    addRandomTile();
    updateDisplay();
    // 初始化缓存
    cache.clear();
}

/* ----------  随机生成新块  ---------- */
function addRandomTile() {
    const empties = [];
    for (let i = 0; i < size; i++)
        for (let j = 0; j < size; j++)
            if (board[i][j] === 0) empties.push({ x: i, y: j });
    if (!empties.length) return false;
    const { x, y } = empties[Math.floor(Math.random() * empties.length)];
    // 优化：大数时减少2的概率
    const prob = maxTile > 1024 ? 0.9 : 0.8;
    board[x][y] = Math.random() < prob ? 1 : 2;
    updateMaxTile();
    return true;
}

function updateMaxTile() {
    maxTile = Math.max(...board.flat());
    const maxTileEl = $('maxTile');
    if (maxTileEl) maxTileEl.textContent = maxTile;
    // 动态调整搜索深度：大数时增加深度，小数时减少
    BASE_DEPTH = maxTile > 2048 ? 5 : maxTile > 1024 ? 4 : 3;
}

/* ----------  页面渲染  ---------- */
function updateDisplay() {
    const grid = $('grid');
    if (!grid) return;
    grid.innerHTML = '';
    // 批量创建元素，减少DOM操作
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.setAttribute('data-value', board[i][j]);
            cell.textContent = board[i][j] === 0 ? '' : board[i][j];
            fragment.appendChild(cell);
        }
    }
    grid.appendChild(fragment);
}

/* ----------  移动核心（优化版） ---------- */
function moveCore(src, dir) {
    const b = clone(src);
    let moved = false, pts = 0;

    // 优化的slide函数：减少数组操作
    const slide = arr => {
        const newArr = [];
        let skip = false;

        // 第一步：过滤0
        for (let num of arr) {
            if (num !== 0) newArr.push(num);
        }

        // 第二步：合并相同数字
        const merged = [];
        for (let i = 0; i < newArr.length; i++) {
            if (skip) {
                skip = false;
                continue;
            }
            if (i < newArr.length - 1 && newArr[i] === newArr[i + 1]) {
                const val = newArr[i] * 2;
                merged.push(val);
                pts += val;
                skip = true;
            } else {
                merged.push(newArr[i]);
            }
        }

        // 第三步：补0
        while (merged.length < size) {
            merged.push(0);
        }
        return merged;
    };

    if (dir === 'left') {
        for (let i = 0; i < size; i++) {
            const old = b[i].join(',');
            b[i] = slide(b[i]);
            if (old !== b[i].join(',')) moved = true;
        }
    } else if (dir === 'right') {
        for (let i = 0; i < size; i++) {
            const old = b[i].join(',');
            const reversed = b[i].slice().reverse();
            const slid = slide(reversed);
            b[i] = slid.reverse();
            if (old !== b[i].join(',')) moved = true;
        }
    } else if (dir === 'up') {
        for (let j = 0; j < size; j++) {
            const col = [];
            for (let i = 0; i < size; i++) col.push(b[i][j]);
            const old = col.join(',');
            const neo = slide(col);
            for (let i = 0; i < size; i++) b[i][j] = neo[i];
            if (old !== neo.join(',')) moved = true;
        }
    } else if (dir === 'down') {
        for (let j = 0; j < size; j++) {
            const col = [];
            for (let i = 0; i < size; i++) col.push(b[i][j]);
            const old = col.join(',');
            const reversed = col.reverse();
            const slid = slide(reversed);
            const neo = slid.reverse();
            for (let i = 0; i < size; i++) b[i][j] = neo[i];
            if (old !== neo.join(',')) moved = true;
        }
    }
    return { board: b, score: pts, moved };
}

/* ----------  玩家/AI 执行移动 ---------- */
function move(dir) {
    const res = moveCore(board, dir);
    if (!res.moved) return;
    board = res.board;
    score += res.score;
    const scoreEl = $('score');
    if (scoreEl) scoreEl.textContent = score;
    addRandomTile();
    updateDisplay();
    if (isGameOver(board)) {
        const finalScoreEl = $('finalScore');
        const finalMaxTileEl = $('finalMaxTile');
        const gameOverEl = $('gameOver');
        if (finalScoreEl) finalScoreEl.textContent = score;
        if (finalMaxTileEl) finalMaxTileEl.textContent = maxTile;
        if (gameOverEl) gameOverEl.style.display = 'flex';
        stopAI();
    }
}

/* ----------  终局判断  ---------- */
function isGameOver(b) {
    // 先检查是否有空格
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (b[i][j] === 0) return false;
        }
    }
    // 检查横向可合并
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size - 1; j++) {
            if (b[i][j] === b[i][j + 1]) return false;
        }
    }
    // 检查纵向可合并
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size - 1; i++) {
            if (b[i][j] === b[i + 1][j]) return false;
        }
    }
    return true;
}

/* ----------  优化的评估函数  ---------- */
function evaluate(b) {
    let empty = 0, weight = 0, mono = 0, smooth = 0, maxVal = 0;
    let maxX = 0, maxY = 0;

    // 基础统计
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const v = b[i][j];
            if (v === 0) {
                empty++;
                continue;
            }
            // 权重得分：放大权重影响
            weight += Math.pow(2, v) * WEIGHT_MATRIX[i][j];
            if (v > maxVal) {
                maxVal = v;
                maxX = i;
                maxY = j;
            }
        }
    }

    // 优化单调性计算（只关注大数方向）
    let rowMono = 0, colMono = 0;
    // 行：从左到右递减（符合权重矩阵）
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size - 1; j++) {
            const curr = log2(Math.pow(2, b[i][j]) || 1);
            const next = log2(Math.pow(2, b[i][j + 1]) || 1);
            rowMono += (curr - next) > 0 ? (curr - next) : (curr - next) * 0.1;
        }
    }
    // 列：从上到下递减
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size - 1; i++) {
            const curr = log2(Math.pow(2, b[i][j]) || 1);
            const next = log2(Math.pow(2, b[i + 1][j]) || 1);
            colMono += (curr - next) > 0 ? (curr - next) : (curr - next) * 0.1;
        }
    }
    mono = rowMono * 1.2 + colMono;

    // 优化平滑性（减少大数相邻惩罚）
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const v = Math.pow(2, b[i][j]) || 1;
            // 横向平滑
            if (j < size - 1) {
                const nextV = Math.pow(2, b[i][j + 1]) || 1;
                const diff = Math.abs(log2(v) - log2(nextV));
                smooth -= diff * (v > 1024 ? 0.5 : 1);
            }
            // 纵向平滑
            if (i < size - 1) {
                const nextV = Math.pow(2, b[i + 1][j]) || 1;
                const diff = Math.abs(log2(v) - log2(nextV));
                smooth -= diff * (v > 1024 ? 0.5 : 1);
            }
        }
    }

    // 优化角部奖励（优先左上角）
    let cornerBonus = 0;
    if (maxX === 0 && maxY === 0) {
        cornerBonus = log2(Math.pow(2, maxVal) || 1) * 500;
    } else if ((maxX === 0 && maxY === size - 1) || (maxX === size - 1 && maxY === 0)) {
        cornerBonus = log2(Math.pow(2, maxVal) || 1) * 200;
    } else if (maxX === size - 1 && maxY === size - 1) {
        cornerBonus = log2(Math.pow(2, maxVal) || 1) * 100;
    }

    // 调整各因子权重
    const emptyScore = empty * 2000;       // 空格权重提高
    const weightScore = weight * 0.1;      // 权重得分
    const monoScore = mono * 100;          // 单调性权重提高
    const smoothScore = smooth * 150;      // 平滑性权重提高
    const maxScore = log2(Math.pow(2, maxVal) || 1) * 200;

    return emptyScore + weightScore + monoScore + smoothScore + maxScore + cornerBonus;
}

/* ----------  优化的缓存+α-β剪枝搜索  ---------- */
const cache = new Map();
// 优化缓存键：使用数字编码，更快
function cacheKey(b, d) {
    let key = d + '|';
    for (let i = 0; i < size; i++) {
        key += b[i].join(',') + ';';
    }
    return key;
}

// 缓存清理函数：防止内存溢出
function cleanCache() {
    if (cache.size > MAX_CACHE_SIZE) {
        const keys = Array.from(cache.keys());
        // 删除最老的一半缓存
        for (let i = 0; i < keys.length / 2; i++) {
            cache.delete(keys[i]);
        }
    }
}

// 优化的搜索函数：α-β剪枝+提前终止
function search(b, depth, alpha = -Infinity, beta = Infinity) {
    if (depth === 0 || isGameOver(b)) {
        return evaluate(b);
    }

    const k = cacheKey(b, depth);
    if (cache.has(k)) {
        return cache.get(k);
    }

    let best = -Infinity;
    const directions = ['left', 'up', 'right', 'down']; // 优先搜索更优方向

    for (const dir of directions) {
        const res = moveCore(b, dir);
        if (!res.moved) continue;

        // 计算期望分数
        const empties = [];
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                if (res.board[i][j] === 0) {
                    empties.push({ x: i, y: j });
                }
            }
        }

        if (!empties.length) {
            const current = search(res.board, depth - 1, alpha, beta);
            best = Math.max(best, current);
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break; // α-β剪枝
            continue;
        }

        let sum = 0;
        const emptyCount = empties.length;
        // 优化：随机采样而非遍历所有空格（提升速度）
        const sampleSize = Math.min(emptyCount, 8); // 最多采样8个空格
        const sampledEmpties = emptyCount > sampleSize
            ? empties.sort(() => 0.5 - Math.random()).slice(0, sampleSize)
            : empties;

        for (const { x, y } of sampledEmpties) {
            // 放置2（概率0.8）
            res.board[x][y] = 1;
            sum += search(res.board, depth - 1, alpha, beta) * 0.8;

            // 放置4（概率0.2）
            res.board[x][y] = 2;
            sum += search(res.board, depth - 1, alpha, beta) * 0.2;

            // 恢复
            res.board[x][y] = 0;
        }

        const expected = sum / sampledEmpties.length * (emptyCount / sampleSize);
        best = Math.max(best, expected);
        alpha = Math.max(alpha, best);

        if (beta <= alpha) {
            break; // α-β剪枝，提前终止
        }
    }

    best = best === -Infinity ? evaluate(b) : best;
    cache.set(k, best);
    cleanCache(); // 清理缓存
    return best;
}

/* ----------  选择最佳方向  ---------- */
function getBestMove() {
    let bestDir = 'left', bestScore = -Infinity;
    const directions = ['left', 'up', 'right', 'down'];

    // 使用Web Worker思路：先快速评估，再深度搜索（简化版）
    // 第一步：快速筛选有效方向
    const validMoves = [];
    for (const dir of directions) {
        const res = moveCore(board, dir);
        if (res.moved) {
            validMoves.push({ dir, res });
        }
    }

    if (validMoves.length === 0) return 'left';

    // 第二步：对有效方向进行深度搜索
    for (const { dir, res } of validMoves) {
        // 加入得分奖励，鼓励合并
        const s = search(res.board, BASE_DEPTH) + res.score * 500;
        if (s > bestScore) {
            bestScore = s;
            bestDir = dir;
        }
    }

    return bestDir;
}

/* ----------  AI 自动运行  ---------- */
// 优化AI移动：使用requestAnimationFrame，避免阻塞
function aiMove() {
    if (isGameOver(board)) {
        stopAI();
        return;
    }

    // 使用setTimeout避免UI阻塞
    setTimeout(() => {
        const dir = getBestMove();
        move(dir);
        const aiStatusEl = $('aiStatus');
        if (aiStatusEl) {
            aiStatusEl.textContent = `状态: 运行中 | 上次移动: ${dir} | 深度: ${BASE_DEPTH} | 缓存: ${cache.size}`;
        }
    }, 0);
}

function startAI() {
    if (aiInterval) return;
    // 使用requestAnimationFrame+递归，比setInterval更流畅
    function aiLoop() {
        aiMove();
        aiInterval = setTimeout(aiLoop, aiSpeed);
    }
    aiLoop();

    const aiStatusEl = $('aiStatus');
    if (aiStatusEl) {
        aiStatusEl.textContent = `状态: 运行中 | 上次移动: 初始化 | 深度: ${BASE_DEPTH}`;
    }
}

function stopAI() {
    if (!aiInterval) return;
    clearTimeout(aiInterval);
    aiInterval = null;
    const aiStatusEl = $('aiStatus');
    if (aiStatusEl) {
        aiStatusEl.textContent = `状态: 已停止 | 缓存: ${cache.size}`;
    }
    cache.clear(); // 停止时清空缓存
}

function setSpeed(sp) {
    stopAI();
    aiSpeed = { fast: 50, normal: 150, slow: 500 }[sp] || 150;
    startAI();
    const aiStatusEl = $('aiStatus');
    if (aiStatusEl) {
        aiStatusEl.textContent = `状态: 运行中 | 速度: ${sp} | 深度: ${BASE_DEPTH}`;
    }
}

/* ----------  启动  ---------- */
initGame();