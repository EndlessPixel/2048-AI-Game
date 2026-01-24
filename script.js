/********************************************************************
 *  2048-AI  终极修正版
 *  核心修正：还原正确的2倍升级逻辑 1(2)→2(4)→3(8)→4(16)→…→11(2048)
 *  智能优化：大数保护/自杀检测/动态深度/分层缓存/边角策略
 *******************************************************************/
/* ----------  配置区  ---------- */
const size = 4;
// 强化版权重矩阵（大数优先左上角，符合2048最优策略）
const WEIGHT_MATRIX = [
    [1000000, 800000, 500000, 200000],
    [800000, 500000, 200000, 100000],
    [500000, 200000, 100000, 50000],
    [200000, 100000, 50000, 10000]
];
let board = [];    // 存储等级值：n → 实际值2^n
let score = 0;     // 实际游戏得分（累加2/4/8/16…）
let maxTile = 1;   // 最高等级值（1→2，11→2048）
let aiInterval = null;
let aiSpeed = 100;          // AI移动间隔(ms)
let DYNAMIC_DEPTH = 4;      // 动态搜索深度
const MAX_CACHE_SIZE = 15000; // 分层缓存最大容量
const CACHE_DEPTH_PRIORITY = new Map(); // 分层缓存（按搜索深度存储）

/* ----------  工具函数  ---------- */
const $ = id => document.getElementById(id);
// 高性能棋盘克隆
const clone = b => {
    const newBoard = new Array(size);
    for (let i = 0; i < size; i++) {
        newBoard[i] = [...b[i]];
    }
    return newBoard;
};
// 等级值转实际值：核心工具函数（修正核心）
const getRealVal = n => n === 0 ? 0 : Math.pow(2, n);
const log2 = n => n <= 0 ? 0 : Math.log2(n);

// 高性能缓存键生成（数字哈希，减少碰撞）
function cacheKey(b, depth) {
    let hash = depth * 1000000;
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            hash = hash * 31 + b[i][j]; // 质数哈希，效率高于字符串
        }
    }
    return hash;
}

/* ----------  游戏初始化  ---------- */
function initGame() {
    board = Array(size).fill().map(() => Array(size).fill(0));
    score = 0;
    maxTile = 1;
    // 重置页面显示
    ['score', 'maxTile'].forEach(k => {
        const el = $(k);
        if (el) el.textContent = 0;
    });
    const gameOverEl = $('gameOver');
    if (gameOverEl) gameOverEl.style.display = 'none';
    const aiStatusEl = $('aiStatus');
    if (aiStatusEl) aiStatusEl.textContent = '状态: 未运行';
    // 初始化分层缓存
    CACHE_DEPTH_PRIORITY.clear();
    for (let d = 0; d <= 6; d++) CACHE_DEPTH_PRIORITY.set(d, new Map());
    // 生成初始两个块（等级1→2，等级2→4）
    addRandomTile();
    addRandomTile();
    updateDisplay();
}

/* ----------  随机生成新块（等级1=2，等级2=4）  ---------- */
function addRandomTile() {
    const empties = [];
    for (let i = 0; i < size; i++)
        for (let j = 0; j < size; j++)
            if (board[i][j] === 0) empties.push({ x: i, y: j });
    if (!empties.length) return false;
    const { x, y } = empties[Math.floor(Math.random() * empties.length)];
    // 大数阶段降低4（等级2）的生成概率：2048+时95%出2（等级1）
    const prob2 = maxTile > 11 ? 0.95 : maxTile > 10 ? 0.92 : 0.85;
    board[x][y] = Math.random() < prob2 ? 1 : 2; // 等级1=2，等级2=4
    updateMaxTile();
    return true;
}

// 更新最高等级&动态搜索深度（修正：对应实际值2^maxTile）
function updateMaxTile() {
    maxTile = Math.max(...board.flat());
    const maxTileEl = $('maxTile');
    if (maxTileEl) maxTileEl.textContent = getRealVal(maxTile); // 显示实际值

    // 动态深度：空格越少/数越大，思考越深（2048阶段最深搜6层）
    const emptyCount = board.flat().filter(v => v === 0).length;
    if (maxTile > 11) { // 超过2048
        DYNAMIC_DEPTH = emptyCount < 3 ? 6 : emptyCount < 6 ? 5 : 4;
    } else if (maxTile > 10) { // 1024→2048
        DYNAMIC_DEPTH = emptyCount < 3 ? 5 : emptyCount < 6 ? 4 : 3;
    } else { // 1024以下
        DYNAMIC_DEPTH = emptyCount < 3 ? 4 : 3;
    }
}

/* ----------  页面渲染（修正：显示2^等级值）  ---------- */
function updateDisplay() {
    const grid = $('grid');
    if (!grid) return;
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment(); // 批量DOM，减少重绘
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            const realVal = getRealVal(board[i][j]);
            cell.setAttribute('data-value', realVal);
            cell.textContent = realVal === 0 ? '' : realVal; // 显示实际2/4/8…
            fragment.appendChild(cell);
        }
    }
    grid.appendChild(fragment);
}

/* ----------  移动核心（完全修正：合并加分=2^(n+1)）  ---------- */
function moveCore(src, dir) {
    const b = clone(src);
    let moved = false, pts = 0; // pts：本次移动的实际得分（2/4/8/16…）

    // 核心滑动合并函数（修正合并加分逻辑）
    const slide = arr => {
        const newArr = arr.filter(num => num !== 0); // 过滤空块（0）
        const merged = [];
        let skip = false;

        for (let i = 0; i < newArr.length; i++) {
            if (skip) {
                skip = false;
                continue;
            }
            // 合并两个相同等级值n → 新等级n+1，加分=2^(n+1)（核心修正）
            if (i < newArr.length - 1 && newArr[i] === newArr[i + 1]) {
                const newLevel = newArr[i] + 1;
                merged.push(newLevel);
                pts += getRealVal(newLevel); // 加分=实际值（如合并2+2→4，加4）
                skip = true;
            } else {
                merged.push(newArr[i]);
            }
        }
        // 补0对齐棋盘长度
        while (merged.length < size) {
            merged.push(0);
        }
        return merged;
    };

    // 四个方向的滑动处理
    if (dir === 'left') {
        for (let i = 0; i < size; i++) {
            const old = b[i].join(',');
            b[i] = slide(b[i]);
            if (old !== b[i].join(',')) moved = true;
        }
    } else if (dir === 'right') {
        for (let i = 0; i < size; i++) {
            const old = b[i].join(',');
            const reversed = [...b[i]].reverse();
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
            const reversed = [...col].reverse();
            const slid = slide(reversed);
            const neo = slid.reverse();
            for (let i = 0; i < size; i++) b[i][j] = neo[i];
            if (old !== neo.join(',')) moved = true;
        }
    }
    return { board: b, score: pts, moved };
}

/* ----------  执行移动（玩家/AI通用，修正得分累加）  ---------- */
function move(dir) {
    const res = moveCore(board, dir);
    if (!res.moved) return; // 无有效移动则退出
    board = res.board;
    score += res.score; // 累加实际得分（修正后正确值）
    // 更新页面得分
    const scoreEl = $('score');
    if (scoreEl) scoreEl.textContent = score;
    // 生成新块并更新显示
    addRandomTile();
    updateDisplay();
    // 游戏结束判断
    if (isGameOver(board)) {
        const finalScoreEl = $('finalScore');
        const finalMaxTileEl = $('finalMaxTile');
        const gameOverEl = $('gameOver');
        if (finalScoreEl) finalScoreEl.textContent = score;
        if (finalMaxTileEl) finalMaxTileEl.textContent = getRealVal(maxTile);
        if (gameOverEl) gameOverEl.style.display = 'flex';
        stopAI();
    }
}

/* ----------  终局判断（逻辑不变，仅适配等级值）  ---------- */
function isGameOver(b) {
    // 检查是否有空格
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (b[i][j] === 0) return false;
        }
    }
    // 检查横向可合并（相同等级值）
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size - 1; j++) {
            if (b[i][j] === b[i][j + 1]) return false;
        }
    }
    // 检查纵向可合并（相同等级值）
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size - 1; i++) {
            if (b[i][j] === b[i + 1][j]) return false;
        }
    }
    return true;
}

/* ----------  评估函数（修正：基于实际值计算，保留智能策略）  ---------- */
function evaluate(b) {
    let empty = 0, weight = 0, mono = 0, smooth = 0;
    let maxVal = 0, maxX = 0, maxY = 0;

    // 1. 基础统计：空位数、权重得分、最大数位置
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const level = b[i][j];
            const realVal = getRealVal(level);
            if (level === 0) {
                empty++;
                continue;
            }
            // 权重得分：实际值 × 权重矩阵（大数放边角得分高）
            weight += realVal * WEIGHT_MATRIX[i][j];
            // 记录最大数的等级和位置
            if (level > maxVal) {
                maxVal = level;
                maxX = i;
                maxY = j;
            }
        }
    }

    // 2. 单调性优化：大数区强制单调递减（避免大数被拆分）
    let rowMono = 0, colMono = 0;
    const bigNumLevel = maxVal - 3; // 大数等级阈值（max-3内算大数）
    // 行单调性：左→右递减（大数区严格惩罚）
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size - 1; j++) {
            const curr = b[i][j];
            const next = b[i][j + 1];
            if (curr >= bigNumLevel || next >= bigNumLevel) {
                rowMono += (curr - next) > 0 ? (curr - next) * 10 : (curr - next) * 5;
            } else {
                rowMono += (curr - next) > 0 ? (curr - next) : (curr - next) * 0.1;
            }
        }
    }
    // 列单调性：上→下递减（大数区严格惩罚）
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size - 1; i++) {
            const curr = b[i][j];
            const next = b[i + 1][j];
            if (curr >= bigNumLevel || next >= bigNumLevel) {
                colMono += (curr - next) > 0 ? (curr - next) * 10 : (curr - next) * 5;
            } else {
                colMono += (curr - next) > 0 ? (curr - next) : (curr - next) * 0.1;
            }
        }
    }
    mono = rowMono * 1.5 + colMono * 1.2;

    // 3. 平滑性：大数区允许不平滑（避免为了平滑拆分大数）
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const level = b[i][j];
            if (level === 0) continue;
            const realVal = getRealVal(level);
            // 横向平滑
            if (j < size - 1) {
                const nextLevel = b[i][j + 1];
                if (nextLevel === 0) continue;
                const nextReal = getRealVal(nextLevel);
                const diff = Math.abs(log2(realVal) - log2(nextReal));
                smooth -= diff * (level > bigNumLevel ? 0.3 : 1);
            }
            // 纵向平滑
            if (i < size - 1) {
                const nextLevel = b[i + 1][j];
                if (nextLevel === 0) continue;
                const nextReal = getRealVal(nextLevel);
                const diff = Math.abs(log2(realVal) - log2(nextReal));
                smooth -= diff * (level > bigNumLevel ? 0.3 : 1);
            }
        }
    }

    // 4. 大数位置奖励（核心：强制大数留在边角，中间重罚）
    let cornerBonus = 0;
    const maxReal = getRealVal(maxVal);
    if (maxX === 0 && maxY === 0) { // 左上角（最优）
        cornerBonus = maxReal * 2;
    } else if ((maxX === 0 && maxY === size - 1) || (maxX === size - 1 && maxY === 0)) { // 其他角
        cornerBonus = maxReal * 1;
    } else if (maxX === 0 || maxY === 0 || maxX === size - 1 || maxY === size - 1) { // 边缘
        cornerBonus = maxReal * 0.5;
    } else { // 中间（重罚，避免大数进中间）
        cornerBonus = -maxReal * 5;
    }

    // 5. 大数孤立性奖励（1024+生效：避免大数周围有相同数，防止误合并）
    let isolationBonus = 0;
    if (maxVal >= 10) { // 1024（等级10）及以上
        const neighbors = [];
        if (maxX > 0) neighbors.push(b[maxX - 1][maxY]);
        if (maxX < size - 1) neighbors.push(b[maxX + 1][maxY]);
        if (maxY > 0) neighbors.push(b[maxX][maxY - 1]);
        if (maxY < size - 1) neighbors.push(b[maxX][maxY + 1]);
        if (!neighbors.includes(maxVal)) {
            isolationBonus = maxReal * 1.5;
        }
    }

    // 6. 动态空格权重（1024以下扩空格，1024以上优先合并）
    let emptyScore = maxVal < 10 ? empty * 3000 : empty * 500;

    // 最终评估得分（各因子权重适配2倍升级逻辑）
    return (
        emptyScore +
        weight * 0.01 +
        mono * 200 +
        smooth * 200 +
        cornerBonus * 2 +
        isolationBonus
    );
}

/* ----------  强化版α-β剪枝搜索（保留所有智能优化）  ---------- */
// 分层缓存清理：优先保留深度高的搜索结果（对决策更重要）
function cleanCache() {
    let totalSize = 0;
    CACHE_DEPTH_PRIORITY.forEach(map => totalSize += map.size);
    if (totalSize <= MAX_CACHE_SIZE) return;
    // 从浅到深清理，保留深搜结果
    for (let d = 0; d <= 6; d++) {
        const map = CACHE_DEPTH_PRIORITY.get(d);
        if (map.size === 0) continue;
        const keys = Array.from(map.keys());
        const deleteCount = Math.min(keys.length / 2, totalSize - MAX_CACHE_SIZE);
        for (let i = 0; i < deleteCount; i++) {
            map.delete(keys[i]);
            totalSize--;
        }
        if (totalSize <= MAX_CACHE_SIZE) break;
    }
}

// 自杀移动检测：避免将大数（≥1024）移到棋盘中间
function isSuicidalMove(b, dir) {
    const res = moveCore(b, dir);
    if (!res.moved) return false;
    // 找到移动后的最大数位置
    let maxLevel = 0, maxX = 0, maxY = 0;
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (res.board[i][j] > maxLevel) {
                maxLevel = res.board[i][j];
                maxX = i;
                maxY = j;
            }
        }
    }
    // 大数（≥1024=等级10）移到中间，判定为自杀
    return maxLevel >= 10 && maxX > 0 && maxX < size - 1 && maxY > 0 && maxY < size - 1;
}

// α-β剪枝搜索：动态优先级+全空格评估（带性能控制）
function search(b, depth, alpha = -Infinity, beta = Infinity) {
    if (depth === 0 || isGameOver(b)) {
        return evaluate(b);
    }
    // 从分层缓存获取结果
    const k = cacheKey(b, depth);
    const depthCache = CACHE_DEPTH_PRIORITY.get(depth);
    if (depthCache && depthCache.has(k)) {
        return depthCache.get(k);
    }

    let best = -Infinity;
    // 动态移动优先级：根据最大数位置调整搜索顺序（减少剪枝次数）
    let directions = ['left', 'up', 'right', 'down'];
    const maxPos = findMaxPosition(b);
    if (maxPos.y === 0) directions = ['left', 'up', 'down', 'right'];
    else if (maxPos.y === size - 1) directions = ['right', 'up', 'down', 'left'];
    else if (maxPos.x === 0) directions = ['up', 'left', 'right', 'down'];

    for (const dir of directions) {
        if (isSuicidalMove(b, dir)) continue; // 跳过自杀移动
        const res = moveCore(b, dir);
        if (!res.moved) continue;

        // 遍历所有空块，评估生成2/4的期望得分
        const empties = [];
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                if (res.board[i][j] === 0) empties.push({ x: i, y: j });
            }
        }
        if (!empties.length) {
            const current = search(res.board, depth - 1, alpha, beta);
            best = Math.max(best, current);
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
            continue;
        }

        // 性能控制：空格>8时采样，否则全量评估
        const useSample = empties.length > 8;
        const targetEmpties = useSample ? empties.sort(() => 0.5 - Math.random()).slice(0, 6) : empties;
        let sum = 0;
        const prob2 = maxTile > 11 ? 0.95 : 0.85; // 生成2的概率

        for (const { x, y } of targetEmpties) {
            // 生成2（等级1）
            res.board[x][y] = 1;
            sum += search(res.board, depth - 1, alpha, beta) * prob2;
            // 生成4（等级2）
            res.board[x][y] = 2;
            sum += search(res.board, depth - 1, alpha, beta) * (1 - prob2);
            // 恢复棋盘
            res.board[x][y] = 0;
        }

        // 修正采样偏差，计算期望得分
        const expected = useSample ? sum / targetEmpties.length * (empties.length / targetEmpties.length) : sum / empties.length;
        best = Math.max(best, expected);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break; // α-β剪枝，提前终止
    }

    // 缓存结果并清理
    best = best === -Infinity ? evaluate(b) : best;
    if (depthCache) {
        depthCache.set(k, best);
        cleanCache();
    }
    return best;
}

// 找到棋盘最大数的等级和位置
function findMaxPosition(b) {
    let maxLevel = 0, x = 0, y = 0;
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (b[i][j] > maxLevel) {
                maxLevel = b[i][j];
                x = i;
                y = j;
            }
        }
    }
    return { x, y, val: maxLevel };
}

/* ----------  选择最佳移动方向（适配修正后的2倍逻辑）  ---------- */
function getBestMove() {
    let bestDir = 'left', bestScore = -Infinity;
    // 筛选有效且非自杀的移动
    const validMoves = [];
    ['left', 'up', 'right', 'down'].forEach(dir => {
        const res = moveCore(board, dir);
        if (res.moved && !isSuicidalMove(board, dir)) {
            validMoves.push({ dir, res });
        }
    });
    if (validMoves.length === 0) return 'left';

    // 对有效移动做深度搜索，选择评估得分最高的方向
    for (const { dir, res } of validMoves) {
        // 大数阶段给合并加分更高的权重
        const mergeBonus = maxTile > 10 ? res.score * 2000 : res.score * 500;
        const s = search(res.board, DYNAMIC_DEPTH) + mergeBonus;
        if (s > bestScore) {
            bestScore = s;
            bestDir = dir;
        }
    }
    return bestDir;
}

/* ----------  AI自动运行（逻辑不变，状态显示修正）  ---------- */
function aiMove() {
    if (isGameOver(board)) {
        stopAI();
        return;
    }
    setTimeout(() => {
        const dir = getBestMove();
        move(dir);
        const aiStatusEl = $('aiStatus');
        if (aiStatusEl) {
            aiStatusEl.textContent = `状态: 运行中 | 上次移动: ${dir} | 深度: ${DYNAMIC_DEPTH} | 最大数: ${getRealVal(maxTile)}`;
        }
    }, 0);
}

// 启动AI
function startAI() {
    if (aiInterval) return;
    function aiLoop() {
        aiMove();
        aiInterval = setTimeout(aiLoop, aiSpeed);
    }
    aiLoop();
    const aiStatusEl = $('aiStatus');
    if (aiStatusEl) {
        aiStatusEl.textContent = `状态: 运行中 | 初始化 | 深度: ${DYNAMIC_DEPTH} | 最大数: ${getRealVal(maxTile)}`;
    }
}

// 停止AI
function stopAI() {
    if (!aiInterval) return;
    clearTimeout(aiInterval);
    aiInterval = null;
    const aiStatusEl = $('aiStatus');
    if (aiStatusEl) {
        let totalCache = 0;
        CACHE_DEPTH_PRIORITY.forEach(map => totalCache += map.size);
        aiStatusEl.textContent = `状态: 已停止 | 缓存: ${totalCache} | 最大数: ${getRealVal(maxTile)}`;
    }
    // 清空缓存释放内存
    CACHE_DEPTH_PRIORITY.forEach(map => map.clear());
}

// 设置AI速度（快/中/慢）
function setSpeed(sp) {
    stopAI();
    aiSpeed = { fast: 50, normal: 150, slow: 500 }[sp] || 150;
    startAI();
    const aiStatusEl = $('aiStatus');
    if (aiStatusEl) {
        aiStatusEl.textContent = `状态: 运行中 | 速度: ${sp} | 深度: ${DYNAMIC_DEPTH} | 最大数: ${getRealVal(maxTile)}`;
    }
}

/* ----------  游戏启动  ---------- */
initGame();