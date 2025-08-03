// Physics constants
const FRICTION = 0.985; // Rolling friction
const WALL_DAMPENING = 0.85; // Energy lost on wall collision
const BALL_RADIUS = 15; // Increased from 10 to 15 for better visibility
const MIN_VELOCITY = 0.1; // Minimum velocity before ball stops

// Vector math utilities
class Vector2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    subtract(v) {
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    multiply(scalar) {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const mag = this.magnitude();
        if (mag === 0) return new Vector2(0, 0);
        return new Vector2(this.x / mag, this.y / mag);
    }

    dot(v) {
        return this.x * v.x + this.y * v.y;
    }
}

// Ball class
class Ball {
    constructor(x, y, color, isEightBall = false) {
        this.position = new Vector2(x, y);
        this.velocity = new Vector2(0, 0);
        this.radius = BALL_RADIUS;
        this.color = color;
        this.isEightBall = isEightBall;
        this.isMoving = false;
    }

    update(deltaTime, tableWidth, tableHeight) {
        if (!this.isMoving) return { wallHit: false };

        // Update position
        this.position = this.position.add(this.velocity.multiply(deltaTime));

        // Check wall collisions (with pocket openings consideration)
        let wallHit = false;
        const pocketBuffer = 35; // Allow balls to get close to pockets
        
        // Left wall (avoid pocket areas at top and bottom)
        if (this.position.x - this.radius <= 0) {
            // Check if ball is near a pocket opening
            const nearTopPocket = this.position.y <= pocketBuffer;
            const nearBottomPocket = this.position.y >= tableHeight - pocketBuffer;
            
            if (!nearTopPocket && !nearBottomPocket) {
                this.position.x = this.radius;
                this.velocity.x = -this.velocity.x * WALL_DAMPENING;
                wallHit = true;
            }
        }
        
        // Right wall (avoid pocket areas at top and bottom)
        if (this.position.x + this.radius >= tableWidth) {
            // Check if ball is near a pocket opening
            const nearTopPocket = this.position.y <= pocketBuffer;
            const nearBottomPocket = this.position.y >= tableHeight - pocketBuffer;
            
            if (!nearTopPocket && !nearBottomPocket) {
                this.position.x = tableWidth - this.radius;
                this.velocity.x = -this.velocity.x * WALL_DAMPENING;
                wallHit = true;
            }
        }
        
        // Top wall (avoid pocket areas at corners and middle)
        if (this.position.y - this.radius <= 0) {
            // Check if ball is near a pocket opening
            const nearLeftPocket = this.position.x <= pocketBuffer;
            const nearRightPocket = this.position.x >= tableWidth - pocketBuffer;
            const nearMiddlePocket = Math.abs(this.position.x - tableWidth/2) <= pocketBuffer;
            
            if (!nearLeftPocket && !nearRightPocket && !nearMiddlePocket) {
                this.position.y = this.radius;
                this.velocity.y = -this.velocity.y * WALL_DAMPENING;
                wallHit = true;
            }
        }
        
        // Bottom wall (avoid pocket areas at corners and middle)
        if (this.position.y + this.radius >= tableHeight) {
            // Check if ball is near a pocket opening
            const nearLeftPocket = this.position.x <= pocketBuffer;
            const nearRightPocket = this.position.x >= tableWidth - pocketBuffer;
            const nearMiddlePocket = Math.abs(this.position.x - tableWidth/2) <= pocketBuffer;
            
            if (!nearLeftPocket && !nearRightPocket && !nearMiddlePocket) {
                this.position.y = tableHeight - this.radius;
                this.velocity.y = -this.velocity.y * WALL_DAMPENING;
                wallHit = true;
            }
        }

        // Apply friction
        this.velocity = this.velocity.multiply(FRICTION);

        // Stop ball if velocity is too low
        if (this.velocity.magnitude() < MIN_VELOCITY) {
            this.velocity = new Vector2(0, 0);
            this.isMoving = false;
        }

        return { wallHit };
    }

    shoot(power, angle) {
        const speed = power * 10; // Convert power percentage to speed
        console.log('Ball.shoot called:', { power, angle, speed });
        this.velocity = new Vector2(
            Math.cos(angle) * speed,
            Math.sin(angle) * speed
        );
        console.log('New velocity set:', this.velocity);
        this.isMoving = true;
        console.log('Ball isMoving set to:', this.isMoving);
    }

    draw(ctx) {
        // Draw ball shadow
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(this.position.x + 2, this.position.y + 2, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw ball with stronger outline for visibility
        ctx.save();
        
        // Draw outer ring for better visibility
        ctx.strokeStyle = this.color === 'white' ? '#000000' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius + 1, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw ball
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw ball highlight
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(this.position.x - this.radius/3, this.position.y - this.radius/3, this.radius/2.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();

        // Draw number on ball if it's the 8-ball
        if (this.isEightBall) {
            ctx.save();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('8', this.position.x, this.position.y);
            ctx.restore();
        }

        // Draw ball border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// Collision detection
function checkBallCollision(ball1, ball2) {
    const distance = ball1.position.subtract(ball2.position).magnitude();
    return distance < ball1.radius + ball2.radius;
}

// Check if ball is in a pocket
function checkPocketCollision(ball, pockets, pocketRadius) {
    for (const pocket of pockets) {
        const distance = ball.position.subtract(new Vector2(pocket.x, pocket.y)).magnitude();
        if (distance < pocketRadius - ball.radius * 0.5) {
            return pocket;
        }
    }
    return null;
}

// Collision resolution
function resolveBallCollision(ball1, ball2) {
    // Calculate collision normal
    const normal = ball2.position.subtract(ball1.position).normalize();
    
    // Calculate relative velocity
    const relativeVelocity = ball1.velocity.subtract(ball2.velocity);
    
    // Calculate velocity along collision normal
    const velocityAlongNormal = relativeVelocity.dot(normal);
    
    // Don't resolve if balls are separating
    if (velocityAlongNormal > 0) return;
    
    // Calculate restitution (bounciness)
    const restitution = 0.95;
    
    // Calculate impulse scalar (fixed calculation)
    const impulse = 2 * velocityAlongNormal; // Assuming equal mass
    
    // Apply impulse to balls
    const impulseVector = normal.multiply(impulse * restitution);
    ball1.velocity = ball1.velocity.subtract(impulseVector);
    ball2.velocity = ball2.velocity.add(impulseVector);
    
    // Mark balls as moving
    if (ball1.velocity.magnitude() > MIN_VELOCITY) ball1.isMoving = true;
    if (ball2.velocity.magnitude() > MIN_VELOCITY) ball2.isMoving = true;
    
    // Separate balls to prevent overlap
    const overlap = (ball1.radius + ball2.radius) - ball1.position.subtract(ball2.position).magnitude();
    if (overlap > 0) {
        const separation = normal.multiply(overlap / 2);
        ball1.position = ball1.position.subtract(separation);
        ball2.position = ball2.position.add(separation);
    }
}

// Aim line calculation
function calculateAimLine(startPos, mousePos, maxLength = 200) {
    const direction = mousePos.subtract(startPos);
    const distance = Math.min(direction.magnitude(), maxLength);
    const normalizedDir = direction.normalize();
    
    return {
        end: startPos.add(normalizedDir.multiply(distance)),
        angle: Math.atan2(normalizedDir.y, normalizedDir.x)
    };
}

// Bank shot preview calculation
function calculateBankShotPreview(ball, angle, power, tableWidth, tableHeight) {
    const preview = [];
    const tempBall = {
        position: new Vector2(ball.position.x, ball.position.y),
        velocity: new Vector2(Math.cos(angle) * power * 10, Math.sin(angle) * power * 10)
    };
    
    const maxSteps = 500;
    const deltaTime = 0.016; // 60 FPS
    
    for (let i = 0; i < maxSteps; i++) {
        preview.push(new Vector2(tempBall.position.x, tempBall.position.y));
        
        // Update position
        tempBall.position = tempBall.position.add(tempBall.velocity.multiply(deltaTime));
        
        // Check wall collisions
        if (tempBall.position.x - BALL_RADIUS <= 0 || tempBall.position.x + BALL_RADIUS >= tableWidth) {
            tempBall.velocity.x = -tempBall.velocity.x * WALL_DAMPENING;
        }
        if (tempBall.position.y - BALL_RADIUS <= 0 || tempBall.position.y + BALL_RADIUS >= tableHeight) {
            tempBall.velocity.y = -tempBall.velocity.y * WALL_DAMPENING;
        }
        
        // Apply friction
        tempBall.velocity = tempBall.velocity.multiply(FRICTION);
        
        // Stop if velocity is too low
        if (tempBall.velocity.magnitude() < MIN_VELOCITY) break;
    }
    
    return preview;
}