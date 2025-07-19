/**
 * Debounces a function call, ensuring it's executed only after a specified wait time
 * has passed since the last invocation.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to wait.
 * @returns {Function} The debounced function.
 */
function debounce(func, wait) {
  let timeout;
  let savedThis;
  let savedArgs;

  return function executedFunction(...args) {
    savedThis = this;
    savedArgs = args;

    const later = () => {
      clearTimeout(timeout);
      func.apply(savedThis, savedArgs);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * A custom slider component with optional navigation, tracking, drag, and autoplay features.
 * @param {HTMLElement} container The main container element for the slider.
 * @param {Object} options Configuration options for the slider.
 */
function CustomSlider(container, options) {
  if (!(container instanceof HTMLElement)) {
    console.error(
      "CustomSlider: Provided container is not an HTMLElement.",
      container
    );
    return;
  }

  this.container = container;
  this.options = {
    loop: true,
    margin: 0, // Gap between slides
    nav: true, // Show navigation buttons
    showTracker: true, // Show slider progress tracker
    enableSlider: true, // Enable/disable slider functionality entirely
    drag: true, // Enable/disable drag functionality
    autoplay: true, // Autoplay options: false or { delay: 3000, pauseOnHover: true }
    responsive: { 0: { items: 1 } }, // Number of visible items at different breakpoints
    ...options,
  };

  // DOM Elements - initially null, will be assigned after rendering
  this.track = null;
  this.slides = [];
  this.prevBtn = null;
  this.nextBtn = null;
  this.navButtonsDiv = null; // Add reference to the parent div
  this.trackerContainer = null;
  this.trackerThumb = null;

  // Slider State
  this.currentIndex = 0;
  this.visibleSlides = 0; // Updated in getVisibleSlides() and setupSlider()
  this.isDragging = false;
  this.startX = 0;
  this.currentX = 0;
  this.lastTranslateX = 0;
  this.autoplayTimer = null;
  this.lastWidth = this.container.offsetWidth;

  // CRITICAL FIX: Initialize _previousDragState based on the *actual* initial drag setting
  // after getVisibleSlides has determined it for the current viewport size.
  // We call getVisibleSlides here specifically to ensure this.options.drag is set
  // according to the initial breakpoint before _previousDragState is saved.
  this.getVisibleSlides();
  this._previousDragState = this.options.drag;

  // Store debounced functions for proper removal
  this._debouncedResizeHandler = debounce(this._handleResize.bind(this), 200); // Debounce resize more aggressively
  this._handleKeydownBound = this.handleKeydown.bind(this);
  this._handleMouseEnterBound = () => this.stopAutoplay();
  this._handleMouseLeaveBound = () => {
    if (this.options.autoplay) this.initAutoplay();
  };

  // Initial setup
  this._initializeSlider();
}

/**
 * Internal method to initialize the slider's DOM and functionality.
 * Separated from constructor for cleaner setup flow.
 */
CustomSlider.prototype._initializeSlider = function () {
  // First, render the track and slides (they should already be in the HTML)
  this.track = this.container.querySelector(".horizon-slider_track");
  if (!this.track) {
    console.error(
      "CustomSlider: '.slider-track' element not found inside the container.",
      this.container
    );
    this.options.enableSlider = false; // Disable if core elements are missing
  } else {
    this.slides = Array.from(this.track.querySelectorAll(".horizon-slide"));
    if (this.slides.length === 0) {
      console.warn(
        "CustomSlider: No '.slide' elements found in the track. Slider may not function as expected.",
        this.container
      );
      this.options.enableSlider = false; // Disable if no slides
    }
  }

  // Now, render the dynamic navigation and tracker based on options
  this._renderNavigation();

  // Proceed with setup only if slider is enabled and core elements exist
  if (this.options.enableSlider && this.track && this.slides.length > 0) {
    this.container.style.touchAction = "pan-y"; // Prevent default vertical scroll on touch drag

    this.setupSlider();
    this.updateSlider();
    this._updateNavButtonStates(); // Initial call to set button states
    this.initEvents(); // This will now correctly call initDragEvents based on initial `this.options.drag`
    this.initAutoplay();
  } else {
    console.warn(
      "CustomSlider: Slider functionality is disabled or essential elements are missing for container:",
      this.container
    );
  }
};

/**
 * Dynamically renders the navigation buttons and tracker based on slider options.
 */
CustomSlider.prototype._renderNavigation = function () {
  const navArea = document.createElement("div");
  navArea.className = "slider_navigation-area";

  // 1. Render Tracker
  if (this.options.showTracker) {
    this.trackerContainer = document.createElement("div");
    this.trackerContainer.className = "tracker-container";
    this.trackerThumb = document.createElement("div");
    this.trackerThumb.className = "tracker-thumb";
    this.trackerContainer.appendChild(this.trackerThumb);
    navArea.appendChild(this.trackerContainer);
  }

  // 2. Render Navigation Buttons
  if (this.options.nav) {
    this.navButtonsDiv = document.createElement("div"); // Assign to instance property
    this.navButtonsDiv.className = "nav-buttons";

    this.prevBtn = document.createElement("button");
    this.prevBtn.className = "prev-btn";
    this.prevBtn.innerHTML = `
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M9.98862 19.1867L3.3245 12.5226C3.25565 12.4538 3.20104 12.3722 3.16377 12.2823C3.12651 12.1924 3.10733 12.096 3.10733 11.9987C3.10733 11.9014 3.12651 11.8051 3.16377 11.7152C3.20104 11.6253 3.25565 11.5436 3.3245 11.4749L9.98862 4.81074C10.1276 4.6718 10.316 4.59375 10.5125 4.59375C10.709 4.59375 10.8974 4.6718 11.0364 4.81074C11.1753 4.94968 11.2534 5.13813 11.2534 5.33462C11.2534 5.53111 11.1753 5.71955 11.0364 5.85849L5.63565 11.2583L20.1384 11.2583C20.3348 11.2583 20.5232 11.3363 20.662 11.4752C20.8009 11.614 20.8789 11.8024 20.8789 11.9987C20.8789 12.1951 20.8009 12.3835 20.662 12.5223C20.5232 12.6612 20.3348 12.7392 20.1384 12.7392L5.63565 12.7392L11.0364 18.139C11.1753 18.2779 11.2534 18.4664 11.2534 18.6629C11.2534 18.8594 11.1753 19.0478 11.0364 19.1867C10.8974 19.3257 10.709 19.4037 10.5125 19.4037C10.316 19.4037 10.1276 19.3257 9.98862 19.1867Z" fill="currentColor"/>
					</svg>
				`; // Use currentColor for fill to inherit from button CSS
    this.nextBtn = document.createElement("button");
    this.nextBtn.className = "next-btn";
    this.nextBtn.innerHTML = `
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M14.0133 4.80545L20.6775 11.4696C20.7463 11.5383 20.8009 11.62 20.8382 11.7099C20.8754 11.7998 20.8946 11.8961 20.8946 11.9934C20.8946 12.0908 20.8754 12.1871 20.8382 12.277C20.8009 12.3669 20.7463 12.4486 20.6775 12.5173L14.0133 19.1814C13.8744 19.3204 13.686 19.3984 13.4895 19.3984C13.293 19.3984 13.1045 19.3204 12.9656 19.1814C12.8266 19.0425 12.7486 18.8541 12.7486 18.6576C12.7486 18.4611 12.8266 18.2726 12.9656 18.1337L18.3663 12.7339L3.8635 12.7339C3.66712 12.7339 3.47879 12.6559 3.33992 12.517C3.20106 12.3782 3.12305 12.1898 3.12305 11.9934C3.12305 11.7971 3.20106 11.6087 3.33992 11.4699C3.47879 11.331 3.66712 11.253 3.8635 11.253L18.3663 11.253L12.9656 5.8532C12.8266 5.71426 12.7486 5.52581 12.7486 5.32932C12.7486 5.13283 12.8266 4.94439 12.9656 4.80545C13.1045 4.66651 13.293 4.58845 13.4895 4.58845C13.686 4.58845 13.8744 4.66651 14.0133 4.80545Z" fill="currentColor"/>
					</svg>
				`;
    this.navButtonsDiv.appendChild(this.prevBtn);
    this.navButtonsDiv.appendChild(this.nextBtn);
    navArea.appendChild(this.navButtonsDiv);
  }

  // Append the navigation area to the main slider container
  if (this.options.showTracker || this.options.nav) {
    this.container.appendChild(navArea);
  }
};

CustomSlider.prototype.getVisibleSlides = function () {
  const width = window.innerWidth;
  const responsive = this.options.responsive;
  const breakpoints = Object.keys(responsive)
    .map(Number)
    .sort((a, b) => a - b);

  let effectiveItems = this.slides.length > 0 ? 1 : 0; // Default or 0 if no slides
  let effectiveDrag = this.options.drag; // Start with the base drag option from initial options

  // Find the largest breakpoint that is less than or equal to the current width
  for (let i = breakpoints.length - 1; i >= 0; i--) {
    const bp = breakpoints[i];
    if (width >= bp) {
      const breakpointSettings = responsive[bp];
      if (breakpointSettings?.items !== undefined) {
        effectiveItems = breakpointSettings.items;
      }
      // CRITICAL FIX: Only apply drag if defined at this breakpoint, otherwise, use the value from the next smaller breakpoint.
      // Or, if no drag is defined for this breakpoint, the 'effectiveDrag' from a previous (smaller) breakpoint would remain,
      // which is the desired cascading behavior (smallest to largest, but only if explicitly set).
      if (breakpointSettings?.drag !== undefined) {
        effectiveDrag = breakpointSettings.drag;
      }
      // Once we find the largest matching breakpoint, we have our items and drag.
      // If we want a strict "only apply at this exact breakpoint and smaller, but largest overrides",
      // the current loop from largest to smallest is correct.
      break; // Exit the loop as we found the most specific breakpoint
    }
  }

  // Ensure effectiveItems doesn't exceed total slides
  effectiveItems = Math.min(effectiveItems, this.slides.length);

  // Update the instance's options
  this.options.drag = effectiveDrag;
  return effectiveItems;
};

CustomSlider.prototype.setupSlider = function () {
  const gap = this.options.margin;
  this.track.style.gap = `${gap}px`;
  this.calculateSlideWidth();

  // Hide/show dynamically generated elements based on options
  if (this.prevBtn) this.prevBtn.style.display = this.options.nav ? "" : "none";
  if (this.nextBtn) this.nextBtn.style.display = this.options.nav ? "" : "none";
  if (this.trackerContainer)
    this.trackerContainer.style.display = this.options.showTracker
      ? ""
      : "none";

  if (this.trackerThumb && this.options.showTracker) {
    this.adjustThumbWidth();
  }
};

CustomSlider.prototype.calculateSlideWidth = function () {
  this.slides.forEach((slide) => {
    slide.style.width = "auto";
    slide.style.minWidth = "0";
  });

  // We need to calculate based on the current visible slides and container width
  this.visibleSlides = this.getVisibleSlides(); // Recalculate visibleSlides & update this.options.drag
  const containerWidth = this.container.offsetWidth;
  const gap = this.options.margin;

  // Calculate actual slide width, accounting for margins
  this.slideWidth =
    (containerWidth - gap * (this.visibleSlides - 1)) / this.visibleSlides;

  this.slides.forEach((slide) => {
    slide.style.width = `${this.slideWidth}px`;
  });

  this.trackWidth =
    this.slideWidth * this.slides.length + gap * (this.slides.length - 1);
  this.track.style.width = `${this.trackWidth}px`;
};

CustomSlider.prototype.adjustThumbWidth = function () {
  if (this.trackerThumb && this.options.showTracker) {
    const containerWidth = this.trackerContainer.offsetWidth; // Use trackerContainer's width
    const totalSlides = this.slides.length;
    // const scrollableWidth = this.trackWidth - this.container.offsetWidth; // Not directly used for thumb width
    const thumbRatio = this.container.offsetWidth / this.trackWidth; // Ratio of visible to total track
    let thumbWidth = containerWidth * thumbRatio;

    // Ensure a minimum thumb width (e.g., 20px) but not more than container width
    thumbWidth = Math.max(20, thumbWidth);
    thumbWidth = Math.min(thumbWidth, containerWidth);

    this.trackerThumb.style.width = `${thumbWidth}px`;
    this.trackerThumb.style.height = "100%"; // Should already be 100% from CSS, but good to be explicit
    this.trackerThumb.style.borderRadius = "0"; // To avoid overriding CSS
  }
};

CustomSlider.prototype.updateSlider = function () {
  const containerWidth = this.container.offsetWidth;
  // Calculate the maximum negative translation for the track
  const maxOffset = -(this.trackWidth - containerWidth);

  // Calculate the target X position for the track
  let newX = -this.currentIndex * (this.slideWidth + this.options.margin);

  // Ensure the newX does not exceed the valid bounds (0 to maxOffset)
  newX = Math.max(maxOffset, Math.min(0, newX));

  // Directly set transform property for the track using CSS transition
  this.track.style.transform = `translateX(${newX}px)`;
  this.lastTranslateX = newX; // Update lastTranslateX for drag calculations

  // Update the tracker thumb position if visible
  if (
    this.trackerThumb &&
    this.options.showTracker &&
    this.visibleSlides < this.slides.length
  ) {
    const thumbWidth = this.trackerThumb.offsetWidth;
    const trackerContainerWidth = this.trackerContainer.offsetWidth;

    // Calculate the range of movement for the track and thumb
    const trackMovementRange = Math.abs(maxOffset); // Total distance track can move
    const thumbMovementRange = trackerContainerWidth - thumbWidth; // Total distance thumb can move

    if (trackMovementRange > 0) {
      // Avoid division by zero
      // Calculate progress of the track movement
      const progress = Math.abs(newX) / trackMovementRange;
      // Apply that progress to the thumb's movement range
      const thumbX = progress * thumbMovementRange;
      this.trackerThumb.style.transform = `translateX(${thumbX}px)`;
    } else {
      // If track can't move (e.g., all slides visible), center the thumb or reset
      this.trackerThumb.style.transform = `translateX(0px)`;
    }
  }

  // CRITICAL FIX: Update navigation button states after slider position changes
  this._updateNavButtonStates();
};

CustomSlider.prototype.initEvents = function () {
  // Resize event
  window.addEventListener("resize", this._debouncedResizeHandler);

  // Navigation button events
  if (this.prevBtn) {
    this.prevBtn.addEventListener("click", () => this._handleNavClick("prev"));
  }
  if (this.nextBtn) {
    this.nextBtn.addEventListener("click", () => this._handleNavClick("next"));
  }

  // Tracker thumb drag event (Draggable from GSAP)
  if (
    this.trackerThumb &&
    this.trackerContainer &&
    this.options.showTracker &&
    typeof Draggable !== "undefined"
  ) {
    new Draggable(this.trackerThumb, {
      type: "x",
      bounds: {
        minX: 0,
        maxX: this.trackerContainer.offsetWidth - this.trackerThumb.offsetWidth,
      },
      onDrag: () => {
        this.stopAutoplay();
        if (this.visibleSlides < this.slides.length) {
          const thumbX = Draggable.get(this.trackerThumb).x;
          const thumbMovementRange =
            this.trackerContainer.offsetWidth - this.trackerThumb.offsetWidth;
          const trackMovementRange = Math.abs(
            this.trackWidth - this.container.offsetWidth
          );

          if (thumbMovementRange > 0 && trackMovementRange > 0) {
            const progress = thumbX / thumbMovementRange;
            const targetTrackX = -progress * trackMovementRange;

            // Directly apply transform to track, no animation
            this.track.style.transform = `translateX(${targetTrackX}px)`;
            this.lastTranslateX = targetTrackX;

            // Update currentIndex based on track position
            const slideWidthWithGap = this.slideWidth + this.options.margin;
            // Round to nearest index, clamping to ensure it's within valid range
            this.currentIndex = Math.round(
              Math.abs(targetTrackX) / slideWidthWithGap
            );
            this.currentIndex = Math.max(
              0,
              Math.min(
                this.currentIndex,
                this.slides.length - this.visibleSlides
              )
            );
          }
        }
      },
      onDragEnd: () => {
        // After dragging, snap to the nearest slide position
        this.updateSlider();
        if (this.options.autoplay) {
          this.initAutoplay();
        }
      },
    });
  } else if (this.trackerThumb && this.options.showTracker) {
    console.warn(
      "GSAP's Draggable plugin is not loaded. Tracker thumb will not be draggable."
    );
  }

  // Drag events for the main track
  // This is called initially and will depend on the initial this.options.drag value
  if (this.options.drag && this.options.enableSlider) {
    this.initDragEvents();
  }

  // Keyboard navigation
  this.container.addEventListener("keydown", this._handleKeydownBound);

  // Autoplay pause/resume on hover
  if (this.options.autoplay?.pauseOnHover) {
    this.container.addEventListener("mouseenter", this._handleMouseEnterBound);
    this.container.addEventListener("mouseleave", this._handleMouseLeaveBound);
  }
};

/**
 * Handles navigation clicks (prev/next buttons).
 * @param {string} direction 'prev' or 'next'.
 * @private
 */
CustomSlider.prototype._handleNavClick = function (direction) {
  this.stopAutoplay();
  const maxIndex = this.slides.length - this.visibleSlides;

  if (direction === "prev") {
    if (this.options.loop) {
      this.currentIndex =
        this.currentIndex > 0 ? this.currentIndex - 1 : maxIndex;
    } else {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    }
  } else {
    // 'next'
    if (this.options.loop) {
      this.currentIndex =
        this.currentIndex < maxIndex ? this.currentIndex + 1 : 0;
    } else {
      this.currentIndex = Math.min(maxIndex, this.currentIndex + 1);
    }
  }
  this.updateSlider();
  if (this.options.autoplay) {
    this.initAutoplay();
  }
};

/**
 * Updates the disabled/enabled state of navigation buttons based on current slide and loop option.
 * Adds `is-first` and `is-last` classes to the `nav-buttons` div.
 * @private
 */
CustomSlider.prototype._updateNavButtonStates = function () {
  if (!this.options.nav || !this.navButtonsDiv) {
    return; // Do nothing if navigation is disabled or buttons not rendered
  }

  const maxIndex = this.slides.length - this.visibleSlides;

  // If there are fewer slides than visible or only one slide, disable navigation entirely
  if (maxIndex <= 0) {
    this.prevBtn.setAttribute("disabled", "true");
    this.nextBtn.setAttribute("disabled", "true");
    this.navButtonsDiv.classList.add("is-disabled");
    this.navButtonsDiv.classList.remove("is-first", "is-last");
    return;
  } else {
    this.prevBtn.removeAttribute("disabled");
    this.nextBtn.removeAttribute("disabled");
    this.navButtonsDiv.classList.remove("is-disabled");
  }

  if (!this.options.loop) {
    // Non-looping slider
    if (this.currentIndex === 0) {
      this.navButtonsDiv.classList.add("is-first");
      this.prevBtn.setAttribute("disabled", "true");
    } else {
      this.navButtonsDiv.classList.remove("is-first");
      this.prevBtn.removeAttribute("disabled");
    }

    if (this.currentIndex >= maxIndex) {
      this.navButtonsDiv.classList.add("is-last");
      this.nextBtn.setAttribute("disabled", "true");
    } else {
      this.navButtonsDiv.classList.remove("is-last");
      this.nextBtn.removeAttribute("disabled");
    }
  } else {
    // Looping slider - buttons are never truly disabled based on position,
    // but we can still remove classes if they were set by a previous non-loop state.
    this.navButtonsDiv.classList.remove("is-first", "is-last");
    this.prevBtn.removeAttribute("disabled");
    this.nextBtn.removeAttribute("disabled");
  }
};

CustomSlider.prototype.initDragEvents = function () {
  // Ensure handlers are bound only once per instance for removal
  // Check if they are already bound (e.g., if initDragEvents is called multiple times)
  if (!this._handleTouchStartBound) {
    this._handleTouchStartBound = this.handleTouchStart.bind(this);
    this._handleTouchMoveBound = this.handleTouchMove.bind(this);
    this._handleTouchEndBound = this.handleTouchEnd.bind(this);
  }

  this.track.addEventListener("touchstart", this._handleTouchStartBound, {
    passive: true,
  });
  this.track.addEventListener("touchmove", this._handleTouchMoveBound, {
    passive: false,
  }); // touchmove cannot be passive if you want to prevent default scroll
  this.track.addEventListener("touchend", this._handleTouchEndBound, {
    passive: true,
  });
  this.track.addEventListener("mousedown", this._handleTouchStartBound, {
    passive: true,
  });
  this.track.addEventListener("mousemove", this._handleTouchMoveBound, {
    passive: false,
  });
  this.track.addEventListener("mouseup", this._handleTouchEndBound, {
    passive: true,
  });
  this.track.addEventListener("mouseleave", this._handleTouchEndBound, {
    passive: true,
  }); // End drag if mouse leaves track
};

CustomSlider.prototype.removeDragEvents = function () {
  if (!this.track || !this._handleTouchStartBound) {
    // Ensure track exists and handlers were actually bound before attempting to remove
    return;
  }

  this.track.removeEventListener("touchstart", this._handleTouchStartBound);
  this.track.removeEventListener("touchmove", this._handleTouchMoveBound);
  this.track.removeEventListener("touchend", this._handleTouchEndBound);
  this.track.removeEventListener("mousedown", this._handleTouchStartBound);
  this.track.removeEventListener("mousemove", this._handleTouchMoveBound);
  this.track.removeEventListener("mouseup", this._handleTouchEndBound);
  this.track.removeEventListener("mouseleave", this._handleTouchEndBound);

  // Clear bound references to allow garbage collection and indicate events are removed
  this._handleTouchStartBound = null;
  this._handleTouchMoveBound = null;
  this._handleTouchEndBound = null;
};

CustomSlider.prototype.handleTouchStart = function (e) {
  this.stopAutoplay();
  // Use clientX for both touch and mouse events
  this.startX = e.touches ? e.touches[0].clientX : e.clientX;
  this.currentX = this.startX;
  this.isDragging = true;

  // Get current transformX directly from computed style
  const transformStyle = window.getComputedStyle(this.track).transform;
  const matrix = new DOMMatrixReadOnly(transformStyle);
  this.lastTranslateX = matrix.m41; // m41 is the translateX value
};

CustomSlider.prototype.handleTouchMove = function (e) {
  if (!this.isDragging) return;
  // Prevent default scroll behavior only if we are actively dragging horizontally
  if (e.cancelable) {
    e.preventDefault();
  }

  this.currentX = e.touches ? e.touches[0].clientX : e.clientX;

  const containerWidth = this.container.offsetWidth;
  const maxOffset = -(this.trackWidth - containerWidth);
  let newTranslateX = this.lastTranslateX + (this.currentX - this.startX);

  // Apply friction to edges for a "rubber band" effect
  if (newTranslateX > 0) {
    newTranslateX = newTranslateX * 0.3; // Reduce movement beyond start
  } else if (newTranslateX < maxOffset) {
    newTranslateX = maxOffset + (newTranslateX - maxOffset) * 0.3; // Reduce movement beyond end
  }

  // Directly set transform property for the track
  this.track.style.transform = `translateX(${newTranslateX}px)`;
};

CustomSlider.prototype.handleTouchEnd = function () {
  if (!this.isDragging) return;
  this.isDragging = false;

  const containerWidth = this.container.offsetWidth;
  const maxOffset = -(this.trackWidth - containerWidth);
  const slideWidthWithGap = this.slideWidth + this.options.margin;
  const diffX = this.currentX - this.startX;
  const swipeThreshold = slideWidthWithGap * 0.1; // Lower threshold for easier swapping

  let targetIndex = this.currentIndex;

  // Velocity detection (optional, for more responsive swipe) - a simple proxy
  // Note: For true velocity, you'd track time difference as well (e.g., using performance.now())
  const velocity = diffX / 100; // Arbitrary scaling for a rough "velocity"

  if (Math.abs(diffX) > swipeThreshold || Math.abs(velocity) > 0.3) {
    // Swipe left (next)
    if (diffX < 0) {
      targetIndex = Math.min(
        this.currentIndex + 1,
        this.slides.length - this.visibleSlides
      );
    }
    // Swipe right (prev)
    else if (diffX > 0) {
      targetIndex = Math.max(this.currentIndex - 1, 0);
    }
  } else {
    // Snap to the nearest slide based on current track position
    const currentTrackX = new DOMMatrixReadOnly(
      window.getComputedStyle(this.track).transform
    ).m41;
    targetIndex = Math.round(Math.abs(currentTrackX) / slideWidthWithGap);
  }

  // Ensure targetIndex is within valid bounds
  targetIndex = Math.max(
    0,
    Math.min(targetIndex, this.slides.length - this.visibleSlides)
  );
  this.currentIndex = targetIndex;

  this.updateSlider(); // Snap to the calculated target index
  if (this.options.autoplay) {
    this.initAutoplay();
  }
};

CustomSlider.prototype.handleKeydown = function (e) {
  // Only respond to left/right arrow keys
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault(); // Prevent default browser scroll on arrow keys
    this.stopAutoplay();
    const maxIndex = this.slides.length - this.visibleSlides;

    if (e.key === "ArrowLeft") {
      if (this.options.loop) {
        this.currentIndex =
          this.currentIndex > 0 ? this.currentIndex - 1 : maxIndex;
      } else {
        this.currentIndex = Math.max(0, this.currentIndex - 1);
      }
    } else {
      // ArrowRight
      if (this.options.loop) {
        this.currentIndex =
          this.currentIndex < maxIndex ? this.currentIndex + 1 : 0;
      } else {
        this.currentIndex = Math.min(maxIndex, this.currentIndex + 1);
      }
    }
    this.updateSlider();
    if (this.options.autoplay) {
      this.initAutoplay();
    }
  }
};

CustomSlider.prototype.initAutoplay = function () {
  if (this.options.autoplay && this.slides.length > this.visibleSlides) {
    // Only autoplay if there's more than one visible slide to scroll
    this.stopAutoplay();
    const delay = this.options.autoplay.delay || 3000;
    this.autoplayTimer = setInterval(() => {
      const maxIndex = this.slides.length - this.visibleSlides;
      if (maxIndex <= 0) {
        // If all slides are visible, stop autoplay
        this.stopAutoplay();
        return;
      }
      if (this.options.loop) {
        this.currentIndex = (this.currentIndex + 1) % (maxIndex + 1);
      } else {
        // If not looping and at the end, reset to start
        if (this.currentIndex >= maxIndex) {
          this.currentIndex = 0;
        } else {
          this.currentIndex++;
        }
      }
      this.updateSlider();
    }, delay);
  }
};

CustomSlider.prototype.stopAutoplay = function () {
  if (this.autoplayTimer) {
    clearInterval(this.autoplayTimer);
    this.autoplayTimer = null;
  }
};

/**
 * Handles window resize events to recalculate slider layout.
 * @private
 */
CustomSlider.prototype._handleResize = function () {
  // Always get the updated visible slides and drag state based on current window width
  // getVisibleSlides updates this.options.drag based on the current breakpoint
  const newVisibleSlides = this.getVisibleSlides();
  const currentDragState = this.options.drag; // This is the *newly calculated* drag state for the current width

  const dragStateChanged = currentDragState !== this._previousDragState;
  const widthChanged = this.container.offsetWidth !== this.lastWidth;
  const visibleSlidesChanged = newVisibleSlides !== this.visibleSlides;

  // Only proceed with layout updates if something relevant has changed
  if (visibleSlidesChanged || widthChanged || dragStateChanged) {
    this.lastWidth = this.container.offsetWidth;

    // --- CRITICAL FIX PART ---
    // If the drag state has changed, we need to explicitly manage the event listeners.
    if (dragStateChanged) {
      // Always remove existing drag events first to ensure a clean state
      this.removeDragEvents();

      // Then, add them back ONLY if the new state requires dragging AND the slider is enabled
      if (currentDragState && this.options.enableSlider) {
        this.initDragEvents();
      }
      // Update the previous state for the next resize check
      this._previousDragState = currentDragState;
    }
    // --- END CRITICAL FIX PART ---

    this.calculateSlideWidth();
    this.adjustThumbWidth();
    this.updateSlider();
  }

  // Re-initialize Draggable if the bounds have changed for the thumb
  // This is separate from main drag, and its bounds always need updating on resize
  if (
    this.trackerThumb &&
    this.options.showTracker &&
    typeof Draggable !== "undefined"
  ) {
    const draggableInstance = Draggable.get(this.trackerThumb);
    if (draggableInstance) {
      draggableInstance.applyBounds({
        minX: 0,
        maxX: this.trackerContainer.offsetWidth - this.trackerThumb.offsetWidth,
      });
      draggableInstance.update(); // Important: updates Draggable's internal size/position calculations
    }
  }
};

/**
 * Destroys the slider instance, removing all event listeners and clearing timers.
 * This is crucial for memory management and preventing ghost events.
 */
CustomSlider.prototype.destroy = function () {
  this.stopAutoplay();
  window.removeEventListener("resize", this._debouncedResizeHandler);
  this.container.removeEventListener("keydown", this._handleKeydownBound);

  // Kill Draggable instance if it exists
  if (this.trackerThumb && typeof Draggable !== "undefined") {
    const draggableInstance = Draggable.get(this.trackerThumb);
    if (draggableInstance) {
      draggableInstance.kill();
    }
  }
  this.removeDragEvents(); // Removes both touch and mouse drag listeners

  // Remove autoplay hover listeners
  this.container.removeEventListener("mouseenter", this._handleMouseEnterBound);
  this.container.removeEventListener("mouseleave", this._handleMouseLeaveBound);

  // Remove dynamically added navigation area
  const navArea = this.container.querySelector(".slider_navigation-area");
  if (navArea) {
    navArea.remove();
  }

  // Reset inline styles applied by the slider to restore initial HTML state
  if (this.track) {
    this.track.style.transform = "";
    this.track.style.width = "";
    this.track.style.gap = "";
  }
  this.slides.forEach((slide) => {
    slide.style.width = "";
    slide.style.minWidth = "";
  });

  // Clear all references to prevent memory leaks
  this.container = null;
  this.track = null;
  this.slides = [];
  this.prevBtn = null;
  this.nextBtn = null;
  this.navButtonsDiv = null; // Clear the reference
  this.trackerContainer = null;
  this.trackerThumb = null;
  this.options = null; // Clear options reference
  this._previousDragState = null; // Clear the previous drag state reference
  this._debouncedResizeHandler = null; // Clear bound function references
  this._handleKeydownBound = null;
  this._handleMouseEnterBound = null;
  this._handleMouseLeaveBound = null;
};

/**
 * Initializes CustomSlider instances based on a configuration object.
 * Loads Draggable.min.js dynamically if not already present.
 * @param {Object.<string, Object>} config A map where keys are CSS selectors and values are slider options.
 */
function horizonSlider(config) {
  // Draggable is still needed for the trackerThumb functionality.
  // If you remove trackerThumb, you can remove Draggable dependency.
  if (typeof Draggable === "undefined") {
    console.warn(
      "GSAP Draggable not found. Attempting to load Draggable.min.js..."
    );
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.11.4/Draggable.min.js"; // Ensure this path is correct or adjust
    script.onload = () => {
      // GSAP core is a dependency for Draggable. Ensure it's loaded first.
      // If GSAP is loaded via a separate script, it might already be there.
      if (typeof gsap !== "undefined") {
        console.log("Draggable.min.js loaded successfully.");
        _initializeSliders(config);
      } else {
        console.error(
          "GSAP core library must be loaded before Draggable. Please include gsap.min.js."
        );
      }
    };
    script.onerror = () =>
      console.error("Failed to load Draggable script from CDN.");
    document.head.appendChild(script);
  } else {
    _initializeSliders(config);
  }
}

/**
 * Internal helper to initialize slider instances once Draggable is ready.
 * @param {Object.<string, Object>} config
 * @private
 */
function _initializeSliders(config) {
  for (const selector in config) {
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) {
      console.warn(`No elements found for selector: "${selector}"`);
      continue;
    }
    elements.forEach((el) => {
      // Destroy existing instances if they exist to prevent duplicates
      if (
        el.customSliderInstance &&
        typeof el.customSliderInstance.destroy === "function"
      ) {
        el.customSliderInstance.destroy();
      }
      const instance = new CustomSlider(el, config[selector]);
      // Store instance on the DOM element for potential re-initialization or destruction
      el.customSliderInstance = instance;
    });
  }
}

// Expose to window for global access (for CDN usage)
if (typeof window !== "undefined") {
  window.CustomSlider = CustomSlider;
  window.horizonSlider = horizonSlider;
} else {
  console.warn(
    "CustomSlider and horizonSlider not attached to window: Non-browser environment detected."
  );
}
