# Mobile Gameplay Fixes

## Issues Fixed (November 18, 2024)

### 1. **Infinite Re-render Loop** ✅
**Problem:** `Maximum update depth exceeded` error causing app to crash
**Cause:** Calling `setState` for animations inside `requestAnimationFrame` loop
**Solution:** 
- Moved animation state updates out of the render loop
- Created separate `useEffect` with `setInterval` to clean up old animations every 100ms
- Animations are now filtered locally during rendering without triggering re-renders

**Files Changed:** `packages/client/app/game/page.tsx` (lines 749-891)

---

### 2. **Default Movement Bug** ✅
**Problem:** Character moving to the right by default with no user input
**Cause:** Movement system was always emitting movement events, even when joystick wasn't active
**Solution:**
- Added `shouldMove` flag that defaults to `false` on mobile
- Only set to `true` when joystick is actively being used
- Desktop retains always-on mouse movement behavior

**Files Changed:** `packages/client/app/game/page.tsx` (lines 528-584)

---

### 3. **Joystick Zone Limited to Left Half** ✅
**Problem:** Joystick only worked on left half of screen
**Cause:** Joystick zone was set to `w-1/2` (half width)
**Solution:**
- Changed joystick zone from `w-1/2` to `inset-0` (full screen)
- Works anywhere user touches now

**Files Changed:** `packages/client/app/game/page.tsx` (line 1571)

---

### 4. **Insufficient Camera Zoom on Mobile** ✅
**Problem:** Camera not zoomed out enough for mobile gameplay
**Previous:** 4x zoom out (`zoom * 0.25`)
**New:** 6.25x zoom out (`zoom * 0.16`)
**Result:** Much better view of the battlefield on mobile

**Files Changed:** `packages/client/app/game/page.tsx` (line 495)

---

### 5. **UI Buttons Triggering Joystick** ✅
**Problem:** Tapping Split/Eject/Minimap buttons would also trigger joystick movement
**Solution:** Added proper event isolation to all interactive mobile UI elements:

**Protected Elements:**
- Split button (line 1634-1635)
- Eject button (line 1659-1660)
- Minimap panel (line 1501)
- Hide minimap button (line 1507)
- Show minimap button (line 1559)
- Spectator controls (lines 1298, 1304, 1332, 1372)
- Leaderboard panel (line 1383)
- Leaderboard hide button (line 1388)
- Show leaderboard button (lines 1450-1451)

**Techniques Used:**
- `e.stopPropagation()` - Prevents touch from reaching joystick zone
- `e.preventDefault()` - Prevents default touch behavior
- `style={{ pointerEvents: 'auto' }}` - Ensures buttons receive touch events
- `z-50` - Ensures buttons are above joystick zone (`z-30`)

**Files Changed:** `packages/client/app/game/page.tsx` (multiple lines)

---

## Technical Implementation

### Animation Cleanup System
```typescript
// Old (caused infinite loop):
setKillAnimations(prev => prev.filter(a => now - a.startTime < 400));

// New (no re-render):
const activeKillAnimations = killAnimations.filter(a => now - a.startTime < 400);

// Separate cleanup (every 100ms):
useEffect(() => {
  const interval = setInterval(() => {
    const now = Date.now();
    setKillAnimations(prev => prev.filter(a => now - a.startTime < 400));
    setShrinkAnimations(prev => prev.filter(a => now - a.startTime < 300));
    setMergeAnimations(prev => prev.filter(a => now - a.startTime < 500));
  }, 100);
  return () => clearInterval(interval);
}, []);
```

### Movement Control System
```typescript
// Mobile: Only move when joystick active
if (isMobileRef.current) {
  if (joystickActive) {
    // ... calculate movement
    shouldMove = true;
  }
} else {
  // Desktop: Always follow mouse
  // ... calculate movement
  shouldMove = true;
}

if (shouldMove) {
  socket.emit('playerMove', { ... });
}
```

### Touch Event Isolation
```typescript
// Full screen joystick zone
<div className="absolute inset-0 z-30" style={{ touchAction: 'none' }}>
  {/* Joystick logic */}
</div>

// Protected button above zone
<button 
  onPointerDown={(e) => {
    e.stopPropagation();
    e.preventDefault();
    // ... button logic
  }}
  className="z-50"
  style={{ pointerEvents: 'auto' }}
>
  SPLIT
</button>
```

---

## Testing Recommendations

1. **Mobile Device Testing:**
   - Test on physical iPhone/Android device
   - Verify joystick appears anywhere on screen when touched
   - Confirm no default movement occurs
   - Test all buttons (Split, Eject, Minimap toggle)
   - Verify proper zoom level

2. **Performance Testing:**
   - Monitor console for infinite loop warnings
   - Check frame rate during gameplay
   - Verify animation cleanup happens correctly

3. **Edge Cases:**
   - Rapid button tapping while moving
   - Switching between spectator and player modes
   - Rejoining game after disconnect

---

## Known Limitations

1. Joystick position is not persistent between touches
2. Split/Eject use last movement direction if no movement has occurred yet
3. Mobile browser address bar may affect viewport calculations

---

## Future Improvements

1. Add haptic feedback for mobile interactions
2. Implement customizable joystick sensitivity
3. Add visual feedback for button presses
4. Consider adding toggle for fixed vs. floating joystick

