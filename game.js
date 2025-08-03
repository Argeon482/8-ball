// Game state
let canvas, ctx;
let cueBall, eightBall;
let canvasTransform = { scaleX: 1, scaleY: 1 }; // Store transform values
let gameState = {
    isAiming: false,
    aimStart: null,
    aimEnd: null,
    aimAngle: 0,
    shotPower: 50,
    shotCount: 0,
    bankCount: 0,
    currentBankCount: 0,
    score: 0,
    ballsMoving: false,
    isMobile: false,
    touchStartTime: 0,
    lastTouchPos: null
};

// Mobile detection
function detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           window.innerWidth <= 768 || 
           'ontouchstart' in window;
}

// Initialize game
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Detect mobile device
    gameState.isMobile = detectMobile();
    
    // Create balls first with default positions
    cueBall = new Ball(200, 200, 'white');
    eightBall = new Ball(600, 200, 'black', true);
    
    // Debug log
    console.log('Balls created:', {
        cueBall: { x: cueBall.position.x, y: cueBall.position.y, radius: cueBall.radius, color: cueBall.color },
        eightBall: { x: eightBall.position.x, y: eightBall.position.y, radius: eightBall.radius, color: eightBall.color }
    });
    
    // Optimize canvas for mobile (after balls are created)
    if (gameState.isMobile) {
        optimizeCanvasForMobile();
    }
    
    // Set up event listeners
    setupEventListeners();
    
    // Start game loop
    requestAnimationFrame(gameLoop);
}

// Optimize canvas for mobile devices
function optimizeCanvasForMobile() {
    const container = canvas.parentElement;
    const containerWidth = container.clientWidth - 40; // Account for padding
    const aspectRatio = 800 / 400; // Original aspect ratio
    
    if (containerWidth < 800) {
        const newWidth = Math.min(containerWidth, 600);
        const newHeight = newWidth / aspectRatio;
        
        // Set display size
        canvas.style.width = newWidth + 'px';
        canvas.style.height = newHeight + 'px';
        
        // Keep canvas internal size consistent for easier coordinate management
        canvas.width = 800;
        canvas.height = 400;
        
        // Calculate and store the scale values
        canvasTransform.scaleX = newWidth / 800;
        canvasTransform.scaleY = newHeight / 400;
        
        // Update ball positions proportionally if balls exist
        if (cueBall && eightBall) {
            // Reset to original positions since we're now scaling the context instead
            cueBall.position.x = 200;
            cueBall.position.y = 200;
            eightBall.position.x = 600;
            eightBall.position.y = 200;
        }
    }
}

// Set up event listeners
function setupEventListeners() {
    // Mouse events for aiming
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    
    // Enhanced touch events for mobile
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Prevent context menu on long press
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Power slider - both desktop and mobile
    const powerSlider = document.getElementById('powerSlider');
    const mobilePowerSlider = document.getElementById('mobilePowerSlider');
    
    const updatePower = (value) => {
        gameState.shotPower = parseInt(value);
        document.getElementById('powerValue').textContent = gameState.shotPower + '%';
        document.getElementById('mobilePowerValue').textContent = gameState.shotPower + '%';
        // Sync both sliders
        powerSlider.value = value;
        mobilePowerSlider.value = value;
    };
    
    powerSlider.addEventListener('input', (e) => updatePower(e.target.value));
    mobilePowerSlider.addEventListener('input', (e) => updatePower(e.target.value));
    
    // Buttons - both desktop and mobile
    document.getElementById('shootBtn').addEventListener('click', shoot);
    document.getElementById('resetBtn').addEventListener('click', resetGame);
    document.getElementById('mobileShootBtn').addEventListener('click', shoot);
    document.getElementById('mobileResetBtn').addEventListener('click', resetGame);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !gameState.ballsMoving) {
            e.preventDefault();
            shoot();
        }
    });
    
    // Handle orientation changes on mobile
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (gameState.isMobile) {
                optimizeCanvasForMobile();
            }
        }, 100);
    });
}

// Enhanced touch handling with visual feedback
function createTouchIndicator(x, y) {
    const indicator = document.createElement('div');
    indicator.className = 'touch-indicator';
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
    document.body.appendChild(indicator);
    
    setTimeout(() => {
        indicator.remove();
    }, 300);
}

// Mouse/Touch handlers
function handleMouseDown(e) {
    if (gameState.ballsMoving) return;
    
    const rect = canvas.getBoundingClientRect();
    // Use consistent coordinate mapping (canvas internal size is always 800x400)
    const scaleX = 800 / rect.width;
    const scaleY = 400 / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Check if clicking near cue ball
    const distance = Math.sqrt(
        Math.pow(x - cueBall.position.x, 2) + 
        Math.pow(y - cueBall.position.y, 2)
    );
    
    const touchRadius = gameState.isMobile ? 80 : 50; // Larger touch area on mobile
    
    if (distance < touchRadius) {
        gameState.isAiming = true;
        gameState.aimStart = new Vector2(cueBall.position.x, cueBall.position.y);
        
        // Add haptic feedback on supported devices
        if ('vibrate' in navigator && gameState.isMobile) {
            navigator.vibrate(50);
        }
    }
}

function handleMouseMove(e) {
    if (!gameState.isAiming || gameState.ballsMoving) return;
    
    const rect = canvas.getBoundingClientRect();
    // Use consistent coordinate mapping (canvas internal size is always 800x400)
    const scaleX = 800 / rect.width;
    const scaleY = 400 / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const mousePos = new Vector2(x, y);
    const aimData = calculateAimLine(gameState.aimStart, mousePos);
    
    gameState.aimEnd = aimData.end;
    gameState.aimAngle = aimData.angle;
}

function handleMouseUp(e) {
    gameState.isAiming = false;
}

// Enhanced touch handlers with better feedback
function handleTouchStart(e) {
    e.preventDefault();
    
    if (e.touches.length !== 1) return; // Only handle single touch
    
    const touch = e.touches[0];
    gameState.touchStartTime = Date.now();
    gameState.lastTouchPos = { x: touch.clientX, y: touch.clientY };
    
    // Create visual touch indicator
    createTouchIndicator(touch.clientX, touch.clientY);
    
    // Convert to mouse event
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(e) {
    e.preventDefault();
    
    if (e.touches.length !== 1 || !gameState.isAiming) return;
    
    const touch = e.touches[0];
    gameState.lastTouchPos = { x: touch.clientX, y: touch.clientY };
    
    // Convert to mouse event
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

function handleTouchEnd(e) {
    e.preventDefault();
    
    const touchDuration = Date.now() - gameState.touchStartTime;
    
    // Quick tap to shoot (less than 200ms and minimal movement)
    if (touchDuration < 200 && gameState.isAiming && gameState.aimAngle !== 0) {
        shoot();
    }
    
    // Convert to mouse event
    const mouseEvent = new MouseEvent('mouseup', {});
    canvas.dispatchEvent(mouseEvent);
    
    gameState.lastTouchPos = null;
}

// Shoot the cue ball
function shoot() {
    if (gameState.ballsMoving || gameState.aimAngle === 0) return;
    
    cueBall.shoot(gameState.shotPower / 100, gameState.aimAngle);
    gameState.ballsMoving = true;
    gameState.shotCount++;
    gameState.currentBankCount = 0;
    updateScore();
}

// Update game state
function update(deltaTime) {
    // Update cue ball - use consistent table dimensions
    const cueBallResult = cueBall.update(deltaTime, 800, 400);
    if (cueBallResult.wallHit) {
        gameState.currentBankCount++;
    }
    
    // Update eight ball
    eightBall.update(deltaTime, 800, 400);
    
    // Check collision between balls
    if (checkBallCollision(cueBall, eightBall)) {
        resolveBallCollision(cueBall, eightBall);
        
        // Score based on bank shots
        if (gameState.currentBankCount > 0) {
            const points = gameState.currentBankCount * 100;
            gameState.score += points;
            gameState.bankCount += gameState.currentBankCount;
            
            // Visual feedback for successful bank shot
            showScorePopup(points);
        }
    }
    
    // Check if all balls have stopped
    gameState.ballsMoving = cueBall.isMoving || eightBall.isMoving;
    
    // Reset aim when balls stop
    if (!gameState.ballsMoving) {
        gameState.aimAngle = 0;
        gameState.aimEnd = null;
    }
}

// Render game
function render() {
    // Save the current transform state
    ctx.save();
    
    // Apply the stored transform
    ctx.setTransform(canvasTransform.scaleX, 0, 0, canvasTransform.scaleY, 0, 0);
    
    // Clear canvas using consistent dimensions
    ctx.fillStyle = '#155115';
    ctx.fillRect(0, 0, 800, 400);
    
    // Draw table markings
    drawTableMarkings();
    
    // Draw aiming line and preview
    if (gameState.isAiming && !gameState.ballsMoving) {
        drawAimingLine();
        drawShotPreview();
    }
    
    // Draw balls
    eightBall.draw(ctx);
    cueBall.draw(ctx);
    
    // Draw touch area indicator for mobile when not aiming
    if (gameState.isMobile && !gameState.isAiming && !gameState.ballsMoving) {
        drawTouchAreaIndicator();
    }
    
    // Draw power indicator on cue ball when aiming
    if ((gameState.isAiming || gameState.aimAngle !== 0) && !gameState.ballsMoving) {
        drawPowerIndicator();
    }
    
    // Draw enhanced aiming feedback for mobile
    if (gameState.isMobile && gameState.isAiming && !gameState.ballsMoving) {
        drawMobileAimingFeedback();
    }
    
    // Restore the transform state
    ctx.restore();
}

// Draw table markings
function drawTableMarkings() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    
    // Center line
    ctx.beginPath();
    ctx.moveTo(400, 0);
    ctx.lineTo(400, 400);
    ctx.stroke();
    
    // Corner pockets (visual only)
    const pocketRadius = 20;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    
    // Top-left
    ctx.beginPath();
    ctx.arc(0, 0, pocketRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Top-right
    ctx.beginPath();
    ctx.arc(800, 0, pocketRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Bottom-left
    ctx.beginPath();
    ctx.arc(0, 400, pocketRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Bottom-right
    ctx.beginPath();
    ctx.arc(800, 400, pocketRadius, 0, Math.PI * 2);
    ctx.fill();
}

// Draw aiming line
function drawAimingLine() {
    if (!gameState.aimEnd) return;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    ctx.beginPath();
    ctx.moveTo(cueBall.position.x, cueBall.position.y);
    ctx.lineTo(gameState.aimEnd.x, gameState.aimEnd.y);
    ctx.stroke();
    
    ctx.setLineDash([]);
}

// Draw shot preview
function drawShotPreview() {
    const preview = calculateBankShotPreview(
        cueBall, 
        gameState.aimAngle, 
        gameState.shotPower / 100,
        800,
        400
    );
    
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    for (let i = 0; i < preview.length - 1; i += 5) {
        if (i === 0) {
            ctx.moveTo(preview[i].x, preview[i].y);
        } else {
            ctx.lineTo(preview[i].x, preview[i].y);
        }
    }
    ctx.stroke();
}

// Draw power indicator
function drawPowerIndicator() {
    const angle = gameState.aimAngle + Math.PI;
    const distance = 30 + (gameState.shotPower / 100) * 20;
    
    const x = cueBall.position.x + Math.cos(angle) * distance;
    const y = cueBall.position.y + Math.sin(angle) * distance;
    
    // Draw cue stick
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = gameState.isMobile ? 8 : 6;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * 40, y + Math.sin(angle) * 40);
    ctx.stroke();
    
    // Draw cue tip
    ctx.fillStyle = '#4169E1';
    ctx.beginPath();
    ctx.arc(x, y, gameState.isMobile ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
}

// Draw touch area indicator for mobile
function drawTouchAreaIndicator() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    
    ctx.beginPath();
    ctx.arc(cueBall.position.x, cueBall.position.y, 80, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    // Draw tap instruction
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = gameState.isMobile ? '14px Arial' : '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('TAP TO AIM', cueBall.position.x, cueBall.position.y + 110);
}

// Draw enhanced aiming feedback for mobile
function drawMobileAimingFeedback() {
    if (!gameState.aimEnd) return;
    
    // Draw thicker aiming line for mobile
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 8]);
    
    ctx.beginPath();
    ctx.moveTo(cueBall.position.x, cueBall.position.y);
    ctx.lineTo(gameState.aimEnd.x, gameState.aimEnd.y);
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    // Draw power arc around cue ball
    const powerPercent = gameState.shotPower / 100;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (2 * Math.PI * powerPercent);
    
    ctx.strokeStyle = `hsl(${120 * powerPercent}, 100%, 50%)`;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.arc(cueBall.position.x, cueBall.position.y, 25, startAngle, endAngle);
    ctx.stroke();
    
    // Draw power percentage text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
        `${gameState.shotPower}%`,
        cueBall.position.x,
        cueBall.position.y - 40
    );
    
    // Draw quick tap instruction
    ctx.font = '12px Arial';
    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.fillText('QUICK TAP TO SHOOT', cueBall.position.x, cueBall.position.y + 50);
}

// Update score display
function updateScore() {
    document.getElementById('shotCount').textContent = gameState.shotCount;
    document.getElementById('bankCount').textContent = gameState.bankCount;
    document.getElementById('score').textContent = gameState.score;
}

// Show score popup animation
function showScorePopup(points) {
    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.textContent = `+${points}`;
    popup.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        font-size: 3rem;
        font-weight: bold;
        color: #4CAF50;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        animation: scorePopup 1s ease-out forwards;
        pointer-events: none;
        z-index: 1000;
    `;
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
        popup.remove();
    }, 1000);
}

// Add CSS animation for score popup
const style = document.createElement('style');
style.textContent = `
    @keyframes scorePopup {
        0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(0.5);
        }
        50% {
            opacity: 1;
            transform: translate(-50%, -70%) scale(1.2);
        }
        100% {
            opacity: 0;
            transform: translate(-50%, -100%) scale(1);
        }
    }
`;
document.head.appendChild(style);

// Reset game
function resetGame() {
    // Reset ball positions to consistent coordinates
    cueBall.position = new Vector2(200, 200);
    cueBall.velocity = new Vector2(0, 0);
    cueBall.isMoving = false;
    
    eightBall.position = new Vector2(600, 200);
    eightBall.velocity = new Vector2(0, 0);
    eightBall.isMoving = false;
    
    // Reset game state
    gameState = {
        isAiming: false,
        aimStart: null,
        aimEnd: null,
        aimAngle: 0,
        shotPower: 50,
        shotCount: 0,
        bankCount: 0,
        currentBankCount: 0,
        score: 0,
        ballsMoving: false,
        isMobile: gameState.isMobile, // Preserve mobile state
        touchStartTime: 0,
        lastTouchPos: null
    };
    
    // Reset UI
    document.getElementById('powerSlider').value = 50;
    document.getElementById('powerValue').textContent = '50%';
    document.getElementById('mobilePowerSlider').value = 50;
    document.getElementById('mobilePowerValue').textContent = '50%';
    updateScore();
}

// Game loop
let lastTime = 0;
function gameLoop(currentTime) {
    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1); // Cap delta time
    lastTime = currentTime;
    
    update(deltaTime * 60); // Scale to 60 FPS
    render();
    
    requestAnimationFrame(gameLoop);
}

// Start game when page loads
window.addEventListener('load', init);