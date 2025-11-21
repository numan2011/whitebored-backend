const socket = io();
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const app = document.getElementById('app');

// State
let isDrawing = false;
let isPanning = false;
let currentTool = 'pencil'; // pencil, eraser, text, hand
let currentColor = '#ffffff';
let currentSize = 2;
let currentFont = 'Inter';
let lastX = 0;
let lastY = 0;

// Infinite Canvas State
let offsetX = 0;
let offsetY = 0;
let strokes = []; // Store all strokes for redraw

// Elements
const tools = {
    hand: document.getElementById('tool-hand'),
    pencil: document.getElementById('tool-pencil'),
    eraser: document.getElementById('tool-eraser'),
    text: document.getElementById('tool-text')
};
const colorBtns = document.querySelectorAll('.color-btn');
const sizeInput = document.getElementById('line-width');
const fontSelect = document.getElementById('font-family');
const clearBtn = document.getElementById('action-clear');
const welcomeModal = document.getElementById('welcome-modal');
const enterBtn = document.getElementById('enter-btn');

// Modal Logic
enterBtn.addEventListener('click', () => {
    welcomeModal.style.opacity = '0';
    welcomeModal.style.pointerEvents = 'none';
    app.classList.remove('blurred');
    setTimeout(() => {
        welcomeModal.style.display = 'none';
    }, 500);
});

// Resize canvas
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    redraw();
}
window.addEventListener('resize', resize);
resize();

// Socket Events
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('draw', (data) => {
    // Store in history
    strokes.push(data);
    redraw();
});

socket.on('history', (history) => {
    strokes = history;
    redraw();
});

socket.on('clear', () => {
    strokes = [];
    redraw();
});

// Redraw Loop
function redraw() {
    // Clear screen (using identity transform to clear everything)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply offset
    ctx.setTransform(1, 0, 0, 1, offsetX, offsetY);

    // Draw all strokes
    strokes.forEach(data => {
        if (data.type === 'line') {
            drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size, false);
        } else if (data.type === 'text') {
            drawText(data.text, data.x, data.y, data.color, data.size, data.font, false);
        }
    });
}

// Drawing Logic
function drawLine(x0, y0, x1, y1, color, size, emit) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();

    if (!emit) return;

    const data = {
        type: 'line',
        x0, y0, x1, y1,
        color,
        size
    };

    strokes.push(data);
    socket.emit('draw', data);
}

function drawText(text, x, y, color, size, font, emit) {
    ctx.font = `${size * 10}px ${font}`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);

    if (!emit) return;

    const data = {
        type: 'text',
        text,
        x,
        y,
        color,
        size,
        font
    };

    strokes.push(data);
    socket.emit('draw', data);
}

// Mouse Events
canvas.addEventListener('mousedown', (e) => {
    if (currentTool === 'hand') {
        isPanning = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (currentTool === 'text') {
        createTextInput(e.clientX, e.clientY);
        return;
    }

    isDrawing = true;
    // Store World Coordinates
    lastX = e.clientX - offsetX;
    lastY = e.clientY - offsetY;
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        offsetX += dx;
        offsetY += dy;
        lastX = e.clientX;
        lastY = e.clientY;
        redraw();
        return;
    }

    if (!isDrawing) return;
    if (currentTool === 'text') return;

    let color = currentTool === 'eraser' ? '#1e1e2e' : currentColor;

    if (currentTool === 'eraser') {
        // For infinite canvas eraser, we can't just use destination-out easily 
        // because we are redrawing everything.
        // Simple solution: Draw a line with background color.
        // Complex solution: Modify strokes array (too hard for now).
        // We will stick to drawing "background color" lines.
        // Note: If we pan over something drawn, and background is different, this might look weird?
        // But our background is solid color.
        ctx.globalCompositeOperation = 'source-over';
    } else {
        ctx.globalCompositeOperation = 'source-over';
    }

    // Calculate World Coordinates
    const worldX = e.clientX - offsetX;
    const worldY = e.clientY - offsetY;

    drawLine(lastX, lastY, worldX, worldY, color, currentSize, true);
    lastX = worldX;
    lastY = worldY;
});

canvas.addEventListener('mouseup', () => {
    isDrawing = false;
    isPanning = false;
    if (currentTool === 'hand') canvas.style.cursor = 'grab';
});

canvas.addEventListener('mouseout', () => {
    isDrawing = false;
    isPanning = false;
    if (currentTool === 'hand') canvas.style.cursor = 'grab';
});

// Tool Switching
Object.keys(tools).forEach(key => {
    if (!tools[key]) return; // Guard against missing elements
    tools[key].addEventListener('click', () => {
        Object.values(tools).forEach(btn => btn && btn.classList.remove('active'));
        tools[key].classList.add('active');
        currentTool = key;

        if (currentTool === 'hand') {
            canvas.style.cursor = 'grab';
        } else {
            canvas.style.cursor = 'crosshair';
        }
    });
});

// Color Switching
colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentColor = btn.dataset.color;
    });
});

// Size Switching
sizeInput.addEventListener('input', (e) => {
    currentSize = e.target.value;
});

// Font Switching
fontSelect.addEventListener('change', (e) => {
    currentFont = e.target.value;
});

// Clear Board
clearBtn.addEventListener('click', () => {
    strokes = [];
    redraw();
    socket.emit('clear');
});

// Text Input Handling
function createTextInput(x, y) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input-overlay';
    input.style.position = 'fixed';
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.color = currentColor;
    input.style.fontSize = `${currentSize * 10}px`;

    let cssFont = currentFont;
    if (cssFont.startsWith("'") || cssFont.startsWith('"')) {
        cssFont = cssFont.slice(1, -1);
    }
    input.style.fontFamily = cssFont;

    input.style.backgroundColor = 'rgba(30, 30, 46, 0.9)';
    input.style.border = '1px solid ' + currentColor;
    input.style.padding = '4px';
    input.style.zIndex = '1000';

    document.body.appendChild(input);

    setTimeout(() => input.focus(), 0);

    let submitted = false;

    function finalize() {
        if (submitted) return;
        submitted = true;

        if (input.value) {
            // Convert screen coordinates to world coordinates for storage
            const worldX = x - offsetX;
            const worldY = y + (currentSize * 10) - offsetY; // Adjust for baseline?
            // Actually y passed to createTextInput is top-left.
            // drawText draws at baseline usually?
            // Let's keep it simple:
            // The input box top-left is at x, y (screen).
            // We want the text to appear there.
            // drawText(text, x, y) draws at x, y.
            // If we use fillText, y is usually baseline.
            // Let's adjust y slightly if needed, but for now:
            // worldX = x - offsetX
            // worldY = y - offsetY + (fontSize) roughly?
            // Let's stick to the previous logic: y + (currentSize * 10)

            drawText(input.value, worldX, worldY, currentColor, currentSize, currentFont, true);
        }
        document.body.removeChild(input);
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finalize();
        }
        if (e.key === 'Escape') {
            submitted = true;
            document.body.removeChild(input);
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(finalize, 100);
    });
}
