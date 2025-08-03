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
    lastTouchPos: null,
    // New mobile enhancement states
    isPinching: false,
    lastPinchDistance: 0,
    zoomLevel: 1,
    isRotating: false,
    lastRotationAngle: 0,
    longPressTimer: null,
    longPressActive: false,
    hapticEnabled: true,
    gestureMode: 'normal', // 'normal', 'precision', 'power'
    currentGesture: null,
    touchPoints: new Map(),
    aimAssistEnabled: true
};

// Haptic Feedback System
class HapticManager {
    constructor() {
        this.isSupported = 'vibrate' in navigator;
        this.patterns = {
            // Basic feedback patterns
            tap: [10],
            double_tap: [10, 50, 10],
            long_press: [20],
            
            // Game-specific patterns
            ball_collision: [15, 30, 15],
            wall_bounce: [25],
            successful_shot: [50, 100, 50, 100, 100],
            power_change: [5],
            aiming_tick: [3],
            
            // Bank shot celebrations
            single_bank: [30, 50, 30],
            double_bank: [30, 50, 30, 50, 50],
            triple_bank: [50, 100, 50, 100, 50, 100, 100],
            
            // Error/failure patterns
            miss: [100, 200, 100],
            invalid_action: [200],
            
            // Progressive power feedback
            power_low: [5],
            power_medium: [10],
            power_high: [20],
            power_max: [30, 50, 30]
        };
    }

    vibrate(pattern) {
        if (!this.isSupported || !gameState.hapticEnabled) return;
        
        if (typeof pattern === 'string') {
            pattern = this.patterns[pattern] || [10];
        }
        
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            console.warn('Haptic feedback failed:', e);
        }
    }

    // Context-aware haptic feedback
    ballCollision(velocity) {
        const intensity = Math.min(velocity / 10, 1);
        if (intensity > 0.7) {
            this.vibrate('ball_collision');
        } else if (intensity > 0.3) {
            this.vibrate([10, 20, 10]);
        } else {
            this.vibrate([5]);
        }
    }

    wallBounce(velocity) {
        const intensity = Math.min(velocity / 8, 1);
        if (intensity > 0.5) {
            this.vibrate([Math.floor(intensity * 30)]);
        } else {
            this.vibrate([Math.floor(intensity * 15)]);
        }
    }

    powerFeedback(powerLevel) {
        if (powerLevel < 25) {
            this.vibrate('power_low');
        } else if (powerLevel < 50) {
            this.vibrate('power_medium');
        } else if (powerLevel < 75) {
            this.vibrate('power_high');
        } else {
            this.vibrate('power_max');
        }
    }

    bankShotSuccess(bankCount) {
        switch (bankCount) {
            case 1:
                this.vibrate('single_bank');
                break;
            case 2:
                this.vibrate('double_bank');
                break;
            case 3:
            default:
                this.vibrate('triple_bank');
                break;
        }
    }

    aimingTick() {
        this.vibrate('aiming_tick');
    }
}

// Initialize haptic manager
const hapticManager = new HapticManager();

// Enhanced Mobile Gesture Recognition
class GestureRecognizer {
    constructor() {
        this.activeGestures = new Set();
        this.gestureThresholds = {
            pinch_min_distance: 50,
            rotation_min_angle: 15,
            long_press_duration: 500,
            swipe_min_velocity: 200,
            tap_max_duration: 200,
            tap_max_distance: 30
        };
        this.lastPinchDistance = 0;
        this.lastRotationAngle = 0;
        this.gestureStartTime = 0;
        this.initialTouchPositions = new Map();
    }

    startGesture(type, data = {}) {
        this.activeGestures.add(type);
        gameState.currentGesture = type;
        this.gestureStartTime = Date.now();
        
        // Haptic feedback for gesture start
        hapticManager.vibrate('tap');
        
        console.log(`Gesture started: ${type}`, data);
    }

    endGesture(type) {
        this.activeGestures.delete(type);
        if (this.activeGestures.size === 0) {
            gameState.currentGesture = null;
        }
        console.log(`Gesture ended: ${type}`);
    }

    isGestureActive(type) {
        return this.activeGestures.has(type);
    }

    detectPinch(touches) {
        if (touches.length !== 2) {
            if (this.isGestureActive('pinch')) {
                this.endGesture('pinch');
                gameState.isPinching = false;
            }
            return null;
        }

        const touch1 = touches[0];
        const touch2 = touches[1];
        const distance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );

        if (!this.isGestureActive('pinch') && Math.abs(distance - this.lastPinchDistance) > this.gestureThresholds.pinch_min_distance) {
            this.startGesture('pinch', { distance });
            gameState.isPinching = true;
        }

        if (this.isGestureActive('pinch')) {
            const scale = this.lastPinchDistance > 0 ? distance / this.lastPinchDistance : 1;
            this.lastPinchDistance = distance;
            return { scale, distance, center: {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            }};
        }

        this.lastPinchDistance = distance;
        return null;
    }

    detectRotation(touches) {
        if (touches.length !== 2) {
            if (this.isGestureActive('rotation')) {
                this.endGesture('rotation');
                gameState.isRotating = false;
            }
            return null;
        }

        const touch1 = touches[0];
        const touch2 = touches[1];
        const angle = Math.atan2(
            touch2.clientY - touch1.clientY,
            touch2.clientX - touch1.clientX
        ) * 180 / Math.PI;

        if (!this.isGestureActive('rotation') && Math.abs(angle - this.lastRotationAngle) > this.gestureThresholds.rotation_min_angle) {
            this.startGesture('rotation', { angle });
            gameState.isRotating = true;
        }

        if (this.isGestureActive('rotation')) {
            let deltaAngle = angle - this.lastRotationAngle;
            
            // Handle angle wrap-around
            if (deltaAngle > 180) deltaAngle -= 360;
            if (deltaAngle < -180) deltaAngle += 360;
            
            this.lastRotationAngle = angle;
            return { angle, deltaAngle };
        }

        this.lastRotationAngle = angle;
        return null;
    }

    detectLongPress(touch, startTime) {
        const duration = Date.now() - startTime;
        const initialPos = this.initialTouchPositions.get('longpress');
        
        if (!initialPos) {
            this.initialTouchPositions.set('longpress', { x: touch.clientX, y: touch.clientY });
            return null;
        }

        const distance = Math.sqrt(
            Math.pow(touch.clientX - initialPos.x, 2) +
            Math.pow(touch.clientY - initialPos.y, 2)
        );

        if (duration > this.gestureThresholds.long_press_duration && distance < this.gestureThresholds.tap_max_distance) {
            if (!this.isGestureActive('longpress')) {
                this.startGesture('longpress', { duration });
                gameState.longPressActive = true;
                hapticManager.vibrate('long_press');
                return { type: 'start', duration };
            }
        }

        return null;
    }

    detectSwipe(startTouch, endTouch, duration) {
        const distance = Math.sqrt(
            Math.pow(endTouch.clientX - startTouch.clientX, 2) +
            Math.pow(endTouch.clientY - startTouch.clientY, 2)
        );
        
        const velocity = distance / duration;
        
        if (velocity > this.gestureThresholds.swipe_min_velocity && duration < 500) {
            const angle = Math.atan2(
                endTouch.clientY - startTouch.clientY,
                endTouch.clientX - startTouch.clientX
            );
            
            hapticManager.vibrate('double_tap');
            
            return {
                velocity,
                angle,
                distance,
                direction: this.getSwipeDirection(angle)
            };
        }
        
        return null;
    }

    getSwipeDirection(angle) {
        const degrees = angle * 180 / Math.PI;
        if (degrees >= -45 && degrees <= 45) return 'right';
        if (degrees >= 45 && degrees <= 135) return 'down';
        if (degrees >= 135 || degrees <= -135) return 'left';
        return 'up';
    }

    reset() {
        this.activeGestures.clear();
        gameState.currentGesture = null;
        gameState.isPinching = false;
        gameState.isRotating = false;
        gameState.longPressActive = false;
        this.initialTouchPositions.clear();
    }
}

// Initialize gesture recognizer
const gestureRecognizer = new GestureRecognizer();

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
    
    // Initialize enhanced UI
    uiManager.init();
    
    // Show tutorial for first-time mobile users
    if (tutorialManager.shouldShowTutorial()) {
        // Delay tutorial to allow game to fully load
        setTimeout(() => {
            tutorialManager.start();
        }, 1000);
    }
    
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
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false }); // Handle touch cancellation
    
    // Prevent context menu on long press
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Power slider - both desktop and mobile
    const powerSlider = document.getElementById('powerSlider');
    const mobilePowerSlider = document.getElementById('mobilePowerSlider');
    
    const updatePower = (value) => {
        const oldPower = gameState.shotPower;
        gameState.shotPower = parseInt(value);
        document.getElementById('powerValue').textContent = gameState.shotPower + '%';
        document.getElementById('mobilePowerValue').textContent = gameState.shotPower + '%';
        // Sync both sliders
        powerSlider.value = value;
        mobilePowerSlider.value = value;
        
        // Haptic feedback on power change (mobile only)
        if (gameState.isMobile && Math.abs(gameState.shotPower - oldPower) > 5) {
            hapticManager.powerFeedback(gameState.shotPower);
        }
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
    
    const touchRadius = gameState.isMobile ? 100 : 50; // Larger touch area on mobile for better usability
    
    if (distance < touchRadius) {
        gameState.isAiming = true;
        gameState.aimStart = new Vector2(cueBall.position.x, cueBall.position.y);
        
        // Set initial aim direction even if mouse hasn't moved yet
        const mousePos = new Vector2(x, y);
        const aimData = calculateAimLine(gameState.aimStart, mousePos);
        gameState.aimEnd = aimData.end;
        gameState.aimAngle = aimData.angle;
        
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

// Enhanced touch handlers with advanced gesture recognition
function handleTouchStart(e) {
    e.preventDefault();
    
    const touches = Array.from(e.touches);
    const now = Date.now();
    
    // Store touch points for gesture recognition
    touches.forEach((touch, index) => {
        gameState.touchPoints.set(touch.identifier, {
            startX: touch.clientX,
            startY: touch.clientY,
            currentX: touch.clientX,
            currentY: touch.clientY,
            startTime: now
        });
    });
    
    // Handle multi-touch gestures
    if (touches.length === 2) {
        // Detect pinch and rotation
        const pinchData = gestureRecognizer.detectPinch(touches);
        const rotationData = gestureRecognizer.detectRotation(touches);
        
        if (pinchData) {
            handlePinchGesture(pinchData);
        }
        
        if (rotationData) {
            handleRotationGesture(rotationData);
        }
        
        return; // Don't process single-touch logic for multi-touch
    }
    
    // Single touch handling
    if (touches.length === 1) {
        const touch = touches[0];
        gameState.touchStartTime = now;
        gameState.lastTouchPos = { x: touch.clientX, y: touch.clientY };
        
        // Create visual touch indicator with enhanced feedback
        createTouchIndicator(touch.clientX, touch.clientY);
        
        // Start long press detection
        setTimeout(() => {
            if (gameState.touchPoints.has(touch.identifier)) {
                const longPressData = gestureRecognizer.detectLongPress(touch, now);
                if (longPressData) {
                    handleLongPress(touch);
                }
            }
        }, gestureRecognizer.gestureThresholds.long_press_duration);
        
        // Convert to mouse event for existing logic
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
        
        // Haptic feedback for touch start
        hapticManager.vibrate('tap');
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    
    const touches = Array.from(e.touches);
    
    // Update touch point positions
    touches.forEach(touch => {
        if (gameState.touchPoints.has(touch.identifier)) {
            const touchPoint = gameState.touchPoints.get(touch.identifier);
            touchPoint.currentX = touch.clientX;
            touchPoint.currentY = touch.clientY;
        }
    });
    
    // Handle multi-touch gestures
    if (touches.length === 2) {
        const pinchData = gestureRecognizer.detectPinch(touches);
        const rotationData = gestureRecognizer.detectRotation(touches);
        
        if (pinchData) {
            handlePinchGesture(pinchData);
        }
        
        if (rotationData) {
            handleRotationGesture(rotationData);
        }
        
        return;
    }
    
    // Single touch handling
    if (touches.length === 1 && gameState.isAiming) {
        const touch = touches[0];
        gameState.lastTouchPos = { x: touch.clientX, y: touch.clientY };
        
        // Convert to mouse event for existing logic
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
        
        // Subtle haptic feedback during aiming
        if (Math.random() < 0.1) { // Occasional feedback to avoid overwhelming
            hapticManager.aimingTick();
        }
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    
    const changedTouches = Array.from(e.changedTouches);
    const remainingTouches = Array.from(e.touches);
    
    changedTouches.forEach(touch => {
        const touchPoint = gameState.touchPoints.get(touch.identifier);
        if (!touchPoint) return;
        
        const duration = Date.now() - touchPoint.startTime;
        
        // Detect swipe gesture
        const swipeData = gestureRecognizer.detectSwipe(
            { clientX: touchPoint.startX, clientY: touchPoint.startY },
            { clientX: touch.clientX, clientY: touch.clientY },
            duration
        );
        
        if (swipeData) {
            handleSwipeGesture(swipeData, touch);
        } else if (duration < gestureRecognizer.gestureThresholds.tap_max_duration) {
            // Quick tap behavior
            const distance = Math.sqrt(
                Math.pow(touch.clientX - touchPoint.startX, 2) +
                Math.pow(touch.clientY - touchPoint.startY, 2)
            );
            
            if (distance < gestureRecognizer.gestureThresholds.tap_max_distance) {
                if (gameState.isAiming && gameState.aimEnd) {
                    shoot();
                    hapticManager.vibrate('successful_shot');
                }
            }
        }
        
        gameState.touchPoints.delete(touch.identifier);
    });
    
    // Reset gesture states if no touches remain
    if (remainingTouches.length === 0) {
        gestureRecognizer.reset();
        gameState.lastTouchPos = null;
        
        // Convert to mouse event for existing logic
        const touch = changedTouches[0];
        if (touch) {
            const mouseEvent = new MouseEvent('mouseup', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        }
    }
}

// New gesture handler functions
function handlePinchGesture(pinchData) {
    const { scale, center } = pinchData;
    
    // Zoom functionality
    gameState.zoomLevel = Math.max(0.5, Math.min(3.0, gameState.zoomLevel * scale));
    
    // Apply zoom to canvas context
    updateCanvasZoom();
    
    // Update UI
    uiManager.updateOnPinch();
    
    // Haptic feedback for pinch
    if (scale > 1.05 || scale < 0.95) {
        hapticManager.vibrate('power_change');
    }
}

function handleRotationGesture(rotationData) {
    const { deltaAngle } = rotationData;
    
    // Fine-tune aiming angle if currently aiming
    if (gameState.isAiming && gameState.aimEnd) {
        const sensitivity = 0.5; // Rotation sensitivity
        gameState.aimAngle += deltaAngle * sensitivity;
        
        // Update aim end position based on new angle
        const distance = Math.sqrt(
            Math.pow(gameState.aimEnd.x - cueBall.position.x, 2) +
            Math.pow(gameState.aimEnd.y - cueBall.position.y, 2)
        );
        
        gameState.aimEnd.x = cueBall.position.x + Math.cos(gameState.aimAngle * Math.PI / 180) * distance;
        gameState.aimEnd.y = cueBall.position.y + Math.sin(gameState.aimAngle * Math.PI / 180) * distance;
        
        // Haptic feedback for rotation
        hapticManager.vibrate('aiming_tick');
    }
}

function handleLongPress(touch) {
    // Enter precision mode
    gameState.gestureMode = 'precision';
    
    // Update UI
    uiManager.updateOnGestureChange();
    
    // Create visual indicator for precision mode
    createPrecisionModeIndicator(touch.clientX, touch.clientY);
    
    // Strong haptic feedback for mode change
    hapticManager.vibrate('long_press');
    
    console.log('Entered precision mode');
}

function handleSwipeGesture(swipeData, touch) {
    const { velocity, angle, direction } = swipeData;
    
    if (!gameState.ballsMoving && !gameState.isAiming) {
        // Quick swipe from cue ball area to shoot
        const rect = canvas.getBoundingClientRect();
        const canvasX = (touch.clientX - rect.left) / canvasTransform.scaleX;
        const canvasY = (touch.clientY - rect.top) / canvasTransform.scaleY;
        
        const distance = Math.sqrt(
            Math.pow(canvasX - cueBall.position.x, 2) +
            Math.pow(canvasY - cueBall.position.y, 2)
        );
        
        if (distance < 100) { // Within swipe range of cue ball
            // Set power based on swipe velocity
            const power = Math.min(100, Math.max(10, velocity / 10));
            gameState.shotPower = power;
            updatePower(power);
            
            // Set angle based on swipe direction
            gameState.aimAngle = angle * 180 / Math.PI;
            gameState.aimEnd = {
                x: cueBall.position.x + Math.cos(angle) * 100,
                y: cueBall.position.y + Math.sin(angle) * 100
            };
            gameState.aimStart = { x: cueBall.position.x, y: cueBall.position.y };
            
            // Shoot immediately
            setTimeout(() => {
                shoot();
            }, 100); // Small delay for visual feedback
            
            console.log(`Swipe shot: power=${power}, direction=${direction}`);
        }
    }
}

// Canvas zoom functionality
function updateCanvasZoom() {
    // Store the current transform matrix
    ctx.save();
    
    // Calculate zoom center (center of canvas)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Apply zoom transformation
    ctx.translate(centerX, centerY);
    ctx.scale(gameState.zoomLevel, gameState.zoomLevel);
    ctx.translate(-centerX, -centerY);
}

// Visual indicator for precision mode
function createPrecisionModeIndicator(x, y) {
    const indicator = document.createElement('div');
    indicator.className = 'precision-mode-indicator';
    indicator.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 80px;
        height: 80px;
        border: 4px solid #FFD700;
        border-radius: 50%;
        pointer-events: none;
        transform: translate(-50%, -50%);
        animation: precisionPulse 1s ease-out;
        z-index: 1001;
        background: rgba(255, 215, 0, 0.2);
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
    `;
    
    document.body.appendChild(indicator);
    
    // Remove after animation
    setTimeout(() => {
        indicator.remove();
    }, 1000);
}

// Enhanced visual feedback system
class VisualFeedbackManager {
    constructor() {
        this.activeIndicators = new Set();
        this.trajectoryPoints = [];
        this.ghostBallPosition = null;
    }

    // Create enhanced touch ripple
    createTouchRipple(x, y, intensity = 1) {
        const ripple = document.createElement('div');
        ripple.className = 'enhanced-touch-ripple';
        
        const size = 40 + (intensity * 20);
        const duration = 400 + (intensity * 200);
        
        ripple.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: ${size}px;
            height: ${size}px;
            border: 3px solid rgba(255, 255, 255, 0.8);
            border-radius: 50%;
            pointer-events: none;
            transform: translate(-50%, -50%) scale(0);
            animation: enhancedRipple ${duration}ms ease-out;
            z-index: 1000;
        `;
        
        document.body.appendChild(ripple);
        this.activeIndicators.add(ripple);
        
        setTimeout(() => {
            ripple.remove();
            this.activeIndicators.delete(ripple);
        }, duration);
    }

    // Show trajectory preview with enhanced visualization
    updateTrajectoryPreview(startX, startY, angle, power) {
        this.trajectoryPoints = [];
        
        // Simulate ball path
        let currentX = startX;
        let currentY = startY;
        let velocityX = Math.cos(angle) * (power / 10);
        let velocityY = Math.sin(angle) * (power / 10);
        
        const friction = 0.985;
        const wallDamping = 0.85;
        const maxPoints = 50;
        
        for (let i = 0; i < maxPoints && Math.sqrt(velocityX * velocityX + velocityY * velocityY) > 0.5; i++) {
            currentX += velocityX;
            currentY += velocityY;
            
            // Wall collisions
            if (currentX <= 15 || currentX >= 785) {
                velocityX *= -wallDamping;
                currentX = Math.max(15, Math.min(785, currentX));
            }
            if (currentY <= 15 || currentY >= 385) {
                velocityY *= -wallDamping;
                currentY = Math.max(15, Math.min(385, currentY));
            }
            
            velocityX *= friction;
            velocityY *= friction;
            
            this.trajectoryPoints.push({ x: currentX, y: currentY, opacity: 1 - (i / maxPoints) });
        }
        
        // Set ghost ball position (final position)
        if (this.trajectoryPoints.length > 0) {
            const lastPoint = this.trajectoryPoints[this.trajectoryPoints.length - 1];
            this.ghostBallPosition = { x: lastPoint.x, y: lastPoint.y };
        }
    }

    // Draw enhanced trajectory on canvas
    drawEnhancedTrajectory() {
        if (this.trajectoryPoints.length === 0) return;
        
        ctx.save();
        
        // Draw trajectory line with gradient opacity
        for (let i = 0; i < this.trajectoryPoints.length - 1; i++) {
            const point = this.trajectoryPoints[i];
            const nextPoint = this.trajectoryPoints[i + 1];
            
            ctx.strokeStyle = `rgba(255, 255, 255, ${point.opacity * 0.8})`;
            ctx.lineWidth = gameState.isMobile ? 4 : 3;
            ctx.lineCap = 'round';
            
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(nextPoint.x, nextPoint.y);
            ctx.stroke();
        }
        
        // Draw trajectory points
        this.trajectoryPoints.forEach((point, index) => {
            if (index % 3 === 0) { // Show every 3rd point to avoid clutter
                ctx.fillStyle = `rgba(255, 255, 255, ${point.opacity * 0.6})`;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        
        // Draw ghost ball
        if (this.ghostBallPosition) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            
            ctx.beginPath();
            ctx.arc(this.ghostBallPosition.x, this.ghostBallPosition.y, 15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fill();
            
            ctx.setLineDash([]);
        }
        
        ctx.restore();
    }

    // Show power meter with enhanced visuals
    drawEnhancedPowerMeter(centerX, centerY, power) {
        const radius = 35;
        const powerPercent = power / 100;
        
        ctx.save();
        
        // Background circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Power arc with color gradient
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (2 * Math.PI * powerPercent);
        
        // Color based on power level
        let color;
        if (powerPercent < 0.3) {
            color = `hsl(120, 100%, 50%)`; // Green for low power
        } else if (powerPercent < 0.7) {
            color = `hsl(60, 100%, 50%)`; // Yellow for medium power
        } else {
            color = `hsl(0, 100%, 50%)`; // Red for high power
        }
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        
        // Add glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.stroke();
        
        // Power percentage text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 0;
        ctx.fillText(`${Math.round(power)}%`, centerX, centerY + 5);
        
        ctx.restore();
    }
}

// Initialize visual feedback manager
const visualFeedbackManager = new VisualFeedbackManager();

// Tutorial System
class TutorialManager {
    constructor() {
        this.isActive = false;
        this.currentStep = 0;
        this.steps = [
            {
                title: "Welcome to Enhanced Mobile Controls!",
                description: "Let's learn how to use the advanced touch controls for the best billiards experience.",
                action: null
            },
            {
                title: "Basic Touch Controls",
                description: "Tap and drag from the cue ball to aim your shot. The longer you drag, the more precise your aim.",
                action: "demonstrate_basic_aim"
            },
            {
                title: "Quick Tap to Shoot",
                description: "After aiming, quickly tap anywhere to shoot with your current power setting.",
                action: "demonstrate_quick_tap"
            },
            {
                title: "Swipe to Shoot",
                description: "Swipe from the cue ball in any direction for an instant shot. Swipe speed controls power!",
                action: "demonstrate_swipe"
            },
            {
                title: "Pinch to Zoom",
                description: "Use two fingers to pinch in/out for zooming. Perfect for precision aiming!",
                action: "demonstrate_pinch"
            },
            {
                title: "Rotation for Fine Aiming",
                description: "While aiming, use two fingers to rotate for micro-adjustments to your shot angle.",
                action: "demonstrate_rotation"
            },
            {
                title: "Long Press for Precision Mode",
                description: "Hold your finger on the cue ball for enhanced precision mode with better visual aids.",
                action: "demonstrate_long_press"
            },
            {
                title: "Haptic Feedback",
                description: "Feel the game! Haptic feedback responds to ball collisions, wall bounces, and successful shots.",
                action: "demonstrate_haptic"
            },
            {
                title: "You're Ready to Play!",
                description: "Try combining these gestures for the ultimate mobile billiards experience. Have fun!",
                action: null
            }
        ];
    }

    start() {
        if (gameState.isMobile) {
            this.isActive = true;
            this.currentStep = 0;
            this.showStep();
            document.getElementById('tutorialOverlay').style.display = 'flex';
        }
    }

    showStep() {
        const step = this.steps[this.currentStep];
        const stepElement = document.getElementById('tutorialStep');
        
        stepElement.innerHTML = `
            <h4>${step.title}</h4>
            <p>${step.description}</p>
            ${step.action ? '<div class="tutorial-gesture-demo"></div>' : ''}
            <div class="tutorial-actions">
                <button id="tutorialNext" class="btn-primary">${this.currentStep < this.steps.length - 1 ? 'Next' : 'Finish'}</button>
                <button id="tutorialSkip" class="btn-secondary">Skip Tutorial</button>
            </div>
        `;

        // Add event listeners
        document.getElementById('tutorialNext').addEventListener('click', () => this.nextStep());
        document.getElementById('tutorialSkip').addEventListener('click', () => this.end());

        // Trigger action demonstration
        if (step.action) {
            this.demonstrateAction(step.action);
        }
    }

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep();
        } else {
            this.end();
        }
    }

    end() {
        this.isActive = false;
        document.getElementById('tutorialOverlay').style.display = 'none';
        
        // Mark tutorial as completed
        localStorage.setItem('billiards_tutorial_completed', 'true');
    }

    demonstrateAction(action) {
        // Add visual demonstrations for each gesture
        switch (action) {
            case 'demonstrate_basic_aim':
                // Show animated aiming line
                break;
            case 'demonstrate_swipe':
                // Show swipe animation
                break;
            case 'demonstrate_pinch':
                // Show pinch gesture animation
                break;
            // Add more demonstrations as needed
        }
    }

    shouldShowTutorial() {
        return gameState.isMobile && !localStorage.getItem('billiards_tutorial_completed');
    }
}

// Enhanced UI Manager
class EnhancedUIManager {
    constructor() {
        this.floatingControlsVisible = false;
        this.zoomIndicatorVisible = false;
        this.lastInteractionTime = Date.now();
        this.autoHideTimeout = null;
    }

    init() {
        this.setupFloatingControls();
        this.setupZoomIndicator();
        this.setupGestureMode();
        this.setupAutoHide();
    }

    setupFloatingControls() {
        const floatingControls = document.getElementById('floatingControls');
        const hapticToggle = document.getElementById('hapticToggle');
        const aimAssistToggle = document.getElementById('aimAssistToggle');
        const precisionModeBtn = document.getElementById('precisionModeBtn');

        // Show floating controls on mobile
        if (gameState.isMobile) {
            this.showFloatingControls();
        }

        // Haptic toggle
        hapticToggle.addEventListener('change', (e) => {
            gameState.hapticEnabled = e.target.checked;
            if (gameState.hapticEnabled) {
                hapticManager.vibrate('tap');
            }
        });

        // Aim assist toggle
        aimAssistToggle.addEventListener('change', (e) => {
            gameState.aimAssistEnabled = e.target.checked;
        });

        // Precision mode button
        precisionModeBtn.addEventListener('click', () => {
            gameState.gestureMode = gameState.gestureMode === 'precision' ? 'normal' : 'precision';
            this.updateGestureModeDisplay();
            hapticManager.vibrate('double_tap');
        });

        // Voice control button
        const voiceControlBtn = document.getElementById('voiceControlBtn');
        voiceControlBtn.addEventListener('click', () => {
            accessibilityManager.toggleVoiceControl();
            // Update button appearance
            if (accessibilityManager.isListening) {
                voiceControlBtn.classList.add('voice-control-active');
                voiceControlBtn.textContent = '🔴 Listening';
            } else {
                voiceControlBtn.classList.remove('voice-control-active');
                voiceControlBtn.textContent = '🎤 Voice';
            }
        });
    }

    setupZoomIndicator() {
        const zoomIndicator = document.getElementById('zoomIndicator');
        const zoomLevel = document.getElementById('zoomLevel');

        // Update zoom level display
        this.updateZoomDisplay = () => {
            const zoomPercent = Math.round(gameState.zoomLevel * 100);
            zoomLevel.textContent = `${zoomPercent}%`;
            
            if (zoomPercent !== 100) {
                this.showZoomIndicator();
                this.scheduleZoomIndicatorHide();
            } else {
                this.hideZoomIndicator();
            }
        };
    }

    setupGestureMode() {
        const gestureModeDisplay = document.getElementById('gestureModeDisplay');
        
        this.updateGestureModeDisplay = () => {
            const mode = gameState.gestureMode;
            gestureModeDisplay.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
            
            // Update body class for styling
            document.body.className = document.body.className.replace(/gesture-mode-\w+/g, '');
            document.body.classList.add(`gesture-mode-${mode}`);
        };
    }

    setupAutoHide() {
        // Auto-hide floating controls when not interacting
        this.scheduleAutoHide = () => {
            if (this.autoHideTimeout) {
                clearTimeout(this.autoHideTimeout);
            }
            
            this.autoHideTimeout = setTimeout(() => {
                if (Date.now() - this.lastInteractionTime > 3000) { // 3 seconds
                    this.hideFloatingControls();
                }
            }, 3000);
        };

        // Track interactions
        document.addEventListener('touchstart', () => {
            this.lastInteractionTime = Date.now();
            this.showFloatingControls();
            this.scheduleAutoHide();
        });
    }

    showFloatingControls() {
        const floatingControls = document.getElementById('floatingControls');
        floatingControls.classList.add('visible');
        this.floatingControlsVisible = true;
    }

    hideFloatingControls() {
        const floatingControls = document.getElementById('floatingControls');
        floatingControls.classList.remove('visible');
        this.floatingControlsVisible = false;
    }

    showZoomIndicator() {
        const zoomIndicator = document.getElementById('zoomIndicator');
        zoomIndicator.classList.add('visible');
        this.zoomIndicatorVisible = true;
    }

    hideZoomIndicator() {
        const zoomIndicator = document.getElementById('zoomIndicator');
        zoomIndicator.classList.remove('visible');
        this.zoomIndicatorVisible = false;
    }

    scheduleZoomIndicatorHide() {
        setTimeout(() => {
            this.hideZoomIndicator();
        }, 2000);
    }

    updateOnPinch() {
        this.updateZoomDisplay();
    }

    updateOnGestureChange() {
        this.updateGestureModeDisplay();
    }
}

// Initialize managers
const tutorialManager = new TutorialManager();
const uiManager = new EnhancedUIManager();

// Accessibility Manager
class AccessibilityManager {
    constructor() {
        this.voiceEnabled = false;
        this.speechSynthesis = window.speechSynthesis;
        this.speechRecognition = null;
        this.isListening = false;
        this.announcements = [];
        this.lastAnnouncementTime = 0;
        
        this.initVoiceRecognition();
        this.setupScreenReader();
        this.setupKeyboardNavigation();
    }

    initVoiceRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.speechRecognition = new SpeechRecognition();
            
            this.speechRecognition.continuous = true;
            this.speechRecognition.interimResults = true;
            this.speechRecognition.lang = 'en-US';
            
            this.speechRecognition.onresult = (event) => {
                const last = event.results.length - 1;
                const command = event.results[last][0].transcript.toLowerCase().trim();
                
                if (event.results[last].isFinal) {
                    this.processVoiceCommand(command);
                }
            };
            
            this.speechRecognition.onerror = (event) => {
                console.warn('Speech recognition error:', event.error);
            };
        }
    }

    toggleVoiceControl() {
        if (!this.speechRecognition) {
            this.announce("Voice control not supported on this device");
            return;
        }

        if (this.isListening) {
            this.speechRecognition.stop();
            this.isListening = false;
            this.announce("Voice control disabled");
        } else {
            this.speechRecognition.start();
            this.isListening = true;
            this.announce("Voice control enabled. Say commands like aim left, more power, or shoot");
        }
    }

    processVoiceCommand(command) {
        console.log('Voice command:', command);
        
        // Power control commands
        if (command.includes('more power') || command.includes('increase power')) {
            const newPower = Math.min(100, gameState.shotPower + 10);
            updatePower(newPower);
            this.announce(`Power increased to ${newPower} percent`);
        } else if (command.includes('less power') || command.includes('decrease power')) {
            const newPower = Math.max(0, gameState.shotPower - 10);
            updatePower(newPower);
            this.announce(`Power decreased to ${newPower} percent`);
        } else if (command.includes('power') && /\d+/.test(command)) {
            const powerMatch = command.match(/\d+/);
            if (powerMatch) {
                const power = Math.min(100, Math.max(0, parseInt(powerMatch[0])));
                updatePower(power);
                this.announce(`Power set to ${power} percent`);
            }
        }
        
        // Aiming commands
        else if (command.includes('aim left')) {
            this.adjustAiming(-0.2);
            this.announce("Aiming left");
        } else if (command.includes('aim right')) {
            this.adjustAiming(0.2);
            this.announce("Aiming right");
        } else if (command.includes('aim up')) {
            this.adjustAiming(0, -0.2);
            this.announce("Aiming up");
        } else if (command.includes('aim down')) {
            this.adjustAiming(0, 0.2);
            this.announce("Aiming down");
        }
        
        // Shooting commands
        else if (command.includes('shoot') || command.includes('fire')) {
            if (gameState.isAiming) {
                shoot();
                this.announce("Shot fired");
            } else {
                this.announce("Please aim first");
            }
        }
        
        // Game state commands
        else if (command.includes('reset') || command.includes('new game')) {
            resetGame();
            this.announce("Game reset");
        } else if (command.includes('score')) {
            this.announce(`Current score is ${gameState.score} points with ${gameState.bankCount} bank shots`);
        }
        
        // Help commands
        else if (command.includes('help') || command.includes('commands')) {
            this.announceHelp();
        }
        
        // Precision mode
        else if (command.includes('precision mode')) {
            gameState.gestureMode = gameState.gestureMode === 'precision' ? 'normal' : 'precision';
            uiManager.updateOnGestureChange();
            this.announce(`${gameState.gestureMode} mode activated`);
        }
    }

    adjustAiming(deltaX = 0, deltaY = 0) {
        if (!gameState.isAiming || !gameState.aimEnd) {
            // Start aiming if not already
            gameState.isAiming = true;
            gameState.aimStart = { x: cueBall.position.x, y: cueBall.position.y };
            gameState.aimEnd = { x: cueBall.position.x + 100, y: cueBall.position.y };
        }
        
        // Adjust aim position
        gameState.aimEnd.x += deltaX * 50;
        gameState.aimEnd.y += deltaY * 50;
        
        // Keep within bounds
        gameState.aimEnd.x = Math.max(50, Math.min(750, gameState.aimEnd.x));
        gameState.aimEnd.y = Math.max(50, Math.min(350, gameState.aimEnd.y));
    }

    announceHelp() {
        const helpText = `Available voice commands: 
        Aiming: aim left, aim right, aim up, aim down.
        Power: more power, less power, power 50.
        Actions: shoot, reset game.
        Information: score, help.
        Modes: precision mode.`;
        this.announce(helpText);
    }

    announce(text, priority = 'polite') {
        // Prevent announcement spam
        const now = Date.now();
        if (now - this.lastAnnouncementTime < 500) return;
        
        this.lastAnnouncementTime = now;
        
        // Screen reader announcement
        this.announceToScreenReader(text, priority);
        
        // Speech synthesis
        if (this.speechSynthesis && gameState.isMobile) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.2;
            utterance.volume = 0.7;
            this.speechSynthesis.speak(utterance);
        }
    }

    announceToScreenReader(text, priority = 'polite') {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', priority);
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = text;
        
        document.body.appendChild(announcement);
        
        // Remove after announcement
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    setupScreenReader() {
        // Add screen reader descriptions to game elements
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Billiards game table with cue ball and 8-ball');
        
        // Add live region for game updates
        const liveRegion = document.createElement('div');
        liveRegion.id = 'game-live-region';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.className = 'sr-only';
        document.body.appendChild(liveRegion);
        
        // Announce game state changes
        this.setupGameStateAnnouncements();
    }

    setupGameStateAnnouncements() {
        // Monitor game state for screen reader announcements
        let lastBallsMoving = false;
        let lastScore = 0;
        
        const checkGameState = () => {
            // Announce when balls stop moving
            if (lastBallsMoving && !gameState.ballsMoving) {
                this.announce("Balls have stopped moving");
            }
            
            // Announce score changes
            if (gameState.score > lastScore) {
                const scoreDiff = gameState.score - lastScore;
                this.announce(`Scored ${scoreDiff} points! Total score: ${gameState.score}`);
            }
            
            lastBallsMoving = gameState.ballsMoving;
            lastScore = gameState.score;
        };
        
        setInterval(checkGameState, 500);
    }

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            if (!gameState.isMobile) return; // Only for mobile accessibility
            
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.adjustAiming(-0.2);
                    this.announce("Aiming left");
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.adjustAiming(0.2);
                    this.announce("Aiming right");
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.adjustAiming(0, -0.2);
                    this.announce("Aiming up");
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.adjustAiming(0, 0.2);
                    this.announce("Aiming down");
                    break;
                case ' ':
                case 'Enter':
                    e.preventDefault();
                    if (gameState.isAiming) {
                        shoot();
                        this.announce("Shot fired");
                    }
                    break;
                case 'r':
                case 'R':
                    e.preventDefault();
                    resetGame();
                    this.announce("Game reset");
                    break;
                case 'v':
                case 'V':
                    e.preventDefault();
                    this.toggleVoiceControl();
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    gameState.gestureMode = gameState.gestureMode === 'precision' ? 'normal' : 'precision';
                    uiManager.updateOnGestureChange();
                    this.announce(`${gameState.gestureMode} mode activated`);
                    break;
            }
        });
    }
}

// Performance Optimization Manager
class PerformanceManager {
    constructor() {
        this.frameRate = 60;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 60;
        this.isLowPowerMode = false;
        this.touchEventQueue = [];
        this.maxTouchEvents = 10;
        
        this.init();
    }

    init() {
        this.detectPerformanceMode();
        this.setupFrameRateMonitoring();
        this.setupTouchEventOptimization();
        this.setupBatteryOptimization();
    }

    detectPerformanceMode() {
        // Detect if device should use low power mode
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        
        if (connection) {
            this.isLowPowerMode = connection.saveData || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
        }
        
        // Also check for older devices
        const isOldDevice = /iPhone [1-6]|iPad [1-4]|Android [1-4]/.test(navigator.userAgent);
        if (isOldDevice) {
            this.isLowPowerMode = true;
        }
        
        if (this.isLowPowerMode) {
            console.log('Low power mode enabled for better performance');
            this.optimizeForLowPower();
        }
    }

    optimizeForLowPower() {
        // Reduce visual effects
        gameState.hapticEnabled = false;
        gameState.aimAssistEnabled = false;
        
        // Reduce frame rate target
        this.frameRate = 30;
        
        // Disable expensive animations
        document.body.classList.add('low-power-mode');
    }

    setupFrameRateMonitoring() {
        let frameCount = 0;
        let lastTime = performance.now();
        
        const monitorFPS = (currentTime) => {
            frameCount++;
            
            if (currentTime - lastTime >= 1000) {
                this.fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
                frameCount = 0;
                lastTime = currentTime;
                
                // Auto-adjust for performance
                if (this.fps < this.frameRate * 0.8) {
                    this.adjustForPerformance();
                }
            }
            
            requestAnimationFrame(monitorFPS);
        };
        
        requestAnimationFrame(monitorFPS);
    }

    adjustForPerformance() {
        if (!this.isLowPowerMode) {
            console.log('Performance below target, enabling optimizations');
            this.isLowPowerMode = true;
            this.optimizeForLowPower();
        }
    }

    setupTouchEventOptimization() {
        // Throttle touch events to prevent overwhelming the system
        let lastTouchTime = 0;
        const touchThrottle = 16; // ~60 FPS
        
        const originalHandleTouchMove = handleTouchMove;
        handleTouchMove = (e) => {
            const now = performance.now();
            if (now - lastTouchTime >= touchThrottle) {
                originalHandleTouchMove(e);
                lastTouchTime = now;
            }
        };
    }

    setupBatteryOptimization() {
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                const checkBattery = () => {
                    if (battery.level < 0.2 && !battery.charging) {
                        // Low battery mode
                        this.enableBatterySaver();
                    } else if (battery.level > 0.5 || battery.charging) {
                        // Normal mode
                        this.disableBatterySaver();
                    }
                };
                
                battery.addEventListener('levelchange', checkBattery);
                battery.addEventListener('chargingchange', checkBattery);
                checkBattery();
            });
        }
    }

    enableBatterySaver() {
        if (!this.isLowPowerMode) {
            console.log('Battery saver mode enabled');
            this.isLowPowerMode = true;
            this.optimizeForLowPower();
            
            // Show battery saver notification
            accessibilityManager.announce("Battery saver mode enabled");
        }
    }

    disableBatterySaver() {
        if (this.isLowPowerMode) {
            console.log('Battery saver mode disabled');
            this.isLowPowerMode = false;
            
            // Re-enable features
            gameState.hapticEnabled = true;
            gameState.aimAssistEnabled = true;
            this.frameRate = 60;
            document.body.classList.remove('low-power-mode');
            
            accessibilityManager.announce("Full performance mode restored");
        }
    }
}

// Initialize accessibility and performance managers
const accessibilityManager = new AccessibilityManager();
const performanceManager = new PerformanceManager();

// Shoot the cue ball
function shoot() {
    console.log('Shoot called:', {
        ballsMoving: gameState.ballsMoving,
        aimEnd: gameState.aimEnd,
        aimAngle: gameState.aimAngle,
        shotPower: gameState.shotPower
    });
    
    if (gameState.ballsMoving || !gameState.aimEnd) {
        console.log('Shot blocked:', gameState.ballsMoving ? 'balls moving' : 'no aim end');
        return;
    }
    
    console.log('Shooting ball with power:', gameState.shotPower / 100, 'angle:', gameState.aimAngle);
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
        // Haptic feedback for wall bounce
        if (gameState.isMobile) {
            hapticManager.wallBounce(cueBall.velocity.magnitude());
        }
    }
    
    // Update eight ball
    const eightBallResult = eightBall.update(deltaTime, 800, 400);
    if (eightBallResult.wallHit && gameState.isMobile) {
        hapticManager.wallBounce(eightBall.velocity.magnitude());
    }
    
    // Check collision between balls
    if (checkBallCollision(cueBall, eightBall)) {
        // Haptic feedback for ball collision
        if (gameState.isMobile) {
            const collisionVelocity = cueBall.velocity.magnitude() + eightBall.velocity.magnitude();
            hapticManager.ballCollision(collisionVelocity);
        }
        
        resolveBallCollision(cueBall, eightBall);
        
        // Score based on bank shots
        if (gameState.currentBankCount > 0) {
            const points = gameState.currentBankCount * 100;
            gameState.score += points;
            gameState.bankCount += gameState.currentBankCount;
            
            // Haptic feedback for successful bank shot
            if (gameState.isMobile) {
                hapticManager.bankShotSuccess(gameState.currentBankCount);
            }
            
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
    if ((gameState.isAiming || gameState.aimEnd) && !gameState.ballsMoving) {
        drawPowerIndicator();
    }
    
    // Draw enhanced aiming feedback for mobile
    if (gameState.isMobile && gameState.isAiming && !gameState.ballsMoving) {
        drawMobileAimingFeedback();
        
        // Enhanced trajectory preview in precision mode
        if (gameState.gestureMode === 'precision' && gameState.aimEnd) {
            const angle = Math.atan2(
                gameState.aimEnd.y - cueBall.position.y,
                gameState.aimEnd.x - cueBall.position.x
            );
            visualFeedbackManager.updateTrajectoryPreview(
                cueBall.position.x, 
                cueBall.position.y, 
                angle, 
                gameState.shotPower
            );
            visualFeedbackManager.drawEnhancedTrajectory();
        }
        
        // Enhanced power meter
        visualFeedbackManager.drawEnhancedPowerMeter(
            cueBall.position.x, 
            cueBall.position.y - 60, 
            gameState.shotPower
        );
    }
    
    // Draw aim assist indicators
    if (gameState.aimAssistEnabled && gameState.isMobile && gameState.isAiming) {
        drawAimAssistIndicators();
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
    ctx.arc(cueBall.position.x, cueBall.position.y, 100, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    // Draw tap instruction
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = gameState.isMobile ? '16px Arial' : '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('TAP & DRAG TO AIM', cueBall.position.x, cueBall.position.y + 120);
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
    
    // Draw cue stick representation for better visual feedback
    if (gameState.aimEnd) {
        const cueOffset = 40; // Distance from cue ball
        const cueLength = 60;
        const angle = Math.atan2(
            gameState.aimEnd.y - cueBall.position.y,
            gameState.aimEnd.x - cueBall.position.x
        );
        
        // Calculate cue stick position
        const cueStartX = cueBall.position.x - Math.cos(angle) * (cueBall.radius + cueOffset);
        const cueStartY = cueBall.position.y - Math.sin(angle) * (cueBall.radius + cueOffset);
        const cueEndX = cueStartX - Math.cos(angle) * cueLength;
        const cueEndY = cueStartY - Math.sin(angle) * cueLength;
        
        // Draw cue stick
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cueStartX, cueStartY);
        ctx.lineTo(cueEndX, cueEndY);
        ctx.stroke();
        
        // Draw cue tip
        ctx.fillStyle = '#D2691E';
        ctx.beginPath();
        ctx.arc(cueStartX, cueStartY, 4, 0, Math.PI * 2);
        ctx.fill();
    }
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
        lastTouchPos: null,
        // New mobile enhancement states
        isPinching: false,
        lastPinchDistance: 0,
        zoomLevel: 1,
        isRotating: false,
        lastRotationAngle: 0,
        longPressTimer: null,
        longPressActive: false,
        hapticEnabled: true,
        gestureMode: 'normal', // 'normal', 'precision', 'power'
        currentGesture: null,
        touchPoints: new Map(),
        aimAssistEnabled: true
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

// Draw aim assist indicators
function drawAimAssistIndicators() {
    if (!gameState.aimEnd) return;
    
    ctx.save();
    
    // Calculate potential bank shot angles
    const bankAngles = calculateBankShotSuggestions();
    
    bankAngles.forEach((suggestion, index) => {
        const { angle, difficulty, wallHits } = suggestion;
        
        // Color code by difficulty
        let color;
        switch (difficulty) {
            case 'easy':
                color = 'rgba(0, 255, 0, 0.6)';
                break;
            case 'medium':
                color = 'rgba(255, 255, 0, 0.6)';
                break;
            case 'hard':
                color = 'rgba(255, 165, 0, 0.6)';
                break;
            default:
                color = 'rgba(255, 255, 255, 0.4)';
        }
        
        // Draw suggestion indicator
        const indicatorX = cueBall.position.x + Math.cos(angle) * 80;
        const indicatorY = cueBall.position.y + Math.sin(angle) * 80;
        
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        
        // Draw indicator dot
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw line to indicator
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(cueBall.position.x, cueBall.position.y);
        ctx.lineTo(indicatorX, indicatorY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw wall hit count
        if (wallHits > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(wallHits.toString(), indicatorX, indicatorY - 8);
        }
    });
    
    ctx.restore();
}

// Calculate bank shot suggestions
function calculateBankShotSuggestions() {
    const suggestions = [];
    const targetX = eightBall.position.x;
    const targetY = eightBall.position.y;
    const cueX = cueBall.position.x;
    const cueY = cueBall.position.y;
    
    // Check various angles for bank shots
    for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 12) {
        const simulation = simulateBankShot(cueX, cueY, angle, targetX, targetY);
        
        if (simulation.hitsTarget) {
            suggestions.push({
                angle: angle,
                difficulty: simulation.difficulty,
                wallHits: simulation.wallHits,
                probability: simulation.probability
            });
        }
    }
    
    // Sort by probability and return top 3
    return suggestions
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 3);
}

// Simulate bank shot for aim assist
function simulateBankShot(startX, startY, angle, targetX, targetY) {
    let currentX = startX;
    let currentY = startY;
    let velocityX = Math.cos(angle) * 5;
    let velocityY = Math.sin(angle) * 5;
    let wallHits = 0;
    
    const friction = 0.985;
    const wallDamping = 0.85;
    const maxIterations = 100;
    const targetRadius = 20; // Tolerance for hitting target
    
    for (let i = 0; i < maxIterations; i++) {
        currentX += velocityX;
        currentY += velocityY;
        
        // Wall collisions
        if (currentX <= 15 || currentX >= 785) {
            velocityX *= -wallDamping;
            currentX = Math.max(15, Math.min(785, currentX));
            wallHits++;
        }
        if (currentY <= 15 || currentY >= 385) {
            velocityY *= -wallDamping;
            currentY = Math.max(15, Math.min(385, currentY));
            wallHits++;
        }
        
        // Check if near target
        const distanceToTarget = Math.sqrt(
            Math.pow(currentX - targetX, 2) + Math.pow(currentY - targetY, 2)
        );
        
        if (distanceToTarget < targetRadius) {
            let difficulty = 'easy';
            let probability = 0.9;
            
            if (wallHits === 1) {
                difficulty = 'easy';
                probability = 0.8;
            } else if (wallHits === 2) {
                difficulty = 'medium';
                probability = 0.6;
            } else if (wallHits >= 3) {
                difficulty = 'hard';
                probability = 0.4;
            }
            
            return {
                hitsTarget: true,
                difficulty: difficulty,
                wallHits: wallHits,
                probability: probability
            };
        }
        
        // Apply friction
        velocityX *= friction;
        velocityY *= friction;
        
        // Stop if velocity too low
        if (Math.sqrt(velocityX * velocityX + velocityY * velocityY) < 0.5) {
            break;
        }
    }
    
    return {
        hitsTarget: false,
        difficulty: 'impossible',
        wallHits: wallHits,
        probability: 0
    };
}