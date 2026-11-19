/** Keyboard + pointer-lock mouse input, sampled per frame. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.down = new Set();
    this.pressed = new Set(); // edges this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.buttons = new Set();
    this.clicked = new Set();

    this._onKeyDown = (e) => {
      if (!this.active) return;
      if (this._shouldPreventDefault(e)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    };
    this._onKeyUp = (e) => {
      if (this.active && this._shouldPreventDefault(e)) e.preventDefault();
      this.down.delete(e.code);
    };
    this._clear = () => {
      this.down.clear();
      this.pressed.clear();
      this.buttons.clear();
      this.clicked.clear();
      this.mouseDX = this.mouseDY = 0;
      this.active = false;
    };

    addEventListener("keydown", this._onKeyDown);
    addEventListener("keyup", this._onKeyUp);
    addEventListener("blur", this._clear);
    addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") this._clear();
    });
    document.addEventListener("pointerlockchange", () => {
      if (!this.locked) this._clear();
    });
    document.addEventListener("pointerlockerror", this._clear);

    canvas.addEventListener("mousedown", (e) => {
      this.active = true;
      e.preventDefault();
      if (!this.locked) canvas.requestPointerLock?.();
      this.buttons.add(e.button);
      this.clicked.add(e.button);
    });
    addEventListener("mouseup", (e) => this.buttons.delete(e.button));
    addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  _shouldPreventDefault(event) {
    return event.code === "Space"
      || event.code === "Tab"
      || event.code.startsWith("Arrow")
      || event.code === "Escape"
      || event.code.startsWith("Key")
      || event.code.startsWith("Digit")
      || event.code.startsWith("Control")
      || event.code.startsWith("Shift")
      || event.code.startsWith("Alt")
      || event.code.startsWith("Meta");
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasClicked(button = 0) {
    return this.clicked.has(button);
  }

  /** Mouse deltas are consumed by whoever reads them first each frame. */
  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
  }
}
