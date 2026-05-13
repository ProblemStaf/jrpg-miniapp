/**
 * Abyss Walker - RPG Roguelike (Ultima Underworld Style)
 * Raycasting engine, inventory, combat, spell books, save system
 */

// --- Constants & Config ---
const TILE_SIZE = 64;
const MAP_SIZE = 16;
const FOV = Math.PI / 3;
const MAX_DEPTH = 16;
const RENDER_DIST = 10;

// --- Game State ---
const state = {
    player: {
        x: 2.5, y: 2.5, dir: 0, // dir in radians
        hp: 100, maxHp: 100,
        mana: 50, maxMana: 50,
        level: 1, exp: 0, nextLevelExp: 100,
        str: 10, dex: 10, int: 10,
        magicLevel: 0,
        inventory: [],
        equipped: null
    },
    map: [], // 0: floor, 1: wall, 2: door, 3: enemy spawn
    enemies: [],
    items: [],
    combat: null, // { enemy, turn }
    lastTime: 0,
    running: true
};

// --- Assets / Data ---
const ENEMY_TYPES = [
    { name: "Крыса", hp: 20, dmg: 5, exp: 10, sprite: "🐀" },
    { name: "Гоблин", hp: 40, dmg: 10, exp: 25, sprite: "👺" },
    { name: "Скелет", hp: 60, dmg: 15, exp: 40, sprite: "💀" },
    { name: "Орк", hp: 100, dmg: 20, exp: 70, sprite: "👹" },
    { name: "Призрак", hp: 80, dmg: 25, exp: 90, sprite: "👻" }
];

const ITEM_TYPES = [
    { id: "potion", name: "Зелье лечения", type: "consumable", effect: "heal", val: 20, sprite: "🍷" },
    { id: "mana_potion", name: "Зелье маны", type: "consumable", effect: "mana", val: 20, sprite: "💧" },
    { id: "sword", name: "Ржавый меч", type: "weapon", dmg: 5, sprite: "🗡️" },
    { id: "axe", name: "Топор", type: "weapon", dmg: 10, sprite: "🪓" },
    // Spell Books
    { id: "book_fire", name: "Книга: Огненный шар", type: "spell", spell: "fireball", cost: 10, sprite: "📕" },
    { id: "book_lightning", name: "Книга: Молния", type: "spell", spell: "lightning", cost: 15, sprite: "📘" },
    { id: "book_heal", name: "Книга: Лечение", type: "spell", spell: "heal", cost: 20, sprite: "📗" }
];

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlayScreen = document.getElementById('overlay-screen');
const startBtn = document.getElementById('start-btn');
const uiHeader = document.getElementById('ui-header');
const uiFooter = document.getElementById('ui-footer');

const ui = {
    hp: document.getElementById('hp-val'),
    mana: document.getElementById('mana-val'),
    maxMana: document.getElementById('max-mana-val') || document.getElementById('mana-val'),
    lvl: document.getElementById('lvl-val'),
    magicLvl: document.getElementById('magic-lvl-val'),
    compass: document.getElementById('compass-needle'),
    log: document.getElementById('message-log'),
    invModal: document.getElementById('inventory-modal'),
    invGrid: document.getElementById('inventory-grid'),
    actionModal: document.getElementById('action-modal'),
    enemyName: document.getElementById('enemy-name'),
    enemySprite: document.getElementById('enemy-sprite'),
    enemyHp: document.getElementById('enemy-hp'),
    statStr: document.getElementById('stat-str'),
    statDex: document.getElementById('stat-dex'),
    statInt: document.getElementById('stat-int'),
    statDmg: document.getElementById('stat-dmg'),
    statDef: document.getElementById('stat-def')
};

// --- Initialization ---
function init() {
    resize();
    window.addEventListener('resize', resize);
    
    // Start button handler
    startBtn.addEventListener('click', () => {
        overlayScreen.classList.remove('active');
        overlayScreen.classList.add('hidden');
        uiHeader.classList.remove('hidden');
        uiFooter.classList.remove('hidden');
        newGame();
    });
    
    // Controls
    document.addEventListener('keydown', handleKey);
    document.getElementById('btn-inventory').addEventListener('click', toggleInventory);
    document.getElementById('btn-close-inv').addEventListener('click', toggleInventory);
    document.getElementById('btn-save').addEventListener('click', saveGame);
    document.getElementById('btn-load').addEventListener('click', loadGame);
    document.getElementById('btn-new-game').addEventListener('click', () => { if(confirm("Начать заново?")) newGame(); });
    
    // Combat buttons
    document.getElementById('btn-attack').addEventListener('click', playerAttack);
    document.getElementById('btn-spell').addEventListener('click', castSpell);
    document.getElementById('btn-flee').addEventListener('click', fleeCombat);

    // Mobile controls
    setupMobileControls();

    log("Добро пожаловать в Abyss Walker!");
    log("Нажмите НАЧАТЬ ИГРУ чтобы начать приключение.");
    
    requestAnimationFrame(gameLoop);
}

function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}

function newGame() {
    state.player = {
        x: 2.5, y: 2.5, dir: 0,
        hp: 100, maxHp: 100,
        mana: 50, maxMana: 50,
        level: 1, exp: 0, nextLevelExp: 100,
        str: 10, dex: 10, int: 10,
        magicLevel: 0,
        inventory: [ITEM_TYPES[0]], // Start with a potion
        equipped: null
    };
    generateMap();
    spawnEnemies();
    spawnItems();
    updateUI();
    log("Новая игра началась!");
}

// --- Map Generation ---
function generateMap() {
    state.map = [];
    for (let y = 0; y < MAP_SIZE; y++) {
        const row = [];
        for (let x = 0; x < MAP_SIZE; x++) {
            // Borders are walls
            if (x === 0 || x === MAP_SIZE - 1 || y === 0 || y === MAP_SIZE - 1) {
                row.push(1);
            } else {
                // Random walls (simple cellular automata-ish)
                row.push(Math.random() < 0.2 ? 1 : 0);
            }
        }
        state.map.push(row);
    }
    // Clear start area
    state.map[2][2] = 0; state.map[2][3] = 0; state.map[3][2] = 0; state.map[3][3] = 0;
}

function spawnEnemies() {
    state.enemies = [];
    for (let i = 0; i < 8; i++) {
        let x, y;
        do {
            x = Math.floor(Math.random() * MAP_SIZE);
            y = Math.floor(Math.random() * MAP_SIZE);
        } while (state.map[y][x] !== 0 || (x < 5 && y < 5));
        
        const typeIdx = Math.min(Math.floor(state.player.level / 2), ENEMY_TYPES.length - 1);
        const template = ENEMY_TYPES[Math.max(0, typeIdx - 1 + Math.floor(Math.random() * 2))];
        state.enemies.push({
            x, y, ...template, maxHp: template.hp
        });
    }
}

function spawnItems() {
    state.items = [];
    for (let i = 0; i < 10; i++) {
        let x, y;
        do {
            x = Math.floor(Math.random() * MAP_SIZE);
            y = Math.floor(Math.random() * MAP_SIZE);
        } while (state.map[y][x] !== 0);
        
        const itemTemplate = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
        state.items.push({ x, y, ...itemTemplate, id: Math.random().toString(36).substr(2, 9) });
    }
}

// --- Raycasting Engine ---
function render() {
    // Clear background (floor/ceiling)
    ctx.fillStyle = "#050505"; // Ceiling
    ctx.fillRect(0, 0, canvas.width, canvas.height / 2);
    ctx.fillStyle = "#1a1a1a"; // Floor
    ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);

    const numRays = canvas.width / 2; // Resolution
    const startAngle = state.player.dir - FOV / 2;

    for (let i = 0; i < numRays; i++) {
        const angle = startAngle + (i / numRays) * FOV;
        const dist = castRay(angle);
        
        // Fix fisheye
        const correctedDist = dist * Math.cos(angle - state.player.dir);
        
        const wallHeight = (canvas.height / correctedDist) * 30; // Scale factor
        
        // Wall shading based on distance
        const shade = Math.max(0, 255 - correctedDist * 20);
        ctx.fillStyle = `rgb(${shade}, ${shade * 0.8}, ${shade * 0.8})`; // Reddish tint
        
        const x = i * 2;
        ctx.fillRect(x, (canvas.height - wallHeight) / 2, 2, wallHeight);
    }
    
    // Render enemies (simple billboard)
    renderSprites();
}

function castRay(angle) {
    let sin = Math.sin(angle), cos = Math.cos(angle);
    let dx = Math.sign(cos), dy = Math.sign(sin);
    let stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    
    // DDA Algorithm
    let mapX = Math.floor(state.player.x);
    let mapY = Math.floor(state.player.y);
    
    let sideDistX, sideDistY;
    let deltaDistX = Math.abs(1 / sin); // Actually 1/cos for X? No, math check needed but simplified here
    let deltaDistY = Math.abs(1 / cos);
    
    // Correct DDA setup
    deltaDistX = Math.abs(1 / (sin === 0 ? 0.0001 : sin)); 
    deltaDistY = Math.abs(1 / (cos === 0 ? 0.0001 : cos));

    let hit = 0, side = 0;
    let steps = 0;

    if (dx < 0) sideDistX = (state.player.x - mapX) * deltaDistX;
    else sideDistX = (mapX + 1 - state.player.x) * deltaDistX;

    if (dy < 0) sideDistY = (state.player.y - mapY) * deltaDistY;
    else sideDistY = (mapY + 1 - state.player.y) * deltaDistY;

    while (hit === 0 && steps < MAX_DEPTH) {
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
        }
        if (mapX >= 0 && mapX < MAP_SIZE && mapY >= 0 && mapY < MAP_SIZE) {
            if (state.map[mapY][mapX] > 0) hit = 1;
        } else {
            hit = 1; // Out of bounds is a wall
        }
        steps++;
    }

    let perpWallDist;
    if (side === 0) perpWallDist = (mapX - state.player.x + (1 - stepX) / 2) / (sin === 0 ? 0.0001 : sin);
    else perpWallDist = (mapY - state.player.y + (1 - stepY) / 2) / (cos === 0 ? 0.0001 : cos);

    return Math.abs(perpWallDist);
}

function renderSprites() {
    // Combine enemies and items
    const sprites = [
        ...state.enemies.map(e => ({...e, type: 'enemy'})),
        ...state.items.map(i => ({...i, type: 'item'}))
    ];

    // Sort by distance
    sprites.forEach(s => {
        s.dist = Math.sqrt((s.x - state.player.x)**2 + (s.y - state.player.y)**2);
    });
    sprites.sort((a, b) => b.dist - a.dist);

    sprites.forEach(s => {
        if (s.dist > RENDER_DIST) return;

        // Simple projection
        const dx = s.x - state.player.x;
        const dy = s.y - state.player.y;
        
        // Angle to sprite relative to player dir
        let spriteAngle = Math.atan2(dy, dx) - state.player.dir;
        while (spriteAngle < -Math.PI) spriteAngle += 2*Math.PI;
        while (spriteAngle > Math.PI) spriteAngle -= 2*Math.PI;

        if (Math.abs(spriteAngle) < FOV / 1.5) {
            const screenX = (0.5 * (spriteAngle / (FOV / 2)) + 0.5) * canvas.width;
            const size = (canvas.height / s.dist) * 0.5;
            
            ctx.font = `${size}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(s.sprite, screenX, canvas.height / 2);
        }
    });
}

// --- Game Logic ---
function gameLoop(timestamp) {
    if (!state.running) return;
    
    const dt = timestamp - state.lastTime;
    state.lastTime = timestamp;

    if (!state.combat) {
        render();
    }
    
    requestAnimationFrame(gameLoop);
}

function handleKey(e) {
    if (state.combat) {
        if (e.key === '1') playerAttack();
        if (e.key === '2') castSpell();
        if (e.key === '3') fleeCombat();
        return;
    }

    if (ui.invModal.classList.contains('hidden') === false) return;

    const moveSpeed = 0.1;
    const rotSpeed = 0.05;
    let moved = false;

    if (e.key === 'w' || e.key === 'ArrowUp') {
        moveForward(moveSpeed);
        moved = true;
    } else if (e.key === 's' || e.key === 'ArrowDown') {
        moveForward(-moveSpeed);
        moved = true;
    } else if (e.key === 'a' || e.key === 'ArrowLeft') {
        state.player.dir -= rotSpeed;
        moved = true;
    } else if (e.key === 'd' || e.key === 'ArrowRight') {
        state.player.dir += rotSpeed;
        moved = true;
    } else if (e.key === ' ' || e.key === 'Enter') {
        log("Вы ждёте...");
        enemyTurn(); // Time passes
    } else if (e.key === 'e' || e.key === 'E') {
        interact();
    }

    if (moved) updateCompass();
    updateUI();
}

function moveForward(step) {
    const newX = state.player.x + Math.cos(state.player.dir) * step;
    const newY = state.player.y + Math.sin(state.player.dir) * step;

    // Collision check
    if (state.map[Math.floor(newY)][Math.floor(state.player.x)] === 0) {
        state.player.y = newY;
    }
    if (state.map[Math.floor(state.player.y)][Math.floor(newX)] === 0) {
        state.player.x = newX;
    }
    
    // Check item pickup
    checkItemPickup();
    // Check enemy encounter
    checkEnemyEncounter();
}

function checkItemPickup() {
    const idx = state.items.findIndex(i => 
        Math.abs(i.x - state.player.x) < 0.5 && Math.abs(i.y - state.player.y) < 0.5
    );
    if (idx !== -1) {
        const item = state.items[idx];
        state.player.inventory.push(item);
        state.items.splice(idx, 1);
        log(`Подобрано: ${item.name}`);
        updateUI();
    }
}

function checkEnemyEncounter() {
    const enemy = state.enemies.find(e => 
        Math.abs(e.x - state.player.x) < 0.8 && Math.abs(e.y - state.player.y) < 0.8
    );
    if (enemy) {
        startCombat(enemy);
    }
}

function interact() {
    // Try to open door or pickup
    const frontX = Math.floor(state.player.x + Math.cos(state.player.dir));
    const frontY = Math.floor(state.player.y + Math.sin(state.player.dir));
    
    if (state.map[frontY][frontX] === 2) {
        state.map[frontY][frontX] = 0; // Open door
        log("Дверь открыта.");
    } else {
        checkItemPickup();
    }
}

function updateCompass() {
    const deg = Math.round(state.player.dir * 180 / Math.PI) % 360;
    let dirChar = "N";
    if (deg >= 45 && deg < 135) dirChar = "E";
    else if (deg >= 135 && deg < 225) dirChar = "S";
    else if (deg >= 225 || deg < 45) dirChar = "W"; // Simplified
    ui.compass.textContent = dirChar;
    ui.compass.style.transform = `rotate(${-state.player.dir}rad)`;
}

function log(msg) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = `> ${msg}`;
    ui.log.appendChild(div);
    ui.log.scrollTop = ui.log.scrollHeight;
    if (ui.log.children.length > 20) ui.log.removeChild(ui.log.firstChild);
}

function updateUI() {
    ui.hp.textContent = Math.floor(state.player.hp);
    ui.maxHp.textContent = state.player.maxHp;
    ui.mana.textContent = Math.floor(state.player.mana);
    ui.maxMana.textContent = state.player.maxMana;
    ui.lvl.textContent = state.player.level;
    ui.magicLvl.textContent = state.player.magicLevel;
    
    // Stats
    ui.statStr.textContent = state.player.str;
    ui.statDex.textContent = state.player.dex;
    ui.statInt.textContent = state.player.int;
    
    const weaponDmg = state.player.equipped ? state.player.equipped.dmg : 0;
    ui.statDmg.textContent = `${5 + weaponDmg}-${10 + weaponDmg}`;
    ui.statDef.textContent = Math.floor(state.player.dex / 2);
}

// --- Inventory System ---
function toggleInventory() {
    const hidden = ui.invModal.classList.toggle('hidden');
    if (!hidden) renderInventory();
}

function renderInventory() {
    ui.invGrid.innerHTML = '';
    state.player.inventory.forEach((item, idx) => {
        const el = document.createElement('div');
        el.className = `inv-item ${item.type === 'spell' ? 'spell' : ''}`;
        el.innerHTML = `<div>${item.sprite}</div><div>${item.name}</div>`;
        el.onclick = () => useItem(idx);
        ui.invGrid.appendChild(el);
    });
}

function useItem(idx) {
    const item = state.player.inventory[idx];
    if (item.type === 'consumable') {
        if (item.effect === 'heal') {
            state.player.hp = Math.min(state.player.maxHp, state.player.hp + item.val);
            log(`Использовано: ${item.name}. HP +${item.val}`);
        } else if (item.effect === 'mana') {
            state.player.mana = Math.min(state.player.maxMana, state.player.mana + item.val);
            log(`Использовано: ${item.name}. Mana +${item.val}`);
        }
        state.player.inventory.splice(idx, 1);
    } else if (item.type === 'weapon') {
        state.player.equipped = item;
        log(`Экипировано: ${item.name}`);
    } else if (item.type === 'spell') {
        // Learn spell or just add to known? For now, just keep in inv as usable
        state.player.magicLevel++;
        log(`Изучена магия из: ${item.name}. Уровень магии: ${state.player.magicLevel}`);
        // Convert to known spell? Simplified: keep item but allow casting if you have it
    }
    updateUI();
    renderInventory();
}

// --- Combat System ---
function startCombat(enemy) {
    state.combat = { enemy, turn: 'player' };
    ui.enemyName.textContent = enemy.name;
    ui.enemySprite.textContent = enemy.sprite;
    ui.enemyHp.textContent = `HP: ${enemy.hp}/${enemy.maxHp}`;
    ui.actionModal.classList.remove('hidden');
    log(`Враг: ${enemy.name}! Бой начался.`);
}

function endCombat(won) {
    state.combat = null;
    ui.actionModal.classList.add('hidden');
    if (won) {
        const enemy = state.enemies.find(e => e.name === ui.enemyName.textContent); // Find ref
        if (enemy) {
            // Remove from world
            const idx = state.enemies.indexOf(enemy);
            if (idx > -1) state.enemies.splice(idx, 1);
            
            // Exp gain
            gainExp(enemy.exp);
            
            // Drop loot (Spell book chance)
            if (Math.random() < 0.3) {
                const books = ITEM_TYPES.filter(i => i.type === 'spell');
                const book = books[Math.floor(Math.random() * books.length)];
                state.player.inventory.push({...book, id: Math.random().toString()});
                log(`Победа! Получено ${enemy.exp} опыта. Найден предмет: ${book.name}!`);
            } else {
                log(`Победа! Получено ${enemy.exp} опыта.`);
            }
        }
    } else {
        log("Вы сбежали!");
    }
    updateUI();
}

function playerAttack() {
    if (!state.combat) return;
    const enemy = state.combat.enemy;
    
    const weaponDmg = state.player.equipped ? state.player.equipped.dmg : 0;
    const dmg = Math.floor((state.player.str / 2) + weaponDmg + Math.random() * 5);
    
    enemy.hp -= dmg;
    log(`Вы нанесли ${dmg} урона ${enemy.name}.`);
    ui.enemyHp.textContent = `HP: ${Math.max(0, enemy.hp)}/${enemy.maxHp}`;
    
    if (enemy.hp <= 0) {
        endCombat(true);
    } else {
        enemyTurn();
    }
}

function castSpell() {
    if (!state.combat) return;
    // Find first spell in inventory
    const spellIdx = state.player.inventory.findIndex(i => i.type === 'spell');
    if (spellIdx === -1) {
        log("Нет изученных заклинаний!");
        return;
    }
    
    const spell = state.player.inventory[spellIdx];
    if (state.player.mana < spell.cost) {
        log("Недостаточно маны!");
        return;
    }
    
    state.player.mana -= spell.cost;
    let dmg = state.player.int * 2;
    if (spell.spell === 'fireball') dmg *= 1.5;
    
    const enemy = state.combat.enemy;
    enemy.hp -= Math.floor(dmg);
    log(`Заклинание ${spell.name} нанесло ${Math.floor(dmg)} урона!`);
    ui.enemyHp.textContent = `HP: ${Math.max(0, enemy.hp)}/${enemy.maxHp}`;
    
    if (enemy.hp <= 0) endCombat(true);
    else enemyTurn();
    
    updateUI();
}

function fleeCombat() {
    if (Math.random() > 0.5) {
        endCombat(false);
    } else {
        log("Не удалось сбежать!");
        enemyTurn();
    }
}

function enemyTurn() {
    if (!state.combat) return;
    const enemy = state.combat.enemy;
    
    const dmg = Math.max(0, enemy.dmg - Math.floor(state.player.dex / 3));
    state.player.hp -= dmg;
    log(`${enemy.name} атакует и наносит ${dmg} урона.`);
    
    if (state.player.hp <= 0) {
        alert("ВЫ ПОГИБЛИ! Игра окончена.");
        newGame();
    }
    updateUI();
}

function gainExp(amount) {
    state.player.exp += amount;
    if (state.player.exp >= state.player.nextLevelExp) {
        state.player.level++;
        state.player.exp -= state.player.nextLevelExp;
        state.player.nextLevelExp = Math.floor(state.player.nextLevelExp * 1.5);
        state.player.maxHp += 10;
        state.player.maxMana += 5;
        state.player.hp = state.player.maxHp;
        state.player.mana = state.player.maxMana;
        state.player.str += 2;
        state.player.int += 2;
        log(`УРОВЕНЬ ПОВЫШЕН! Теперь вы ${state.player.level} уровня.`);
    }
}

// --- Save/Load System ---
function saveGame() {
    const data = JSON.stringify({
        player: state.player,
        map: state.map,
        enemies: state.enemies,
        items: state.items
    });
    localStorage.setItem('abyssWalkerSave', data);
    log("Игра сохранена.");
}

function loadGame() {
    const data = localStorage.getItem('abyssWalkerSave');
    if (!data) {
        log("Нет сохранений.");
        return;
    }
    const parsed = JSON.parse(data);
    state.player = parsed.player;
    state.map = parsed.map;
    state.enemies = parsed.enemies;
    state.items = parsed.items;
    updateUI();
    log("Игра загружена.");
}

// --- Mobile Controls ---
function setupMobileControls() {
    // Create mobile controls if not exist
    let mobileControls = document.getElementById('mobile-controls');
    if (!mobileControls) {
        mobileControls = document.createElement('div');
        mobileControls.id = 'mobile-controls';
        mobileControls.innerHTML = `
            <div class="d-pad">
                <button id="m-up">▲</button>
                <div class="row">
                    <button id="m-left">◀</button>
                    <button id="m-right">▶</button>
                </div>
                <button id="m-down">▼</button>
            </div>
            <button id="m-action" class="action-btn">E</button>
        `;
        document.body.appendChild(mobileControls);
    }

    const bind = (id, action) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); action(); });
            btn.addEventListener('mousedown', (e) => { e.preventDefault(); action(); });
        }
    };

    bind('m-up', () => moveForward(0.2));
    bind('m-down', () => moveForward(-0.2));
    bind('m-left', () => state.player.dir -= 0.2);
    bind('m-right', () => state.player.dir += 0.2);
    bind('m-action', interact);
}

// Start
init();
