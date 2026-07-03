/* ============================================
   STACKLY AI AGENCY — Main JavaScript
   Animations, Cursor, Scroll Effects
   ============================================ */


class RealAquariumInteraction {
  constructor() {
    this.hero = document.getElementById('hero');
    this.rippleCanvas = document.getElementById('hero-ripple-canvas');
    this.aquariumCanvas = document.getElementById('hero-aquarium-canvas');
    this.bgImage = document.getElementById('hero-bg-image');

    if (!this.hero || !this.rippleCanvas || !this.aquariumCanvas || !this.bgImage) {
      console.error('Aquarium DOM elements not found');
      return;
    }

    this.bgSource = this.bgImage;
    this.isLoaded = false;

    // Set canvas dimensions to match container
    this.resize();

    // Mouse coordinates tracking
    this.mouse = { x: 0, y: 0, lastX: 0, lastY: 0, active: false, speed: 0 };

    this.isWebGLFallback = false;

    if (this.bgImage.complete && this.bgImage.naturalWidth > 0) {
      this.isLoaded = true;
    } else {
      this.bgImage.addEventListener('load', () => {
        this.isLoaded = true;
      }, { once: true });
    }

    // Load transparent real fish PNG assets
    this.initFishAssets();

    // Initialize WebGL water ripples & 2D bubble + fish overlay
    this.initWebGL();
    this.initOverlay();
    this.bindEvents();

    // Start Master Animation Loop
    this.animate(0);
  }

  initFishAssets() {
    this.fishImages = [];
    const assets = [
      'assets/fish_clownfish.webp',
      'assets/fish_blue_tang.webp',
      'assets/fish_yellow_tang.webp',
      'assets/fish_discus_red.webp',
      'assets/fish_green_tang.webp',
      'assets/fish_purple_tang.webp',
      'assets/fish_1.webp',
      'assets/fish_2.webp',
      'assets/fish_3.webp'
    ];

    assets.forEach((src, idx) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        console.log(`Loaded fish texture: ${src}`);
      };
      this.fishImages.push(img);
    });
  }

  resize() {
    this.width = this.hero.clientWidth;
    this.height = this.hero.clientHeight;

    this.rippleCanvas.width = this.width;
    this.rippleCanvas.height = this.height;
    this.aquariumCanvas.width = this.width;
    this.aquariumCanvas.height = this.height;

    if (this.gl) {
      this.gl.viewport(0, 0, this.width, this.height);
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.resize();
    });

    this.hero.addEventListener('mousemove', (e) => {
      const rect = this.hero.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.active = true;

      const dx = this.mouse.x - this.mouse.lastX;
      const dy = this.mouse.y - this.mouse.lastY;
      this.mouse.speed = Math.sqrt(dx * dx + dy * dy);

      // Light WebGL ripples on mouse move
      if (this.mouse.speed > 1.8) {
        this.addRipple(this.mouse.x, this.mouse.y, 6, this.mouse.speed * 0.018);
      }

      this.mouse.lastX = this.mouse.x;
      this.mouse.lastY = this.mouse.y;
    });

    this.hero.addEventListener('mouseleave', () => {
      this.mouse.active = false;
      this.mouse.speed = 0;
    });

    this.hero.addEventListener('click', (e) => {
      const rect = this.hero.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.addRipple(x, y, 16, 0.88);
      this.spawnSplashParticles(x, y);
    });
  }

  /* ------------------------------------------------------------------------
     1. WebGL DYNAMIC RIPPLE SHADER (Uses video frames as textures)
     ------------------------------------------------------------------------ */
  initWebGL() {
    const gl = this.rippleCanvas.getContext('webgl') || this.rippleCanvas.getContext('experimental-webgl');
    if (!gl) {
      console.warn('WebGL not supported, running in direct DOM video fallback mode');
      this.isWebGLFallback = true;
      this.rippleCanvas.style.display = 'none';
      return;
    }
    this.gl = gl;

    // Grid size for the wave propagation simulation (256x256)
    this.gridWidth = 256;
    this.gridHeight = 256;
    this.bufferSize = this.gridWidth * this.gridHeight;
    
    this.buffer1 = new Float32Array(this.bufferSize);
    this.buffer2 = new Float32Array(this.bufferSize);
    this.heightmapData = new Uint8Array(this.bufferSize);
    this.damping = 0.98;

    // Shader sources
    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        v_texCoord.y = 1.0 - v_texCoord.y; // Correct Y coordinate mapping for WebGL textures
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform sampler2D u_heightmap;

      void main() {
        float texelX = 1.0 / 256.0;
        float texelY = 1.0 / 256.0;

        float h_left  = texture2D(u_heightmap, v_texCoord + vec2(-texelX, 0.0)).r;
        float h_right = texture2D(u_heightmap, v_texCoord + vec2( texelX, 0.0)).r;
        float h_up    = texture2D(u_heightmap, v_texCoord + vec2(0.0, -texelY)).r;
        float h_down  = texture2D(u_heightmap, v_texCoord + vec2(0.0,  texelY)).r;

        vec2 offset = vec2(h_left - h_right, h_up - h_down) * 0.038;

        vec4 color = texture2D(u_image, v_texCoord + offset);
        gl_FragColor = color;
      }
    `;

    // Compile shaders and program
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    this.shaderProgram = gl.createProgram();
    gl.attachShader(this.shaderProgram, vs);
    gl.attachShader(this.shaderProgram, fs);
    gl.linkProgram(this.shaderProgram);

    if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) {
      console.error('Shader program linking failed');
      this.isWebGLFallback = true;
      this.rippleCanvas.style.display = 'none';
      return;
    }
    gl.useProgram(this.shaderProgram);

    // Full screen quad geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(this.shaderProgram, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Get shader uniform locations
    this.uImageLocation = gl.getUniformLocation(this.shaderProgram, 'u_image');
    this.uHeightmapLocation = gl.getUniformLocation(this.shaderProgram, 'u_heightmap');

    // Create textures
    this.initWebGLTextures();
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('WebGL compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  initWebGLTextures() {
    const gl = this.gl;
    if (!gl) return;

    // Create background texture (this will capture video frames)
    this.bgTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.bgTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Create heightmap texture
    this.heightmapTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.heightmapTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, this.gridWidth, this.gridHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.heightmapData);
  }

  addRipple(x, y, radius, strength) {
    if (!this.buffer1) return;
    const gx = Math.floor((x / this.width) * this.gridWidth);
    const gy = Math.floor((y / this.height) * this.gridHeight);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx >= 0 && nx < this.gridWidth && ny >= 0 && ny < this.gridHeight) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius) {
            const idx = ny * this.gridWidth + nx;
            this.buffer1[idx] += (1.0 - dist / radius) * strength;
          }
        }
      }
    }
  }

  stepWebGLWaves() {
    const w = this.gridWidth;
    const h = this.gridHeight;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        this.buffer2[idx] = ((this.buffer1[idx - 1] +
                             this.buffer1[idx + 1] +
                             this.buffer1[idx - w] +
                             this.buffer1[idx + w]) / 2) - this.buffer2[idx];
        this.buffer2[idx] *= this.damping;
      }
    }

    // Transfer float displacement heights to bytes texture map
    for (let i = 0; i < this.bufferSize; i++) {
      const val = (this.buffer2[i] + 1.0) * 127.5;
      this.heightmapData[i] = Math.max(0, Math.min(255, val));
    }

    // Swap wave height buffers
    const temp = this.buffer1;
    this.buffer1 = this.buffer2;
    this.buffer2 = temp;
  }

  drawWebGL() {
    const gl = this.gl;
    if (!gl || this.isWebGLFallback) return;

    this.stepWebGLWaves();

    try {
      // 1. Upload the current video frame as texture (updates video dynamically!)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bgTexture);
      
      // Upload frame
      const source = this.bgSource;
      if (this.isLoaded && source.complete && source.naturalWidth > 0) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      }
      gl.uniform1i(this.uImageLocation, 0);

      // 2. Upload heightmap waves texture
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.heightmapTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, this.gridWidth, this.gridHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.heightmapData);
      gl.uniform1i(this.uHeightmapLocation, 1);

      // 3. Render viewport
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } catch (e) {
      // Catch CORS SecurityError (thrown when opening index.html directly via file:// protocol)
      if (e.name === 'SecurityError' || e.message.includes('CORS') || e.message.includes('cross-origin')) {
        console.warn("WebGL Video Texture blocked by browser CORS security (file:// protocol). Falling back to direct DOM video background with overlay.", e);
        this.isWebGLFallback = true;
        this.rippleCanvas.style.display = 'none'; // Hide WebGL ripple canvas to show video underneath
      } else {
        console.error("WebGL Draw Error:", e);
      }
    }
  }

  /* ------------------------------------------------------------------------
     2. 2D OVERLAY ENGINE (Floating bubbles, water splashes, & photorealistic fish)
     ------------------------------------------------------------------------ */
  initOverlay() {
    this.ctx = this.aquariumCanvas.getContext('2d');
    this.bubbles = [];
    this.splashes = [];
    this.fish = [];

    // Spawn initial bubbles
    this.spawnBubbles(14);
    
    // Set spawned fish count to 0 to remove all fish from the hero section
    this.spawnFish(0);
  }

  spawnBubbles(count) {
    for (let i = 0; i < count; i++) {
      this.bubbles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height + this.height,
        radius: Math.random() * 4.5 + 1.2,
        speedY: -(Math.random() * 1.6 + 0.5), // float up
        swaySpeed: Math.random() * 0.02 + 0.01,
        swayOffset: Math.random() * Math.PI * 2,
        opacity: Math.random() * 0.28 + 0.1,
        targetOpacity: Math.random() * 0.28 + 0.1
      });
    }
  }

  spawnFish(count) {
    for (let i = 0; i < count; i++) {
      const isLeft = Math.random() > 0.5;
      const imgIndex = i % 9; // Cycle through our 9 loaded transparent fish WebP textures
      
      this.fish.push({
        x: Math.random() * this.width,
        y: Math.random() * (this.height - 180) + 90,
        size: Math.random() * 30 + 55, // Width representation of the fish image (55px to 85px)
        imgIndex: imgIndex,
        speedX: isLeft ? (Math.random() * 0.8 + 0.4) : -(Math.random() * 0.8 + 0.4),
        speedY: (Math.random() - 0.5) * 0.3,
        wiggleSpeed: Math.random() * 0.08 + 0.04,
        wiggleOffset: Math.random() * Math.PI * 2,
        panicTimer: 0
      });
    }
  }

  spawnSplashParticles(x, y) {
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4.5 + 2;
      this.splashes.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        radius: Math.random() * 3.5 + 1.2,
        opacity: 0.85,
        color: i % 2 === 0 ? 'rgba(255, 255, 255, 0.6)' : 'rgba(56, 107, 183, 0.35)'
      });
    }
  }

  updateOverlay(time) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Update and Draw Bubbles (Anti-Gravity Evasion)
    this.bubbles.forEach((b) => {
      b.y += b.speedY;
      b.x += Math.sin(time * b.swaySpeed + b.swayOffset) * 0.25;

      // Mouse distance checks
      if (this.mouse.active) {
        const dx = b.x - this.mouse.x;
        const dy = b.y - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 180) {
          const force = (180 - dist) / 180;
          const angle = Math.atan2(dy, dx);
          
          // Scatter bubbles and pull them rapidly UPWARDS (defying gravity near cursor)
          b.x += Math.cos(angle) * force * 5.5;
          b.y += (Math.sin(angle) * force * 4) - (force * 7.5);
          b.opacity = 0.85;
        } else {
          b.opacity += (b.targetOpacity - b.opacity) * 0.05;
        }
      } else {
        b.opacity += (b.targetOpacity - b.opacity) * 0.05;
      }

      // Recycle bubbled offscreen
      if (b.y < -50 || b.x < -50 || b.x > this.width + 50) {
        b.y = this.height + 50;
        b.x = Math.random() * this.width;
        b.opacity = b.targetOpacity;
      }

      // Draw bubble structure
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity})`;
      ctx.strokeStyle = `rgba(255, 255, 255, ${b.opacity * 1.5})`;
      ctx.lineWidth = 0.5;
      ctx.fill();
      ctx.stroke();

      // Gleam highlight
      ctx.beginPath();
      ctx.arc(b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity * 1.8})`;
      ctx.fill();
    });

    // 2. Update and Draw Fish (Fear / Evasion Easing Physics with Real PNGs)
    this.fish.forEach((f) => {
      f.wiggleOffset += f.wiggleSpeed;

      let forceX = 0;
      let forceY = 0;

      // Mouse panic proximity check
      if (this.mouse.active) {
        const dx = f.x - this.mouse.x;
        const dy = f.y - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 200) {
          f.panicTimer = 60; // enter panicked run-away mode for 60 frames
          const repelForce = (200 - dist) / 200;
          const angle = Math.atan2(dy, dx);
          
          // Repel fish strongly away from cursor
          forceX = Math.cos(angle) * repelForce * 8.0;
          forceY = Math.sin(angle) * repelForce * 5.0;
        }
      }

      // Physics based on panic/normal states
      if (f.panicTimer > 0) {
        f.panicTimer--;
        f.wiggleSpeed = 0.22; // rapid wiggle when swimming fast
        // Swim fast
        f.x += f.speedX * 2.6 + forceX;
        f.y += f.speedY * 2.6 + forceY;
      } else {
        f.wiggleSpeed = 0.06; // calm, normal swim propulsion
        f.x += f.speedX + forceX;
        f.y += f.speedY + forceY;
      }

      // Border wraps
      const leftBoundary = -100;
      const rightBoundary = this.width + 100;
      
      if (f.speedX > 0 && f.x > rightBoundary) {
        f.x = leftBoundary;
        f.y = Math.random() * (this.height - 180) + 90;
      } else if (f.speedX < 0 && f.x < leftBoundary) {
        f.x = rightBoundary;
        f.y = Math.random() * (this.height - 180) + 90;
      }

      // Constrain vertical bounds
      if (f.y < 50) f.y = 50;
      if (f.y > this.height - 50) f.y = this.height - 50;

      // Draw the photorealistic transparent fish image
      const img = this.fishImages[f.imgIndex];
      if (img && img.complete) {
        ctx.save();
        ctx.translate(f.x, f.y);

        // Determine swimming direction (true if swimming left)
        const isSwimmingLeft = (f.speedX + forceX) < 0;

        // Calculate pitch/tilt angle based on vertical movement
        const tilt = Math.max(-0.4, Math.min(0.4, (f.speedY + forceY) * 0.35));
        ctx.rotate(isSwimmingLeft ? -tilt : tilt);

        // Adjust flip logic depending on default image orientation
        // Blue tang (1), fish 1 (6), and fish 2 (7) naturally face left by default in their source files
        const facesLeftByDefault = (f.imgIndex === 1 || f.imgIndex === 6 || f.imgIndex === 7);
        const shouldFlip = facesLeftByDefault ? !isSwimmingLeft : isSwimmingLeft;

        if (shouldFlip) {
          ctx.scale(-1, 1);
        }

        const aspect = img.height / img.width;
        const fishWidth = f.size;
        const fishHeight = f.size * aspect;

        // Interactive wiggle scaling to simulate body contraction
        const wiggleScale = 1.0 + Math.sin(f.wiggleOffset) * 0.05;

        // Draw clean drop-shadow glow matching the fish's natural color
        ctx.shadowBlur = 15;
        if (f.imgIndex === 0) ctx.shadowColor = '#e24c4a'; // clownfish orange-red
        else if (f.imgIndex === 1) ctx.shadowColor = '#38bdf8'; // blue tang cyan-blue
        else if (f.imgIndex === 2) ctx.shadowColor = '#ecc94b'; // yellow tang gold
        else if (f.imgIndex === 3) ctx.shadowColor = '#f56565'; // red discus red-pink
        else if (f.imgIndex === 4) ctx.shadowColor = '#48bb78'; // green tang green
        else if (f.imgIndex === 5) ctx.shadowColor = '#a855f7'; // purple tang purple
        else if (f.imgIndex === 6) ctx.shadowColor = '#e24c4a'; // user fish 1 (gold/orange)
        else if (f.imgIndex === 7) ctx.shadowColor = '#f43f5e'; // user fish 2 (rose/pink)
        else ctx.shadowColor = '#06b6d4'; // user fish 3 (cyan/blue)

        // Render centered fish image
        ctx.drawImage(
          img,
          -fishWidth / 2,
          -fishHeight / 2,
          fishWidth * wiggleScale,
          fishHeight
        );
        
        ctx.restore();
      }
    });

    // 3. Update and Draw Click Splashes
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy -= 0.08;
      s.opacity -= 0.028;
      s.radius *= 0.97;

      if (s.opacity <= 0 || s.radius < 0.2) {
        this.splashes.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.globalAlpha = s.opacity;
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ------------------------------------------------------------------------
     3. MASTER ANIMATION LOOP
     ------------------------------------------------------------------------ */
  animate(timestamp) {
    const time = timestamp * 0.05;

    // Render WebGL ripple deformation on top of video frames (if not fallback)
    this.drawWebGL();

    // Render Overlay bubble & interactive fish physics
    this.updateOverlay(time);

    requestAnimationFrame((t) => this.animate(t));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // ── Preloader ──
  const preloader = document.querySelector('.preloader');
  if (preloader) {
    window.addEventListener('load', () => {
      setTimeout(() => preloader.classList.add('hidden'), 500);
    });
    // Fallback
    setTimeout(() => preloader.classList.add('hidden'), 3000);
  }

  // ── Custom Cursor ──
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (!isTouchDevice) {
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    document.body.appendChild(cursor);

    const cursorDot = document.createElement('div');
    cursorDot.className = 'cursor-dot';
    document.body.appendChild(cursorDot);

    let mouseX = 0, mouseY = 0;
    let cursorX = 0, cursorY = 0;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      cursorDot.style.left = mouseX + 'px';
      cursorDot.style.top = mouseY + 'px';
    });

    // Smooth cursor follow
    function animateCursor() {
      cursorX += (mouseX - cursorX) * 0.15;
      cursorY += (mouseY - cursorY) * 0.15;
      cursor.style.left = cursorX + 'px';
      cursor.style.top = cursorY + 'px';
      requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // Hover effects on interactive elements
    const hoverTargets = document.querySelectorAll('a, button, .btn, .card, .blog-card, .accordion-header, .pricing-card, input, textarea, .flip-card, .hamburger');
    hoverTargets.forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('cursor-hover'));
    });

    // Click effect
    document.addEventListener('mousedown', () => cursor.classList.add('cursor-click'));
    document.addEventListener('mouseup', () => cursor.classList.remove('cursor-click'));

    // Magnetic effect on buttons
    const magneticBtns = document.querySelectorAll('.btn-primary, .btn-outline');
    magneticBtns.forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  // ── Hero Spotlight Effect ──
  const heroWrapper = document.querySelector('.hero-image-wrapper');
  if (heroWrapper && !isTouchDevice) {
    const spotlight = heroWrapper.querySelector('.hero-spotlight');
    if (spotlight) {
      heroWrapper.addEventListener('mousemove', (e) => {
        const rect = heroWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        spotlight.style.background = `
          radial-gradient(circle 120px at ${x}px ${y}px,
            rgba(226, 76, 74, 0.3) 0%,
            rgba(56, 107, 183, 0.15) 30%,
            transparent 70%),
          radial-gradient(circle 60px at ${x}px ${y}px,
            rgba(255, 255, 255, 0.25) 0%,
            transparent 60%)
        `;

        // Subtle image warp
        const centerX = (x / rect.width - 0.5) * 10;
        const centerY = (y / rect.height - 0.5) * 10;
        const img = heroWrapper.querySelector('img');
        if (img) {
          img.style.transform = `scale(1.05) translate(${centerX}px, ${centerY}px)`;
        }
      });

      heroWrapper.addEventListener('mouseleave', () => {
        spotlight.style.background = 'transparent';
        const img = heroWrapper.querySelector('img');
        if (img) {
          img.style.transform = 'scale(1)';
        }
      });
    }
  }

  // ── Navbar Scroll Effect ──
  const navbar = document.querySelector('.navbar');
  const scrollTop = document.querySelector('.scroll-top');

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;

    // Navbar
    if (navbar) {
      if (scrollY > 80) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }

    // Scroll to top button
    if (scrollTop) {
      if (scrollY > 500) {
        scrollTop.classList.add('visible');
      } else {
        scrollTop.classList.remove('visible');
      }
    }
  });

  // Scroll to top click
  if (scrollTop) {
    scrollTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── Mobile Menu ──
  const hamburger = document.querySelector('.hamburger');
  const navMenu = document.querySelector('.navbar-menu');
  const menuOverlay = document.querySelector('.menu-overlay');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navMenu.classList.toggle('active');
      if (menuOverlay) menuOverlay.classList.toggle('active');
      document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    if (menuOverlay) {
      menuOverlay.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
        document.body.style.overflow = '';
      });
    }

    // Close menu on link click
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        if (menuOverlay) menuOverlay.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // ── Scroll Reveal Animations ──
  const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-zoom, .reveal-flip, .stagger-children');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // ── Counter Animation ──
  const counters = document.querySelectorAll('[data-count]');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
        entry.target.classList.add('counted');
        const target = parseInt(entry.target.getAttribute('data-count'));
        const suffix = entry.target.getAttribute('data-suffix') || '';
        const duration = 2000;
        const start = 0;
        const startTime = performance.now();

        function updateCounter(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.floor(start + (target - start) * eased);
          entry.target.textContent = current.toLocaleString() + suffix;

          if (progress < 1) {
            requestAnimationFrame(updateCounter);
          } else {
            entry.target.textContent = target.toLocaleString() + suffix;
          }
        }
        requestAnimationFrame(updateCounter);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(c => counterObserver.observe(c));

  // ── Typing Effect ──
  const typingElement = document.querySelector('.typing-text');
  if (typingElement) {
    const phrases = JSON.parse(typingElement.getAttribute('data-phrases') || '[]');
    if (phrases.length > 0) {
      let phraseIndex = 0;
      let charIndex = 0;
      let isDeleting = false;
      let typingSpeed = 80;

      function typeEffect() {
        const currentPhrase = phrases[phraseIndex];

        if (isDeleting) {
          typingElement.textContent = currentPhrase.substring(0, charIndex - 1);
          charIndex--;
          typingSpeed = 40;
        } else {
          typingElement.textContent = currentPhrase.substring(0, charIndex + 1);
          charIndex++;
          typingSpeed = 80;
        }

        if (!isDeleting && charIndex === currentPhrase.length) {
          isDeleting = true;
          typingSpeed = 2000; // Pause at end
        } else if (isDeleting && charIndex === 0) {
          isDeleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          typingSpeed = 500; // Pause before next
        }

        setTimeout(typeEffect, typingSpeed);
      }
      typeEffect();
    }
  }

  // ── 3D Tilt Effect on Cards ──
  if (!isTouchDevice) {
    const tiltCards = document.querySelectorAll('.card-3d');
    tiltCards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = (y - centerY) / centerY * -8;
        const rotateY = (x - centerX) / centerX * 8;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
      });
    });
  }

  // ── FAQ Accordion ──
  const accordionHeaders = document.querySelectorAll('.accordion-header');
  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const body = item.querySelector('.accordion-body');
      const isActive = item.classList.contains('active');

      // Close all
      document.querySelectorAll('.accordion-item').forEach(i => {
        i.classList.remove('active');
        i.querySelector('.accordion-body').style.maxHeight = null;
      });

      // Open clicked (if wasn't active)
      if (!isActive) {
        item.classList.add('active');
        body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });

  // ── Parallax Effect ──
  if (!isTouchDevice) {
    const parallaxElements = document.querySelectorAll('.floating-shape');
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      parallaxElements.forEach((el, index) => {
        const speed = (index + 1) * 0.3;
        el.style.transform = `translateY(${scrollY * speed * 0.1}px)`;
      });
    });
  }

  // ── Smooth scroll for anchor links ──
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── Form Validation ──
  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let isValid = true;

      // Remove old errors
      form.querySelectorAll('.form-error').forEach(err => err.remove());
      form.querySelectorAll('.form-input.error, .form-textarea.error').forEach(el => el.classList.remove('error'));

      // Validate required fields
      form.querySelectorAll('[required]').forEach(field => {
        if (!field.value.trim()) {
          isValid = false;
          field.classList.add('error');
          field.style.borderColor = '#EF4444';
          const error = document.createElement('span');
          error.className = 'form-error';
          error.style.cssText = 'color: #EF4444; font-size: 0.8rem; margin-top: 0.25rem; display: block;';
          error.textContent = 'This field is required';
          field.parentNode.appendChild(error);
        }
      });

      // Validate email
      form.querySelectorAll('input[type="email"]').forEach(email => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (email.value && !emailRegex.test(email.value)) {
          isValid = false;
          email.classList.add('error');
          email.style.borderColor = '#EF4444';
          const error = document.createElement('span');
          error.className = 'form-error';
          error.style.cssText = 'color: #EF4444; font-size: 0.8rem; margin-top: 0.25rem; display: block;';
          error.textContent = 'Please enter a valid email address';
          email.parentNode.appendChild(error);
        }
      });

      if (isValid) {
        // Success animation
        const btn = form.querySelector('button[type="submit"], .btn');
        if (btn) {
          const originalText = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-check"></i> Sent Successfully!';
          btn.style.background = '#10B981';
          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
            form.reset();
          }, 3000);
        }
      }
    });

    // Remove error on input
    form.querySelectorAll('.form-input, .form-textarea').forEach(field => {
      field.addEventListener('input', () => {
        field.classList.remove('error');
        field.style.borderColor = '';
        const error = field.parentNode.querySelector('.form-error');
        if (error) error.remove();
      });
    });
  });

  // ── Active Nav Link ──
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar-menu a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // ── Marquee Duplication ──
  const marqueeTrack = document.querySelector('.marquee-track');
  if (marqueeTrack) {
    // Clone items for seamless loop
    const items = marqueeTrack.innerHTML;
    marqueeTrack.innerHTML = items + items;
  }

  // ── Password Toggle ──
  document.querySelectorAll('.password-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const input = toggle.parentElement.querySelector('input');
      const icon = toggle.querySelector('i');
      if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
      } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
      }
    });
  });

  // ── Initialize first accordion item ──
  const firstAccordion = document.querySelector('.accordion-item');
  if (firstAccordion) {
    firstAccordion.classList.add('active');
    const body = firstAccordion.querySelector('.accordion-body');
    if (body) body.style.maxHeight = body.scrollHeight + 'px';
  }

  // ── AI Video Showcase Section ──
  const videoContainer = document.getElementById('aiVideoContainer');
  const videoFile = document.getElementById('aiVideoFile');
  const cursorTracker = document.getElementById('videoCursorTracker');
  const wordStage = document.getElementById('aiWordStage');

  if (videoContainer && videoFile && cursorTracker) {
    let wordsInterval = null;
    let isHoveringVideo = false;
    let wordSideToggle = true;
    let wordIndex = 0;
    let activeWordCount = 0;

    const aiWordsList = [
      'AI Automation', 'Smart Solutions', 'Machine Learning', 'Neural Networks',
      'Deep Learning', 'AI Strategy', 'Intelligent Systems', 'Data Intelligence',
      'Predictive Analytics', 'Computer Vision', 'Natural Language AI', 'AI Consulting',
      'Custom AI Models', 'Stackly AI Agency', 'Generative AI', 'AI Transformation',
      'Text-to-Video', 'AI Video Studio', 'Creative Automation', 'Digital Intelligence',
      'Automate Smarter', 'Build with AI', 'Future-Ready AI', 'Scale with Intelligence',
      'AI-Powered Growth', 'Next-Gen Solutions', 'Vision to Reality', 'Intelligent Automation',
      'Smart Business AI', 'Cinematic AI Ads', 'Zero Studio Setup', 'Script to Screen'
    ];

    const wordTones = ['tone-warm', 'tone-coral', 'tone-sky'];
    const wordPositions = ['24%', '38%', '52%', '66%'];

    function updateCursorPosition(clientX, clientY) {
      const rect = videoContainer.getBoundingClientRect();
      cursorTracker.style.left = `${clientX - rect.left}px`;
      cursorTracker.style.top = `${clientY - rect.top}px`;
    }

    function setPlayCursorState(isPlaying) {
      cursorTracker.textContent = isPlaying ? 'Pause' : 'Play';
      cursorTracker.classList.toggle('is-playing', isPlaying);
      if (isHoveringVideo) {
        cursorTracker.classList.add('is-visible');
      }
    }

    videoContainer.addEventListener('mousemove', (e) => {
      updateCursorPosition(e.clientX, e.clientY);
    });

    videoContainer.addEventListener('mouseenter', (e) => {
      isHoveringVideo = true;
      document.body.classList.add('hide-custom-cursor');
      updateCursorPosition(e.clientX, e.clientY);
      cursorTracker.classList.add('is-visible');
    });

    videoContainer.addEventListener('mouseleave', () => {
      isHoveringVideo = false;
      document.body.classList.remove('hide-custom-cursor');
      cursorTracker.classList.remove('is-visible');
    });

    function spawnWord() {
      if (!wordStage || activeWordCount >= 2) return;

      const useLeftSide = wordSideToggle;
      wordSideToggle = !wordSideToggle;
      const styleMod = wordIndex % 3;
      const useOutlineStyle = styleMod === 0;
      const toneClass = styleMod === 1 ? wordTones[wordIndex % wordTones.length] : '';

      const wordEl = document.createElement('span');
      wordEl.className = `floating-word ${useLeftSide ? 'side-left' : 'side-right'}${useOutlineStyle ? ' style-outline' : ''}${toneClass ? ` ${toneClass}` : ''}`;
      wordEl.textContent = aiWordsList[wordIndex % aiWordsList.length];
      wordIndex += 1;
      wordEl.style.top = wordPositions[Math.floor(Math.random() * wordPositions.length)];

      activeWordCount += 1;
      wordStage.appendChild(wordEl);

      setTimeout(() => {
        wordEl.remove();
        activeWordCount = Math.max(0, activeWordCount - 1);
      }, 5500);
    }

    function startWordStream() {
      if (wordsInterval) return;
      spawnWord();
      wordsInterval = setInterval(spawnWord, 3400);
    }

    function stopWordStream() {
      if (wordsInterval) {
        clearInterval(wordsInterval);
        wordsInterval = null;
      }
      setTimeout(() => {
        if (!wordsInterval && wordStage) {
          wordStage.querySelectorAll('.floating-word').forEach((el) => el.remove());
          activeWordCount = 0;
        }
      }, 5600);
    }

    function toggleVideoPlayback() {
      if (videoFile.paused) {
        videoFile.muted = false;
        videoFile.play().catch((err) => {
          console.error('Video play failed:', err);
        });
      } else {
        videoFile.pause();
      }
    }

    videoContainer.addEventListener('click', (e) => {
      updateCursorPosition(e.clientX, e.clientY);
      cursorTracker.classList.add('is-visible');
      toggleVideoPlayback();
    });

    videoFile.addEventListener('play', () => {
      setPlayCursorState(true);
      startWordStream();
    });

    videoFile.addEventListener('pause', () => {
      setPlayCursorState(false);
      stopWordStream();
    });
  }
  // ── Hero Aquarium Interaction ──
  window.aquarium = new RealAquariumInteraction();
});
